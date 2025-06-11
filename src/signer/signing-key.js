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
import { SigningKey } from 'ethers'

export default class MemorySafeSigningKey extends SigningKey {
  #privateKeyBuffer

  constructor (privateKeyBuffer) {
    if (!(privateKeyBuffer instanceof Uint8Array)) {
      throw new Error('privateKeyBuffer must be a Uint8Array')
    }
    if (privateKeyBuffer.length !== 32) {
      throw new Error('privateKeyBuffer must be 32 bytes')
    }

    // we never treat the private key as a string
    // we can pass a dummy one as we override all the signing methods
    super('0x0000000000000000000000000000000000000000000000000000000000000000')

    this.#privateKeyBuffer = privateKeyBuffer
  }

  get compressedPublicKey () {
    return secp256k1.getPublicKey(this.#privateKeyBuffer, true)
  }

  get publicKey () {
    return secp256k1.getPublicKey(this.#privateKeyBuffer, false)
  }

  /**
   * Sign a message hash
   * @param {string} digest - hex string of the message hash to sign
   */
  sign (message) {
    const signature = secp256k1.sign(message, this.#privateKeyBuffer)
    return '0x' + signature.r.toString(16).padStart(64, '0') + signature.s.toString(16).padStart(64, '0') + (signature.recovery ? '1c' : '1b')
  }
}
