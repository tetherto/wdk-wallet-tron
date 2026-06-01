'use strict'

import { secp256k1 } from '@noble/curves/secp256k1.js'
// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3.js'
import pkg from 'tronweb'

const TronWeb = pkg.TronWeb || pkg.default

// A fixed private key so the unit tests are deterministic.
const DEFAULT_PRIV = '11'.repeat(32)

/**
 * Builds a mock `@idyllicvision/bare-universal-signer` backed by a REAL
 * secp256k1 key. It signs the 32-byte digest as-is (`prehash: false`) and emits
 * the `[recovery(1), r(32), s(32)]` layout the real bare-signer returns, so the
 * signer-under-test's signatures genuinely recover to the right key/address.
 *
 * @param {string} [privHex] - 32-byte private key as hex (defaults to DEFAULT_PRIV).
 */
export function createMockBareSigner (privHex = DEFAULT_PRIV) {
  const priv = Uint8Array.from(Buffer.from(privHex, 'hex'))
  const compressedPublicKey = secp256k1.getPublicKey(priv, true) // 33-byte compressed

  return {
    privateKeyHex: privHex,
    compressedPublicKey,
    // The canonical TRON address for this key, derived independently via tronweb.
    tronAddress: TronWeb.address.fromPrivateKey(privHex),
    calls: { sign: 0, getPublicKey: 0 },
    async getPublicKey () {
      this.calls.getPublicKey++
      return compressedPublicKey
    },
    async sign ({ data }) {
      this.calls.sign++
      return secp256k1.sign(data, priv, { format: 'recovered', prehash: false })
    }
  }
}

/**
 * Recomputes the TRON personal-sign digest: keccak256("\x19TRON Signed
 * Message:\n<len>" || message). Mirrors the signers' `sign()`.
 * @param {string} message
 * @returns {Uint8Array} 32-byte digest
 */
export function tronMessageHash (message) {
  const messageBytes = Buffer.from(message, 'utf8')
  const prefix = Buffer.from(`\x19TRON Signed Message:\n${messageBytes.length}`, 'utf8')
  return keccak_256(Buffer.concat([prefix, messageBytes]))
}

/**
 * Recovers the compressed public key (hex) from a 64-byte r||s, a recovery bit,
 * and the 32-byte digest that was signed.
 * @param {Uint8Array} rs - 64-byte compact signature
 * @param {number} recovery - recovery id (0 or 1)
 * @param {Uint8Array} digest - the 32-byte signed digest
 * @returns {string} compressed public key hex
 */
export function recoverCompressedPubKey (rs, recovery, digest) {
  return secp256k1.Signature
    .fromBytes(Uint8Array.from(rs), 'compact')
    .addRecoveryBit(recovery)
    .recoverPublicKey(digest)
    .toHex(true)
}
