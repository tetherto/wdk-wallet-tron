'use strict'

import { describe, expect, test } from '@jest/globals'

import BarePrivateKeyTronSigner from '../../src/signers/bare-private-key-signer-tron.js'
import {
  createMockBareSigner,
  tronMessageHash,
  recoverCompressedPubKey
} from '../helpers/mock-secp256k1-bare-signer.js'

const TXID = 'a1'.repeat(32)

const newSigner = (config = {}) =>
  new BarePrivateKeyTronSigner({ bareSigner: createMockBareSigner(), ...config })

const pubHex = (bareSigner) => Buffer.from(bareSigner.compressedPublicKey).toString('hex')

describe('BarePrivateKeyTronSigner', () => {
  test('is a non-HD private-key signer that cannot derive', () => {
    const signer = newSigner()
    expect(signer.isPrivateKey).toBe(true)
    expect(signer.isRoot).toBe(false)
    expect(signer.index).toBe(0)
    expect(signer.path).toBeUndefined()
    expect(() => signer.derive()).toThrow('derivation is not supported')
  })

  test('getAddress derives the canonical TRON address (cross-checked with tronweb) and caches it', async () => {
    const bareSigner = createMockBareSigner()
    const signer = new BarePrivateKeyTronSigner({ bareSigner })

    const address = await signer.getAddress()
    expect(address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
    expect(address).toBe(bareSigner.tronAddress)

    await signer.getAddress()
    expect(bareSigner.calls.getPublicKey).toBe(1)
  })

  test('sign() produces a TRON personal-sign signature that recovers to the signer key', async () => {
    const bareSigner = createMockBareSigner()
    const signer = new BarePrivateKeyTronSigner({ bareSigner })

    const sig = await signer.sign('hello tron')
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/)

    const bytes = Buffer.from(sig.slice(2), 'hex')
    expect([27, 28]).toContain(bytes[64])

    const recovered = recoverCompressedPubKey(bytes.subarray(0, 64), bytes[64] - 27, tronMessageHash('hello tron'))
    expect(recovered).toBe(pubHex(bareSigner))
  })

  test('signTransaction signs the txID digest and recovers to the signer key', async () => {
    const bareSigner = createMockBareSigner()
    const signer = new BarePrivateKeyTronSigner({ bareSigner })

    const sig = await signer.signTransaction(TXID)
    expect(sig).toMatch(/^[0-9a-f]{130}$/)

    const bytes = Buffer.from(sig, 'hex')
    const recovered = recoverCompressedPubKey(bytes.subarray(0, 64), bytes[64] - 27, Buffer.from(TXID, 'hex'))
    expect(recovered).toBe(pubHex(bareSigner))
  })

  test('signTransaction rejects a malformed txID', async () => {
    const signer = newSigner()
    await expect(signer.signTransaction('not-hex')).rejects.toThrow('Invalid txID')
  })

  test('dispose deactivates the signer and clears cached key material', async () => {
    const signer = newSigner()
    await signer.getAddress()
    signer.dispose()
    expect(signer.isActive).toBe(false)
    expect(signer.keyPair.publicKey).toBeUndefined()
  })
})
