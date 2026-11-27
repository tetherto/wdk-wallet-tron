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

import { TronWeb, utils as TronWebUtils } from 'tronweb'

// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3'
import { secp256k1 } from '@noble/curves/secp256k1'

import { ISigner, NotImplementedError, ValueError } from '@tetherto/wdk-wallet'

/** @typedef {import('@tetherto/wdk-wallet').DisposalError} DisposalError */
/** @typedef {import('@tetherto/wdk-wallet').UnsupportedOperationError} UnsupportedOperationError */

/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */

/** @typedef {import('tronweb/utils').TypedDataDomain} TypedDataDomain */
/** @typedef {import('tronweb/utils').TypedDataField} TypedDataField */

/**
 * @typedef {Object} TypedData
 * @property {TypedDataDomain} domain - The domain separator. Its verifying contract, if any, is a base58 tron address.
 * @property {Record<string, TypedDataField[]>} types - The type definitions.
 * @property {Record<string, unknown>} message - The message data. Its address fields are base58 tron addresses.
 */

const ADDRESS_HASH_OFFSET_IN_BYTES = 12

const TRANSACTION_ID_PATTERN = /^[0-9a-fA-F]{64}$/

/**
 * Parses a BIP-32 derivation path into its segments.
 *
 * @internal
 * @param {string} path - The derivation path, absolute ("m" or "m/...") or relative.
 * @param {Object} [options] - The parsing options.
 * @param {boolean} [options.requireAbsolute] - If true, the path must also be absolute (default: false).
 * @returns {string[]} The path segments (e.g. ["44'", "195'"]), without the leading "m".
 * @throws {ValueError} If the path is required to be absolute and is not, or if it is not a valid BIP-32 path.
 */
export function parseDerivationPath (path, options = {}) {
  if (path === 'm') {
    return []
  }

  const { requireAbsolute = false } = options

  const isAbsolute = path.startsWith('m/')

  if (requireAbsolute && !isAbsolute) {
    throw new ValueError('The derivation path must be absolute (e.g. "m/44\'/195\'").')
  }

  const segments = (isAbsolute ? path.slice(2) : path).split('/')

  if (!segments.every((segment) => /^\d+'?$/.test(segment) && parseInt(segment) < 2 ** 31)) {
    throw new ValueError('The derivation path is not a valid BIP-32 path.')
  }

  return segments
}

/**
 * Returns the tron address of a secp256k1 public key.
 *
 * @internal
 * @param {string | Uint8Array} publicKey - The public key (compressed or uncompressed).
 * @returns {string} The address, in base58 format.
 */
export function getTronAddress (publicKey) {
  const uncompressedPublicKey = secp256k1.Point.fromHex(publicKey)
    .toBytes(false)
    .slice(1)

  const publicKeyHash = keccak_256(uncompressedPublicKey)
  const addressBytes = publicKeyHash.slice(ADDRESS_HASH_OFFSET_IN_BYTES)
  const addressHex = '41' + Buffer.from(addressBytes).toString('hex')

  return TronWeb.address.fromHex(addressHex)
}

/**
 * Signs a message with a raw secp256k1 private key, using the TRON signed message prefix.
 *
 * @internal
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
 * Signs a transaction's id with a raw secp256k1 private key.
 *
 * @internal
 * @param {Uint8Array} privateKey - The raw private key (32 bytes).
 * @param {Transaction} unsignedTx - The unsigned transaction.
 * @returns {SignedTransaction} The signed transaction.
 * @throws {ValueError} If the transaction id is not a 32-byte hex string.
 */
export function signTransaction (privateKey, unsignedTx) {
  if (!TRANSACTION_ID_PATTERN.test(unsignedTx.txID)) {
    throw new ValueError('The transaction id must be a 32-byte hex string.')
  }

  const transactionBytes = Buffer.from(unsignedTx.txID, 'hex')

  const signature = secp256k1.sign(transactionBytes, privateKey, { lowS: true })

  const r = signature.r.toString(16).padStart(64, '0')
  const s = signature.s.toString(16).padStart(64, '0')
  const v = signature.recovery.toString(16).padStart(2, '0')

  const serializedSignature = r + s + v

  return {
    ...unsignedTx,
    signature: [serializedSignature]
  }
}

/**
 * Signs typed data with a raw secp256k1 private key, according to TIP-712.
 *
 * @internal
 * @param {Uint8Array} privateKey - The raw private key (32 bytes).
 * @param {TypedData} typedData - The typed data to sign.
 * @returns {string} The signature, as a 0x-prefixed 65-byte hex string (r ‖ s ‖ v, with v in {27, 28}).
 */
export function signTypedData (privateKey, { domain, types, message }) {
  const digest = TronWebUtils._TypedDataEncoder.hash(domain, types, message)
  const digestBytes = Buffer.from(digest.slice(2), 'hex')

  const signature = secp256k1.sign(digestBytes, privateKey, { lowS: true })

  const r = signature.r.toString(16).padStart(64, '0')
  const s = signature.s.toString(16).padStart(64, '0')
  const v = (27 + signature.recovery).toString(16).padStart(2, '0')

  return '0x' + r + s + v
}

/**
 * Interface for Tron signers.
 *
 * @interface
 */
export class ISignerTron extends ISigner {
  /**
   * Derive a child signer using a relative path (e.g., "0'/0/0").
   *
   * @param {string} path - The relative derivation path.
   * @returns {Promise<ISignerTron>} The derived signer.
   * @throws {UnsupportedOperationError} If the signer does not support account derivation.
   * @throws {ValueError} If the path is not valid.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async derive (path) {
    throw new NotImplementedError('derive(path)')
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
    throw new NotImplementedError('signTransaction(unsignedTx)')
  }

  /**
   * Signs typed data according to TIP-712.
   *
   * @param {TypedData} typedData - The typed data to sign.
   * @returns {Promise<string>} The signature, as a 0x-prefixed 65-byte hex string (r ‖ s ‖ v, with v in {27, 28}).
   * @throws {DisposalError} If the signer has been disposed.
   */
  async signTypedData (typedData) {
    throw new NotImplementedError('signTypedData(typedData)')
  }
}
