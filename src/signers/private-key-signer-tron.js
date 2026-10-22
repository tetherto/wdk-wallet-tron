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

import { secp256k1 } from '@noble/curves/secp256k1'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import { DisposalError, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

import { getTronAddress, signMessage, signTransaction } from './utils.js'

/** @typedef {import('./signer-tron.js').ISignerTron} ISignerTron */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */

const HEX_PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/

const INVALID_PRIVATE_KEY_MESSAGE = 'The private key must be a valid 32-byte secp256k1 key (hex or bytes).'

/**
 * Copies a private key into bytes owned by the signer.
 *
 * @param {string | Uint8Array} privateKey - The private key's hex string (with or without 0x) or bytes.
 * @returns {Uint8Array} A new 32-byte private key.
 * @throws {ValueError} If the key is not a valid secp256k1 private key.
 */
function copyPrivateKey (privateKey) {
  let key

  if (typeof privateKey === 'string') {
    if (!HEX_PRIVATE_KEY_PATTERN.test(privateKey)) {
      throw new ValueError(INVALID_PRIVATE_KEY_MESSAGE)
    }

    const decoded = Buffer.from(privateKey.replace(/^0x/, ''), 'hex')
    key = Uint8Array.from(decoded)
    sodium_memzero(decoded)
  } else {
    key = Uint8Array.from(privateKey)
  }

  if (!secp256k1.utils.isValidSecretKey(key)) {
    sodium_memzero(key)
    throw new ValueError(INVALID_PRIVATE_KEY_MESSAGE)
  }

  return key
}

/**
 * Signer backed by a single raw secp256k1 private key (non-HD).
 *
 * Does not support HD derivation. Signs messages and transactions directly with the key.
 *
 * @implements {ISignerTron}
 */
export default class PrivateKeySignerTron {
  /**
   * Creates a new private key signer.
   *
   * The supplied key is copied: the signer keeps its own internal copy alive until {@link dispose}
   * zeroes it, and never wipes the supplied key, whose disposal remains the caller's responsibility.
   *
   * @param {string | Uint8Array} privateKey - The private key's hex string (with or without 0x) or bytes (32 bytes).
   * @throws {ValueError} If the key is not a valid secp256k1 private key.
   */
  constructor (privateKey) {
    const key = copyPrivateKey(privateKey)

    /**
     * Raw secp256k1 private key bytes (32 bytes), owned by the signer.
     *
     * @private
     * @type {Uint8Array | undefined}
     */
    this._rawPrivateKey = key

    /**
     * Compressed secp256k1 public key bytes (33 bytes).
     *
     * @private
     * @type {Uint8Array}
     */
    this._rawPublicKey = secp256k1.getPublicKey(key, true)

    /** @private */
    this._address = getTronAddress(this._rawPublicKey)

    /** @private */
    this._disposed = false
  }

  /**
   * Whether this signer can derive child signers.
   *
   * @type {false}
   */
  get isDerivable () {
    return false
  }

  /**
   * The derivation path. Always null for private-key signers.
   *
   * @type {null}
   */
  get path () {
    return null
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
      privateKey: this._rawPrivateKey ?? null,
      publicKey: this._rawPublicKey
    }
  }

  /**
   * Derives a child signer using a relative path.
   *
   * @param {string} path - The relative derivation path.
   * @returns {Promise<never>} The derived signer.
   * @throws {UnsupportedOperationError} If the signer does not support account derivation.
   */
  async derive (path) {
    throw new UnsupportedOperationError('derive(path)')
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

    return signMessage(this._rawPrivateKey, message)
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

    return signTransaction(this._rawPrivateKey, transaction)
  }

  /**
   * Disposes the signer, securely erasing its internal copy of the private key from memory.
   */
  dispose () {
    if (this._rawPrivateKey) {
      sodium_memzero(this._rawPrivateKey)
    }

    this._rawPrivateKey = undefined
    this._disposed = true
  }
}
