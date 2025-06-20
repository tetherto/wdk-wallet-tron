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

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha2'
import * as secp256k1 from '@noble/secp256k1'

/** Constants for BIP32 key derivation */
const MASTER_SECRET = new TextEncoder().encode('Bitcoin seed')
const HARDENED_OFFSET = 0x80000000
const PRIVATE_KEY_SIZE = 32

/**
 * Encodes a 32-bit unsigned integer into a big-endian byte array
 * @param {number} value - The value to encode
 * @returns {Uint8Array} The encoded value as a 4-byte array
 */
function encodeUInt32BE (value) {
  return new Uint8Array([
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff
  ])
}

/**
 * Parses a BIP32 derivation path string into an array of indices
 * @param {string} path - The derivation path (e.g., "m/44'/195'/0'/0/0")
 * @returns {number[]} Array of parsed indices
 * @throws {Error} If the path format is invalid
 */
function parsePath (path) {
  if (!path.match(/^[mM]\/[0-9'/]+$/)) {
    throw new Error('Invalid derivation path format')
  }

  return path
    .toLowerCase()
    .split('/')
    .slice(1)
    .map(component => {
      let index = parseInt(component)
      if (isNaN(index)) {
        throw new Error('Invalid index in derivation path')
      }
      if (component.endsWith("'")) {
        index += HARDENED_OFFSET
      }
      return index
    })
}

/**
 * Compares a buffer with the curve order
 * @param {Uint8Array} buffer - The buffer to compare
 * @param {number} startIndex - Starting index in the buffer
 * @returns {number} -1 if less, 0 if equal, 1 if greater
 */
function compareWithCurveOrder (buffer, startIndex = 0) {
  for (let i = 0; i < PRIVATE_KEY_SIZE; i++) {
    const curveOrderByte = Number((secp256k1.CURVE.n >> BigInt(8 * (31 - i))) & 0xffn)
    if (buffer[startIndex + i] > curveOrderByte) return 1
    if (buffer[startIndex + i] < curveOrderByte) return -1
  }
  return 0
}

/**
 * Checks if a buffer contains only zeros
 * @param {Uint8Array} buffer - The buffer to check
 * @returns {boolean} True if buffer contains only zeros
 */
function isBufferZero (buffer) {
  return buffer.every(byte => byte === 0)
}

/**
 * Adds two private keys modulo the curve order
 * @param {Uint8Array} target - The target buffer to add to
 * @param {Uint8Array} addition - The value to add
 * @returns {boolean} True if there was a carry
 */
function addPrivateKeys (target, addition) {
  let carry = 0
  for (let i = 31; i >= 0; i--) {
    const sum = target[i] + addition[i] + carry
    target[i] = sum & 0xff
    carry = sum >> 8
  }
  return carry > 0
}

/**
 * Subtracts the curve order from a private key
 * @param {Uint8Array} privateKey - The private key to modify
 */
function subtractFromPrivateKey (privateKey) {
  let carry = 0
  for (let i = 31; i >= 0; i--) {
    const curveOrderByte = Number((secp256k1.CURVE.n >> BigInt(8 * (31 - i))) & 0xffn)
    const diff = privateKey[i] - curveOrderByte - carry
    privateKey[i] = diff < 0 ? diff + 256 : diff
    carry = diff < 0 ? 1 : 0
  }
}

/**
 * Derives a private key from a seed following BIP32
 * @param {Uint8Array} seed - The seed to derive from
 * @param {Uint8Array} privateKeyBuffer - Buffer to store the derived private key
 * @param {Uint8Array} hmacOutputBuffer - Buffer for HMAC operations
 * @param {Uint8Array} derivationDataBuffer - Buffer for derivation data
 * @param {string} path - The derivation path
 * @throws {Error} If buffers are incorrectly sized or path is invalid
 */
export function derivePrivateKeyBuffer (seed, privateKeyBuffer, hmacOutputBuffer, derivationDataBuffer, path) {
  // Generate master key material
  hmacOutputBuffer.set(hmac(sha512, MASTER_SECRET, seed))

  // Set initial private key and chain code
  privateKeyBuffer.set(hmacOutputBuffer.subarray(0, 32))
  const chainCode = hmacOutputBuffer.subarray(32)

  // Parse and validate derivation path
  const indices = parsePath(path)

  // Derive child keys
  for (const index of indices) {
    derivationDataBuffer.fill(0)

    // Prepare derivation data
    if (index >= HARDENED_OFFSET) {
      derivationDataBuffer[0] = 0x00
      derivationDataBuffer.set(privateKeyBuffer, 1)
    } else {
      const pubKey = secp256k1.getPublicKey(privateKeyBuffer, true)
      derivationDataBuffer.set(pubKey)
    }
    derivationDataBuffer.set(encodeUInt32BE(index), 33)

    // Generate child key material
    hmacOutputBuffer.set(hmac(sha512, chainCode, derivationDataBuffer))
    const IL = hmacOutputBuffer.subarray(0, 32)
    const IR = hmacOutputBuffer.subarray(32)

    // Skip invalid derivation results
    if (compareWithCurveOrder(IL) >= 0) continue

    // Add IL to parent key
    const hasCarry = addPrivateKeys(privateKeyBuffer, IL)

    // Perform modulo operation if necessary
    if (hasCarry || compareWithCurveOrder(privateKeyBuffer) >= 0) {
      subtractFromPrivateKey(privateKeyBuffer)
    }

    // Skip if result is invalid
    if (isBufferZero(privateKeyBuffer)) continue

    // Update chain code
    chainCode.set(IR)
  }
}
