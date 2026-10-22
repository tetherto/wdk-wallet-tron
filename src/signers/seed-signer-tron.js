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
import { HDKey } from '@scure/bip32'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { DisposalError, ValueError } from '@tetherto/wdk-wallet'

import { getTronAddress, parseDerivationPath, signMessage, signTransaction } from './utils.js'

/** @typedef {import('./signer-tron.js').ISignerTron} ISignerTron */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */

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
}

/**
 * Derives an HD node along the given child indexes, erasing every node it leaves behind,
 * including the starting one, so that only the returned node holds key material. A node is
 * erased even when deriving its child throws, so a failed derivation leaves no key material behind.
 *
 * @param {HDKey} node - The starting HD node.
 * @param {number[]} indexes - The child indexes to derive.
 * @returns {HDKey} The HD node at the end of the path.
 */
function deriveAndScrub (node, indexes) {
  for (const index of indexes) {
    let child

    try {
      child = node.deriveChild(index)
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
   * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {string} [path] - An absolute BIP-32 path (default: "m/44'/195'").
   * @throws {ValueError} If the seed phrase is invalid, if the seed is not 16 to 64 bytes, or if the path is not valid.
   */
  constructor (seed, path = BIP_44_TRON_DERIVATION_PATH_PREFIX) {
    const ownsSeed = typeof seed === 'string'

    if (ownsSeed) {
      if (!bip39.validateMnemonic(seed)) {
        throw new ValueError('The seed phrase is invalid.')
      }
    } else if (seed.length < 16 || seed.length > 64) {
      throw new ValueError('The seed must be between 16 and 64 bytes.')
    }

    const seedBytes = ownsSeed ? bip39.mnemonicToSeedSync(seed) : seed

    let indexes, master

    try {
      indexes = parseDerivationPath(path, true)

      master = HDKey.fromMasterSeed(seedBytes)
    } finally {
      if (ownsSeed) {
        sodium_memzero(seedBytes)
      }
    }

    this._init(deriveAndScrub(master, indexes), path)
  }

  /**
   * Binds the signer to an HD node.
   *
   * @private
   * @param {HDKey} node - The HD node at the signer's path.
   * @param {string} path - The signer's absolute path.
   */
  _init (node, path) {
    /** @private */
    this._node = node

    /** @private */
    this._path = path

    /** @private */
    this._address = getTronAddress(node.publicKey)

    /** @private */
    this._disposed = false
  }

  /**
   * Whether this signer can derive child signers. Always true: every seed signer holds an
   * HD node and can derive below its own path.
   *
   * @type {true}
   */
  get isDerivable () {
    return true
  }

  /**
   * The signer's absolute derivation path.
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
   * The account's key pair. The private key is null once the signer has been disposed.
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
   * Derives a child signer relative to this signer's own path (e.g. calling derive("0'/0/1") on
   * a signer at "m/44'/195'" yields a child at "m/44'/195'/0'/0/1"). The child owns an independent
   * copy of its key and can itself derive further.
   *
   * @param {string} relPath - The path to derive, relative to this signer's own path.
   * @returns {Promise<SeedSignerTron>} The derived child signer.
   * @throws {ValueError} If the path is not valid.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async derive (relPath) {
    if (this._disposed) {
      throw new DisposalError('The signer has been disposed.')
    }

    const [first, ...rest] = parseDerivationPath(relPath)

    const node = deriveAndScrub(this._node.deriveChild(first), rest)

    const signer = Object.create(SeedSignerTron.prototype)
    signer._init(node, `${this._path}/${relPath}`)

    return signer
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
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
    if (this._disposed) {
      throw new DisposalError('The signer has been disposed.')
    }

    return signMessage(this._node.privateKey, message)
  }

  /**
   * Signs a transaction, keeping any signatures it already carries.
   *
   * @param {Transaction | SignedTransaction} transaction - The tron web transaction.
   * @returns {Promise<SignedTransaction>} The transaction with this signer's signature appended.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async signTransaction (transaction) {
    if (this._disposed) {
      throw new DisposalError('The signer has been disposed.')
    }

    return signTransaction(this._node.privateKey, transaction)
  }

  /**
   * Disposes the signer, securely erasing its private key and chain code from memory.
   */
  dispose () {
    scrub(this._node)

    this._disposed = true
  }
}
