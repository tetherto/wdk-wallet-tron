'use strict'

import { Buffer } from 'bare-buffer'
import { secp256k1 } from '@noble/curves/secp256k1.js'
// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { base58check } from '@scure/base'

import { getDefaultBareSigner } from '../bare-signer.js'

const BIP44_TRON_PREFIX = "m/44'/195'"

// TRON uses Bitcoin-style base58check (SHA256d checksum)
const tronBase58 = base58check(sha256)

/**
 * Derive a TRON base58check address from a compressed secp256k1 public key.
 * @param {Uint8Array} compressedPubKey - 33-byte compressed public key
 * @returns {string} TRON address starting with 'T'
 */
function getTronAddress (compressedPubKey) {
  // Decompress: Point.toHex(false) returns 130-char hex (04 prefix + 64-byte body)
  const uncompressedHex = secp256k1.Point.fromHex(
    Buffer.from(compressedPubKey).toString('hex')
  ).toHex(false)
  // Convert hex to bytes and drop the leading 0x04 prefix → 64-byte uncompressed key
  const allBytes = new Uint8Array(uncompressedHex.match(/.{2}/g).map(b => parseInt(b, 16)))
  const uncompressed = allBytes.slice(1)

  // keccak256 of the 64-byte uncompressed key → take last 20 bytes
  // eslint-disable-next-line camelcase
  const hash = keccak_256(uncompressed)
  const payload = hash.slice(12) // 20 bytes (Ethereum-style address body)

  // Prepend TRON network byte 0x41, then base58check encode
  const addressBytes = new Uint8Array(21)
  addressBytes[0] = 0x41
  addressBytes.set(payload, 1)

  return tronBase58.encode(addressBytes)
}

/**
 * @typedef {Object} TronSignerConfig
 * @property {import('@idyllicvision/bare-universal-signer').Signer} [bareSigner] - Signer instance
 * @property {string} [path="m/44'/195'"] - BIP-44 TRON path prefix or full path
 * @property {Object} [keychainOpts={}] - Keychain options
 */

/**
 * TRON signer backed by bare-signer (iOS Keychain secure storage).
 * Implements the ISignerTron interface from @tetherto/wdk-wallet-tron.
 *
 * Private keys never leave the keychain — only signatures and public keys
 * are returned.
 *
 * Two modes:
 *  - Root: `new TronSigner(config)` — path is BIP-44 prefix only, derive() only.
 *  - Child: returned by `root.derive(relPath)` — full path, can sign.
 *
 * IMPORTANT: Call `await child.initializeAddress()` before passing a child
 * to `WalletAccountTron`, because `WalletAccountTron.constructor` reads
 * `signer.address` synchronously.
 */
export default class TronSigner {
  /**
   * @param {TronSignerConfig} [config={}]
   */
  constructor (config = {}) {
    this._bareSigner = config.bareSigner || getDefaultBareSigner()
    this._path = config.path || BIP44_TRON_PREFIX
    this._opts = config.keychainOpts || {}
    this._isActive = true
    this._address = undefined
    this._publicKey = undefined

    // Root when path is only the BIP-44 prefix (depth ≤ 2: m/44'/195')
    const depth = this._path.split('/').length - 1
    this._isRoot = depth <= 2
  }

  /** @returns {boolean} */
  get isActive () { return this._isActive }

  /** @returns {boolean} */
  get isRoot () { return this._isRoot }

  /**
   * Last numeric path component (the account index).
   * @returns {number|undefined}
   */
  get index () {
    if (!this._path || this._isRoot) return undefined
    return +this._path.split('/').pop().replace("'", '')
  }

  /** @returns {string} */
  get path () { return this._path }

  /**
   * Cached TRON address. Undefined until initializeAddress() or getAddress() is called.
   * @returns {string|undefined}
   */
  get address () { return this._address }

  /**
   * Key pair. Private key is never exposed (stays in the iOS Keychain).
   * @returns {{ privateKey: undefined, publicKey: Uint8Array|undefined }}
   */
  get keyPair () {
    return { privateKey: undefined, publicKey: this._publicKey }
  }

