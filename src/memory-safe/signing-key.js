'use strict'

import { secp256k1 } from '@noble/curves/secp256k1'
// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

export default class MemorySafeSigningKey {
  #privateKeyBuffer

  constructor (privateKeyBuffer) {
    if (!(privateKeyBuffer instanceof Uint8Array) || privateKeyBuffer.length !== 32) {
      throw new Error('privateKeyBuffer must be a 32-byte Uint8Array.')
    }
    this.#privateKeyBuffer = privateKeyBuffer
  }

  get publicKey () {
    return secp256k1.getPublicKey(this.#privateKeyBuffer, false)
  }

  get compressedPublicKey () {
    return secp256k1.getPublicKey(this.#privateKeyBuffer, true)
  }

  get privateKey () {
    return this.#privateKeyBuffer
  }

  sign (digest) {
    if (!(digest instanceof Uint8Array) || digest.length !== 32) {
      throw new Error('Digest must be a 32-byte Uint8Array.')
    }

    return secp256k1.sign(digest, this.#privateKeyBuffer, { lowS: true })
  }

  dispose () {
    sodium_memzero(this.#privateKeyBuffer)

    this.#privateKeyBuffer = undefined
  }
}
