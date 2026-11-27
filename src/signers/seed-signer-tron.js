// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import * as bip39 from 'bip39'
import { HARDENED_OFFSET, HDKey } from '@scure/bip32'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { DisposalError, ValueError } from '@tetherto/wdk-wallet'

import { getTronAddress, parseDerivationPath, signMessage, signTransaction, signTypedData } from './signer-tron.js'

/** @typedef {import('./signer-tron.js').ISignerTron} ISignerTron */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */
/** @typedef {import('./signer-tron.js').TypedData} TypedData */

/**
 * Absolute BIP-44 prefix for Tron (m/purpose'/coin_type').
 *
 * @internal
 */
export const BIP_44_TRON_DERIVATION_PATH_PREFIX = "m/44'/195'"

/**
 * Securely erases an HD node's private key and chain code from memory.
 *
 * @param {HDKey} node - The HD node.
 */
function scrub (node) {
  if (node.privKeyBytes) {
    sodium_memzero(node.privKeyBytes)
  }

  if (node.chainCode) {
    sodium_memzero(node.chainCode)
  }

  node.privKeyBytes = undefined
  node.privKey = undefined
  node.chainCode = null
}

/**
 * Returns the child index of a path segment.
 *
 * @param {string} segment - The path segment (e.g. "44'" or "0").
 * @returns {number} The child index, with the hardened offset added if the segment is hardened.
 */
function toChildIndex (segment) {
  const index = parseInt(segment, 10)

  return segment.endsWith("'") ? HARDENED_OFFSET + index : index
}

/**
 * Derives an HD node along the given path segments, erasing every node it leaves behind,
 * including the starting one, so that only the returned node holds key material. A node is
 * erased even when deriving its child throws, so a failed derivation leaves no key material behind.
 *
 * @param {HDKey} node - The starting HD node.
 * @param {string[]} segments - The path segments to derive.
 * @returns {HDKey} The HD node at the end of the path.
 */
function deriveAndScrub (node, segments) {
  for (const segment of segments) {
    let child

    try {
      child = node.deriveChild(toChildIndex(segment))
    } finally {
      scrub(node)
    }

    node = child
  }

  return node
}

/**
 * Signer implementation that derives keys from a BIP-39 seed using a BIP-32 path.
 *
 * Every signer holds exactly one HD node (the Tron BIP-44 coin node "m/44'/195'" by default, ready to
 * derive accounts below it) and owns an independent copy of its key, so disposing one never affects
 * its parent, children or siblings. Intermediate nodes built while deriving (including the master
 * node) are erased as soon as they are no longer needed.
 *
 * @implements {ISignerTron}
 */
export default class SeedSignerTron {
  /**
   * Creates a new seed signer.
   *
   * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {string} [path] - An absolute BIP-32 path (default: "m/44'/195'").
   * @throws {ValueError} If the seed phrase is invalid, if the seed is not 16 to 64 bytes, or if the path is not valid.
   * @see https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
   */
  constructor (seed, path = BIP_44_TRON_DERIVATION_PATH_PREFIX) {
    const ownsSeed = typeof seed === 'string'

    if (ownsSeed && !bip39.validateMnemonic(seed)) {
      throw new ValueError('The seed phrase is invalid.')
    }

    const seedBytes = ownsSeed ? bip39.mnemonicToSeedSync(seed) : seed

    let segments, master

    try {
      segments = parseDerivationPath(path, { requireAbsolute: true })

      try {
        master = HDKey.fromMasterSeed(seedBytes)
      } catch (error) {
        if (error.message.startsWith('HDKey: seed length must be between 128 and 512 bits')) {
          throw new ValueError('The seed must be between 16 and 64 bytes.', { cause: error })
        }

        throw error
      }
    } finally {
      if (ownsSeed) {
        sodium_memzero(seedBytes)
      }
    }

    this._init(path, deriveAndScrub(master, segments))
  }

  /**
   * Whether the signer supports account derivation via {@link derive}.
   *
   * @type {true}
   */
  get isDerivable () {
    return true
  }

  /**
   * The BIP 0032 derivation path, or null if the signer is not bound to a derivation position
   * (e.g. private-key signers). A seed signer is always bound, so this is its absolute path.
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * True if the signer has been disposed.
   *
   * @type {boolean}
   */
  get disposed () {
    return this._disposed
  }

  /**
   * The signer's key pair, or null if the signer does not allow retrieving key material (e.g. hardware
   * signers). A seed signer always exposes its key pair; the private key is null once it is disposed.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._node.privateKey ?? null,
      publicKey: this._node.publicKey
    }
  }

  /**
   * Derive a child signer using a relative path (e.g., "0'/0/0"). The path is relative to this signer's
   * own path: calling derive("0'/0/1") on a signer at "m/44'/195'" yields a child at "m/44'/195'/0'/0/1".
   * The child owns an independent copy of its key and can itself derive further.
   *
   * @param {string} relPath - The path to derive, relative to this signer's own path.
   * @returns {Promise<SeedSignerTron>} The derived child signer.
   * @throws {ValueError} If the path is absolute or not a valid BIP-32 path.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async derive (relPath) {
    this._guardDisposed()

    if (relPath === 'm' || relPath.startsWith('m/')) {
      throw new ValueError('The derivation path must be relative (e.g. "0\'/0/0").')
    }

    const [first, ...rest] = parseDerivationPath(relPath)

    const node = deriveAndScrub(this._node.deriveChild(toChildIndex(first)), rest)

    const signer = Object.create(SeedSignerTron.prototype)
    signer._init(`${this._path}/${relPath}`, node)

    return signer
  }

  /**
   * Returns the signer's address.
   *
   * @returns {Promise<string>} The signer's address.
   */
  async getAddress () {
    return this._address
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async sign (message) {
    this._guardDisposed()

    return signMessage(this._node.privateKey, message)
  }

  /**
   * Signs a transaction.
   *
   * @param {Transaction} unsignedTx - The unsigned tron web transaction.
   * @returns {Promise<SignedTransaction>} The signed transaction.
   * @throws {ValueError} If the transaction id is not a 32-byte hex string.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async signTransaction (unsignedTx) {
    this._guardDisposed()

    return signTransaction(this._node.privateKey, unsignedTx)
  }

  /**
   * Signs typed data according to TIP-712.
   *
   * @param {TypedData} typedData - The typed data to sign.
   * @returns {Promise<string>} The signature, as a 0x-prefixed 65-byte hex string (r ‖ s ‖ v, with v in {27, 28}).
   * @throws {DisposalError} If the signer has been disposed.
   */
  async signTypedData (typedData) {
    this._guardDisposed()

    return signTypedData(this._node.privateKey, typedData)
  }

  /**
   * Disposes the signer, erasing its private key and chain code from memory.
   */
  dispose () {
    scrub(this._node)

    this._disposed = true
  }

  /** @private */
  _guardDisposed () {
    if (this.disposed) {
      throw new DisposalError('The signer has been disposed.')
    }
  }

  /** @private */
  _init (path, node) {
    /** @private */
    this._node = node

    /** @private */
    this._path = path

    /** @private */
    this._address = getTronAddress(node.publicKey)

    /** @private */
    this._disposed = false
  }
}
