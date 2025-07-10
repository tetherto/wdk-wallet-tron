'use strict'

import { HDKey } from '@scure/bip32'
import MemorySafeSigningKey from './signing-key.js'

export default class MemorySafeHDNodeWallet {
  #hdkey
  #signingKey

  constructor (hdkey) {
    this.#hdkey = hdkey
    this.#signingKey = new MemorySafeSigningKey(hdkey.privateKey)
  }

  get path () {
    return this.#hdkey.path
  }

  get index () {
    return this.#hdkey.index
  }

  get signingKey () {
    return this.#signingKey
  }

  get privateKeyBuffer () {
    return this.#signingKey.privateKey
  }

  get publicKeyBuffer () {
    return this.#signingKey.publicKey
  }

  derivePath (path) {
    const derivedKey = this.#hdkey.derive(path)
    return new MemorySafeHDNodeWallet(derivedKey)
  }

  static fromSeed (seed) {
    const hdkey = HDKey.fromMasterSeed(seed)
    return new MemorySafeHDNodeWallet(hdkey)
  }

  dispose () {
    this.signingKey.dispose()
  }
}