  /**
   * Get the raw 33-byte secp256k1 compressed public key from the keychain.
   * @returns {Promise<Uint8Array>}
   */
  async getPublicKey () {
    if (this._publicKey) return this._publicKey
    this._publicKey = await this._bareSigner.getPublicKey({
      path: this._path,
      curve: 'secp256k1',
      opts: this._opts
    })
    return this._publicKey
  }

  /**
   * Compute and cache the TRON address from the secp256k1 public key.
   * Call this before constructing WalletAccountTron.
   * @returns {Promise<string>} TRON base58check address
   */
  async initializeAddress () {
    if (this._address) return this._address
    if (this._isRoot) {
      throw new Error('Cannot get address from a root signer. Derive a child first.')
    }
    const pubkey = await this.getPublicKey()
    this._address = getTronAddress(pubkey)
    return this._address
  }

  /**
   * Get the TRON address, computing and caching it if necessary.
   * @returns {Promise<string>}
   */
  async getAddress () {
    return this.initializeAddress()
  }

  /**
   * Derive a child signer using a relative BIP-44 path (e.g. "0'/0/0").
   * @param {string} relPath
   * @returns {TronSigner}
   */
  derive (relPath) {
    if (!relPath || typeof relPath !== 'string') {
      throw new Error('Invalid relative path: must be a non-empty string')
    }

    const fullPath = `${BIP44_TRON_PREFIX}/${relPath}`
    const child = new TronSigner({
      bareSigner: this._bareSigner,
      path: fullPath,
      keychainOpts: this._opts
    })
    child._isRoot = false
    return child
  }

  /**
   * Sign a message using the TRON personal sign prefix.
   * @param {string} message
   * @returns {Promise<string>} 0x-prefixed hex signature (65 bytes: r+s+v)
   */
  async sign (message) {
    if (this._isRoot) {
      throw new Error('Cannot sign from a root signer. Derive a child first.')
    }

    const messageBytes = Buffer.from(message, 'utf8')
    const prefix = Buffer.from(`\x19TRON Signed Message:\n${messageBytes.length}`, 'utf8')
    // eslint-disable-next-line camelcase
    const hash = keccak_256(Buffer.concat([prefix, messageBytes]))

    const sigBytes = await this._bareSigner.sign({
      path: this._path,
      curve: 'secp256k1',
      data: hash,
      opts: this._opts
    })

    // bare-signer returns 65 bytes: [recovery(1), r(32), s(32)]
    const recovery = sigBytes[0]
    const rs = sigBytes.slice(1) // 64 bytes r+s
    const result = new Uint8Array(65)
    result.set(rs, 0)
    result[64] = 27 + recovery

    return '0x' + Buffer.from(result).toString('hex')
  }

  /**
   * Sign a raw TRON transaction by its txID (already a 32-byte SHA256 hash).
   * @param {string} txID - Transaction ID as a 64-char hex string (32 bytes).
   * @returns {Promise<string>} Compact hex signature r+s+v (130 chars, no 0x prefix)
   */
  async signTransaction (txID) {
    if (this._isRoot) {
      throw new Error('Cannot sign transactions from a root signer. Derive a child first.')
    }

    const txBytes = Buffer.from(txID, 'hex')

    const sigBytes = await this._bareSigner.sign({
      path: this._path,
      curve: 'secp256k1',
      data: txBytes,
      opts: this._opts
    })

    // bare-signer returns 65 bytes: [recovery(1), r(32), s(32)]
    let recovery = sigBytes[0]
    let sig = secp256k1.Signature.fromBytes(sigBytes.slice(1, 65))

    // Enforce low-S per spec: if S is high, normalize S = n - S and flip recovery bit
    if (sig.hasHighS()) {
      sig = new secp256k1.Signature(sig.r, secp256k1.Point.Fn.neg(sig.s))
      recovery ^= 1
    }

    const v = (recovery + 27).toString(16).padStart(2, '0')
    return Buffer.from(sig.toBytes()).toString('hex') + v
  }

  /**
   * Mark this signer as inactive and clear cached key material.
   */
  dispose () {
    this._isActive = false
    this._address = undefined
    this._publicKey = undefined
  }
}

export { TronSigner }
