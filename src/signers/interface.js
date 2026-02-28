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
