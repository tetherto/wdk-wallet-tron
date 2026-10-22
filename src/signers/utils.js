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

import { TronWeb } from 'tronweb'

// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3'
import { secp256k1 } from '@noble/curves/secp256k1'
import { HARDENED_OFFSET } from '@scure/bip32'

import { ValueError } from '@tetherto/wdk-wallet'

/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */

/**
 * Parses a BIP-32 derivation path into child indexes.
 *
 * @param {string} path - The derivation path; absolute ("m" or "m/...") if `absolute` is true, relative (e.g. "0'/0/0") otherwise.
 * @param {boolean} [absolute] - If true, the path must be absolute (default: false).
 * @returns {number[]} The child indexes, with the hardened offset added to hardened ones.
 * @throws {ValueError} If the path is not valid.
 */
export function parseDerivationPath (path, absolute = false) {
  if (absolute) {
    if (path === 'm') {
      return []
    }

    if (!path.startsWith('m/')) {
      throw new ValueError(`The derivation path must be absolute (e.g. "m/44'/195'"), got "${path}".`)
    }

    path = path.slice(2)
  }

  return path.split('/').map((segment) => {
    const match = /^(0|[1-9]\d*)(')?$/.exec(segment)

    const index = match ? Number(match[1]) : NaN

    if (!Number.isSafeInteger(index) || index >= HARDENED_OFFSET) {
      throw new ValueError(`The derivation path "${path}" has an invalid child index: "${segment}".`)
    }

    return match[2] ? index + HARDENED_OFFSET : index
  })
}

/**
 * Returns the tron address of a secp256k1 public key.
 *
 * @param {Uint8Array} publicKey - The public key (compressed or uncompressed).
 * @returns {string} The address, in base58 format.
 */
export function getTronAddress (publicKey) {
  const uncompressedPublicKey = secp256k1.Point.fromHex(publicKey)
    .toBytes(false)
    .slice(1)

  const publicKeyHash = keccak_256(uncompressedPublicKey)
  const addressBytes = publicKeyHash.slice(12)
  const addressHex = '41' + Buffer.from(addressBytes).toString('hex')

  return TronWeb.address.fromHex(addressHex)
}

/**
 * Signs a message with a raw secp256k1 private key, using the TRON signed message prefix.
 *
 * @param {Uint8Array} privateKey - The raw private key (32 bytes).
 * @param {string} message - The message to sign.
 * @returns {string} The message's signature, as a 0x-prefixed hex string.
 */
export function signMessage (privateKey, message) {
  const messageBytes = Buffer.from(message, 'utf8')
  const prefix = Buffer.from(`\x19TRON Signed Message:\n${messageBytes.length}`, 'utf8')
  const messageWithPrefixBytes = Buffer.concat([prefix, messageBytes])
  const hash = keccak_256(messageWithPrefixBytes)

  const signature = secp256k1.sign(hash, privateKey)
  const signatureWithRecovery = new Uint8Array([...signature.toBytes('compact'), 27 + signature.recovery])
  const hex = Buffer.from(signatureWithRecovery).toString('hex')

  return '0x' + hex
}

/**
 * Signs a transaction's id with a raw secp256k1 private key, keeping the signatures it already carries.
 *
 * @param {Uint8Array} privateKey - The raw private key (32 bytes).
 * @param {Transaction | SignedTransaction} transaction - The transaction.
 * @returns {SignedTransaction} The transaction with the key's signature appended.
 */
export function signTransaction (privateKey, transaction) {
  const transactionBytes = Buffer.from(transaction.txID, 'hex')

  const signature = secp256k1.sign(transactionBytes, privateKey, { lowS: true })

  const r = signature.r.toString(16).padStart(64, '0')
  const s = signature.s.toString(16).padStart(64, '0')
  const v = signature.recovery.toString(16).padStart(2, '0')

  const serializedSignature = r + s + v

  const signatures = 'signature' in transaction ? transaction.signature ?? [] : []

  return {
    ...transaction,
    signature: [...signatures, serializedSignature]
  }
}
