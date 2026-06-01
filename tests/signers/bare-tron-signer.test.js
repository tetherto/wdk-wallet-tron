'use strict'

import { describe, expect, test } from '@jest/globals'

import BareTronSigner from '../../src/signers/bare-tron-signer.js'
import {
  createMockBareSigner,
  tronMessageHash,
  recoverCompressedPubKey
} from '../helpers/mock-secp256k1-bare-signer.js'

const TXID = 'a1'.repeat(32) // 64-char hex = 32-byte SHA256 txID

const newSigner = (config = {}) =>
  new BareTronSigner({ bareSigner: createMockBareSigner(), ...config })

const pubHex = (bareSigner) => Buffer.from(bareSigner.compressedPublicKey).toString('hex')

describe('BareTronSigner', () => {
  test('root vs child: depth decides isRoot/index; derive composes the BIP-44 path', () => {
    const root = newSigner() // default path "m/44'/195'"
    expect(root.isRoot).toBe(true)
    expect(root.index).toBeUndefined()

    const child = root.derive("0'/0/0")
    expect(child.isRoot).toBe(false)
    expect(child.path).toBe("m/44'/195'/0'/0/0")
    expect(child.index).toBe(0)

    expect(() => root.derive('')).toThrow('non-empty string')
  })

  test('a root signer refuses to expose an address or sign', async () => {
    const root = newSigner()
    await expect(root.getAddress()).rejects.toThrow('root signer')
    await expect(root.sign('hi')).rejects.toThrow('root signer')
    await expect(root.signTransaction(TXID)).rejects.toThrow('root signer')
  })

  test('getAddress derives the canonical TRON base58 address (cross-checked with tronweb)', async () => {
    const bareSigner = createMockBareSigner()
    const signer = new BareTronSigner({ bareSigner }).derive("0'/0/0")

    const address = await signer.getAddress()
    expect(address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/) // base58 'T' address
    expect(address).toBe(bareSigner.tronAddress)

    await signer.getAddress()
    expect(bareSigner.calls.getPublicKey).toBe(1) // address + pubkey cached
  })

  test('sign() produces a TRON personal-sign signature that recovers to the signer key', async () => {
    const bareSigner = createMockBareSigner()
    const signer = new BareTronSigner({ bareSigner }).derive("0'/0/0")

    const sig = await signer.sign('hello tron')
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/) // 0x + 65 bytes (r+s+v)

    const bytes = Buffer.from(sig.slice(2), 'hex')
    const v = bytes[64]
    expect([27, 28]).toContain(v) // canonical TRON v = 27 + recovery

    const recovered = recoverCompressedPubKey(bytes.subarray(0, 64), v - 27, tronMessageHash('hello tron'))
    expect(recovered).toBe(pubHex(bareSigner))
  })

  test('signTransaction signs the txID digest and recovers to the signer key', async () => {
    const bareSigner = createMockBareSigner()
    const signer = new BareTronSigner({ bareSigner }).derive("0'/0/0")

    const sig = await signer.signTransaction(TXID)
    expect(sig).toMatch(/^[0-9a-f]{130}$/) // r+s+v, no 0x prefix

    const bytes = Buffer.from(sig, 'hex')
    const recovered = recoverCompressedPubKey(bytes.subarray(0, 64), bytes[64] - 27, Buffer.from(TXID, 'hex'))
    expect(recovered).toBe(pubHex(bareSigner))
  })

  test('signTransaction rejects an input that is not a 32-byte hex txID', async () => {
    const signer = newSigner().derive("0'/0/0")
    for (const bad of ['', 'zz'.repeat(32), 'ab', TXID + 'ab']) {
      await expect(signer.signTransaction(bad)).rejects.toThrow('Invalid txID')
    }
  })

  test('dispose deactivates the signer and clears cached key material', async () => {
    const signer = newSigner().derive("0'/0/0")
    await signer.getAddress()
    signer.dispose()
    expect(signer.isActive).toBe(false)
    expect(signer.address).toBeUndefined()
    expect(signer.keyPair.publicKey).toBeUndefined()
  })
})
