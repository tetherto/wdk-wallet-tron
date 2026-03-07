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

import { HDKey } from '@scure/bip32'
import { secp256k1 } from '@noble/curves/secp256k1.js'
// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3.js'
import * as bip39 from 'bip39'
import { TronWeb } from 'tronweb'
// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'
import { NotImplementedError } from '@tetherto/wdk-wallet'

/**
 * Tron-specific signer interface.
 *
 * Extends the base ISigner contract with TRON signing capabilities.
 * No signTypedData — TRON has no EIP-712 equivalent.
 *
 * @interface
 */
export class ISignerTron {
  /** @type {boolean} */
  get isActive () { throw new NotImplementedError('isActive') }

  /** @type {boolean} */
  get isRoot () { throw new NotImplementedError('isRoot') }

  /** @type {number|undefined} */
  get index () { throw new NotImplementedError('index') }

  /** @type {string|undefined} */
  get path () { throw new NotImplementedError('path') }

  /** @type {string|undefined} */
  get address () { throw new NotImplementedError('address') }

  /**
   * @type {{ privateKey: Uint8Array|null, publicKey: Uint8Array|null }}
   */
  get keyPair () { throw new NotImplementedError('keyPair') }

  /**
   * Derive a child signer from a relative BIP-44 path (e.g. "0'/0/0").
   * @param {string} relPath
   * @returns {ISignerTron}
   */
  derive (relPath) { throw new NotImplementedError('derive(relPath)') }

  /** @returns {Promise<string>} */
  async getAddress () { throw new NotImplementedError('getAddress()') }

  /**
   * Sign a plain text message using the TRON personal sign prefix.
   * @param {string} message
   * @returns {Promise<string>} hex signature with 0x prefix
   */
  async sign (message) { throw new NotImplementedError('sign(message)') }

  /**
   * Sign a raw TRON transaction by its txID (hex string).
   * @param {string} txID - The transaction ID hex string (32 bytes).
   * @returns {Promise<string>} compact hex signature (r+s+v, no 0x prefix)
   */
  async signTransaction (txID) { throw new NotImplementedError('signTransaction(txID)') }

  /** Clear secret material from memory. */
  dispose () { throw new NotImplementedError('dispose()') }
}

const BIP_44_TRON_PATH_PREFIX = "m/44'/195'"

/**
 * Derives a TRON base58check address from a compressed public key.
 * @param {Uint8Array} publicKey
 * @returns {string}
 */
function getTronAddress (publicKey) {
  const pubHex = Buffer.from(publicKey).toString('hex')
  const uncompressed = secp256k1.Point.fromHex(pubHex).toBytes(false).slice(1)
  const hash = keccak_256(uncompressed)
  const addressHex = '41' + Buffer.from(hash.slice(12)).toString('hex')
  return TronWeb.address.fromHex(addressHex)
}

/**
 * BIP-44 seed-based signer for the TRON network.
 *
 * Two modes:
 *  - Root: `new SeedSignerTron(seed)` — holds master HDKey, derive() only.
 *  - Child: `new SeedSignerTron(null, { root, path })` — holds derived HDKey, can sign.
 *
 * @implements {import('./interface.js').ISignerTron}
 */
export default class SeedSignerTron {
  /**
   * @param {string|Uint8Array|null} seed - BIP-39 mnemonic or seed bytes. Pass null when providing opts.root.
   * @param {{ root?: HDKey, path?: string }} [opts]
   */
  constructor (seed, opts = {}) {
    if (opts.root && seed) {
      throw new Error('Provide either a seed or a root, not both.')
    }
    if (!opts.root && (seed === null || seed === undefined)) {
      throw new Error('Seed or root is required.')
    }

    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }
      seed = bip39.mnemonicToSeedSync(seed)
    }

    this._isActive = true
    this._isRoot = true
    this._root = opts.root || HDKey.fromMasterSeed(seed)
    this._account = undefined
    this._address = undefined
    this._path = undefined

    if (opts.path) {
      const fullPath = `${BIP_44_TRON_PATH_PREFIX}/${opts.path}`
      const account = this._root.derive(fullPath)
      this._account = account
      this._address = getTronAddress(account.publicKey)
      this._path = fullPath
      this._isRoot = false
    }
  }

  get isActive () { return this._isActive }
  get isRoot () { return this._isRoot }

  get index () {
    if (!this._path) return undefined
    return +this._path.split('/').pop()
  }

  get path () { return this._path }
  get address () { return this._address }

  get keyPair () {
    return {
      privateKey: this._account ? this._account.privateKey : null,
      publicKey: this._account ? this._account.publicKey : null
    }
  }

  /**
   * Derive a child signer using a relative path (e.g. "0'/0/0").
   * @param {string} relPath
   * @returns {SeedSignerTron}
   */
  derive (relPath) {
    return new SeedSignerTron(null, { root: this._root, path: relPath })
  }

  /** @returns {Promise<string>} */
  async getAddress () {
    if (!this._address) {
      throw new Error('Cannot get address from a root signer. Derive a child first.')
    }
    return this._address
  }

  /**
   * Signs a message using the TRON personal sign prefix.
   * @param {string} message
   * @returns {Promise<string>} 0x-prefixed hex signature (65 bytes)
   */
  async sign (message) {
    if (!this._account) {
      throw new Error('Cannot sign from a root signer. Derive a child first.')
    }

    const messageBytes = Buffer.from(message, 'utf8')
    const prefix = Buffer.from(`\x19TRON Signed Message:\n${messageBytes.length}`, 'utf8')
    const hash = keccak_256(Buffer.concat([prefix, messageBytes]))

    // format: 'recovered' returns [v, r(32), s(32)] — 65 bytes total
    const recSig = secp256k1.sign(hash, this._account.privateKey, { prehash: false, format: 'recovered' })
    const v = recSig[0]
    const rs = recSig.slice(1) // 64 bytes r+s
    const bytes = new Uint8Array([...rs, 27 + v])
    return '0x' + Buffer.from(bytes).toString('hex')
  }

  /**
   * Signs a raw TRON transaction by its txID.
   * @param {string} txID - Transaction ID as a hex string (64 hex chars = 32 bytes).
   * @returns {Promise<string>} compact hex signature r+s+v (65 bytes, no 0x prefix)
   */
  async signTransaction (txID) {
    if (!this._account) {
      throw new Error('Cannot sign transactions from a root signer. Derive a child first.')
    }

    const txBytes = Buffer.from(txID, 'hex')
    // format: 'recovered' returns [v, r(32), s(32)] — 65 bytes total
    const recSig = secp256k1.sign(txBytes, this._account.privateKey, { lowS: true, prehash: false, format: 'recovered' })
    const v = recSig[0] + 27 // TRON uses Ethereum-compatible v: 27 or 28
    const r = Buffer.from(recSig.slice(1, 33)).toString('hex')
    const s = Buffer.from(recSig.slice(33, 65)).toString('hex')

    return r + s + v.toString(16).padStart(2, '0')
  }

  /** Clears private key material from memory. */
  dispose () {
    if (this._account && this._account._privateKey) {
      sodium_memzero(this._account._privateKey)
      this._account._privateKey = undefined
    }
    this._isActive = false
  }
}
