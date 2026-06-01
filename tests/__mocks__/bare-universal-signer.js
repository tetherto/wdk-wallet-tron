// Jest shim for `@idyllicvision/bare-universal-signer`.
//
// The real package eagerly imports a native addon (binding.js → import.meta.addon),
// a Bare-runtime feature unavailable under Node/Jest that throws at import time.
// Unit tests never touch the real keychain — they inject a mock bare signer via
// config — so this shim only needs to provide an importable, constructable
// `Signer` and the named helper exports. Wired up via `moduleNameMapper`.

export class Signer {
  constructor (options = {}) {
    this._options = options
  }

  async getPublicKey () {
    throw new Error('bare-universal-signer Signer is stubbed under Jest; inject a mock bareSigner via config')
  }

  async sign () {
    throw new Error('bare-universal-signer Signer is stubbed under Jest; inject a mock bareSigner via config')
  }

  lock () {}
  isUnlocked () { return false }
}

const notAvailable = async () => {
  throw new Error('bare-universal-signer is stubbed under Jest')
}

export const sign = notAvailable
export const getPublicKey = notAvailable
export const createMnemonic = notAvailable
export const deleteMnemonic = notAvailable
export const readMnemonic = notAvailable
export const importMnemonic = notAvailable
export const importPrivateKey = notAvailable
export const readPrivateKey = notAvailable
export const deletePrivateKey = notAvailable

export default Signer
