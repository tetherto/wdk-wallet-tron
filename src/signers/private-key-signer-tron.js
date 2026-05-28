'use strict'

import { Buffer } from 'bare-buffer'
import { secp256k1 } from '@noble/curves/secp256k1.js'
// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { base58check } from '@scure/base'

import { Signer } from '@idyllicvision/bare-universal-signer'

// TRON uses Bitcoin-style base58check (SHA256d checksum)
const tronBase58 = base58check(sha256)

/**
 * Derive a TRON base58check address from a compressed secp256k1 public key.
 * @param {Uint8Array} compressedPubKey - 33-byte compressed public key
 * @returns {string} TRON address starting with 'T'
 */
function getTronAddress (compressedPubKey) {
  const uncompressedHex = secp256k1.Point.fromHex(
    Buffer.from(compressedPubKey).toString('hex')
  ).toHex(false)
  const allBytes = new Uint8Array(uncompressedHex.match(/.{2}/g).map(b => parseInt(b, 16)))
  const uncompressed = allBytes.slice(1)

  // eslint-disable-next-line camelcase
  const hash = keccak_256(uncompressed)
  const payload = hash.slice(12) // 20 bytes

  const addressBytes = new Uint8Array(21)
  addressBytes[0] = 0x41
  addressBytes.set(payload, 1)

  return tronBase58.encode(addressBytes)
}

/**
 * @typedef {Object} PrivateKeySignerTronConfig
 * @property {import('@idyllicvision/bare-universal-signer').Signer} [bareSigner] - Pre-constructed Signer instance
 * @property {Object} [keychainOpts={}] - Keychain options forwarded to new Signer if bareSigner omitted
 */

/**
 * TRON signer backed by a raw private key stored in the iOS Keychain.
 * Compatible with ISignerTron (wdk-wallet-tron). No HD derivation supported.
 *
 * IMPORTANT: Call `await signer.initializeAddress()` before passing this signer
 * to `WalletAccountTron`, because `WalletAccountTron.constructor` reads
 * `signer.address` synchronously.
 */
export default class PrivateKeyTronSigner {
  /**
   * @param {PrivateKeySignerTronConfig} [config={}]
   */
  constructor (config = {}) {
    this._bareSigner = config.bareSigner ||
      new Signer({ secretType: 'privateKey', autoLockMs: 30000, opts: config.keychainOpts || {} })
    this._isActive = true
    this._address = undefined
    this._publicKey = undefined
  }

  get isPrivateKey () { return true }
  get isActive () { return this._isActive }
  get isRoot () { return false }
  get index () { return 0 }
  get path () { return undefined }

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

  /** @throws {Error} Always */
  derive () {
    throw new Error('PrivateKeyTronSigner: derivation is not supported for private-key signers.')
  }

  /** @returns {Promise<Uint8Array>} 33-byte compressed public key */
  async getPublicKey () {
    if (this._publicKey) return this._publicKey
    this._publicKey = await this._bareSigner.getPublicKey({ curve: 'secp256k1' })
    return this._publicKey
  }

  /**
   * Compute and cache the TRON address from the secp256k1 public key.
   * Call this before constructing WalletAccountTron.
   * @returns {Promise<string>} TRON base58check address
   */
  async initializeAddress () {
    if (this._address) return this._address
    const pubkey = await this.getPublicKey()
    this._address = getTronAddress(pubkey)
    return this._address
  }

  /** @returns {Promise<string>} */
  async getAddress () {
    return this.initializeAddress()
  }

  /**
   * Sign a message using the TRON personal sign prefix.
   * @param {string} message
   * @returns {Promise<string>} 0x-prefixed hex signature (65 bytes: r+s+v)
   */
  async sign (message) {
    const messageBytes = Buffer.from(message, 'utf8')
    const prefix = Buffer.from(`\x19TRON Signed Message:\n${messageBytes.length}`, 'utf8')
    // eslint-disable-next-line camelcase
    const hash = keccak_256(Buffer.concat([prefix, messageBytes]))

    const sigBytes = await this._bareSigner.sign({ curve: 'secp256k1', data: hash })

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
    const txBytes = Buffer.from(txID, 'hex')

    const sigBytes = await this._bareSigner.sign({ curve: 'secp256k1', data: txBytes })

    // bare-signer returns 65 bytes: [recovery(1), r(32), s(32)]
    let recovery = sigBytes[0]
    let sig = secp256k1.Signature.fromBytes(sigBytes.slice(1, 65))

    // Enforce low-S per spec
    if (sig.hasHighS()) {
      sig = new secp256k1.Signature(sig.r, secp256k1.Point.Fn.neg(sig.s))
      recovery ^= 1
    }

    const v = (recovery + 27).toString(16).padStart(2, '0')
    return Buffer.from(sig.toBytes()).toString('hex') + v
  }

  /** Mark this signer as inactive and clear cached key material. */
  dispose () {
    this._isActive = false
    this._address = undefined
    this._publicKey = undefined
  }
}
