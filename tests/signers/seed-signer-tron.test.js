import { describe, test, expect, beforeEach } from '@jest/globals'
import * as bip39 from 'bip39'

const MNEMONIC = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const SEED = bip39.mnemonicToSeedSync(MNEMONIC)

const ACCOUNTS = {
  0: {
    path: "m/44'/195'/0'/0/0",
    address: 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb',
    publicKey: '03ebdf0c06e1523a5931e7593e3ac231f5a123b898eb6c02af61aa83b32f8603b0'
  },
  1: {
    path: "m/44'/195'/0'/0/1",
    address: 'TLeUMvxvtUmbCyHAzf3FKV7C2FxquGDWUj'
  }
}

// Import after fixtures are ready — will fail until Task 3 implements the signer
let SeedSignerTron
try {
  const mod = await import('../../src/signers/seed-signer-tron.js')
  SeedSignerTron = mod.default
} catch (_) {
  // file not yet created — tests below will fail as expected
}

describe('SeedSignerTron', () => {
  describe('root mode (from mnemonic)', () => {
    let root

    beforeEach(() => {
      root = new SeedSignerTron(MNEMONIC)
    })

    test('isRoot is true', () => {
      expect(root.isRoot).toBe(true)
    })

    test('isActive is true after construction', () => {
      expect(root.isActive).toBe(true)
    })

    test('address is undefined for root', () => {
      expect(root.address).toBeUndefined()
    })

    test('index is undefined for root', () => {
      expect(root.index).toBeUndefined()
    })

    test('path is undefined for root', () => {
      expect(root.path).toBeUndefined()
    })

    test('sign() throws on root signer', async () => {
      await expect(root.sign('hello')).rejects.toThrow('Cannot sign from a root signer')
    })

    test('signTransaction() throws on root signer', async () => {
      await expect(root.signTransaction('deadbeef')).rejects.toThrow('Cannot sign transactions from a root signer')
    })
  })

  describe('root mode (from seed bytes)', () => {
    test('accepts Uint8Array seed bytes', () => {
      const root = new SeedSignerTron(SEED)
      expect(root.isRoot).toBe(true)
    })
  })

  describe('construction guards', () => {
    test('throws on invalid mnemonic', () => {
      expect(() => new SeedSignerTron('invalid seed phrase here foo bar')).toThrow('The seed phrase is invalid')
    })

    test('throws if both seed and root provided', () => {
      const root = new SeedSignerTron(MNEMONIC)
      expect(() => new SeedSignerTron(MNEMONIC, { root })).toThrow('Provide either a seed or a root')
    })

    test('throws if neither seed nor root provided', () => {
      expect(() => new SeedSignerTron(null)).toThrow('Seed or root is required')
    })
  })

  describe('derive() — child mode', () => {
    let root, child

    beforeEach(() => {
      root = new SeedSignerTron(MNEMONIC)
      child = root.derive("0'/0/0")
    })

    test('isRoot is false for child', () => {
      expect(child.isRoot).toBe(false)
    })

    test('child has correct full path', () => {
      expect(child.path).toBe(ACCOUNTS[0].path)
    })

    test('child index is 0', () => {
      expect(child.index).toBe(0)
    })

    test('child address matches fixture', async () => {
      expect(child.address).toBe(ACCOUNTS[0].address)
    })

    test('getAddress() returns same as .address', async () => {
      expect(await child.getAddress()).toBe(child.address)
    })

    test('address starts with T (TRON mainnet prefix)', () => {
      expect(child.address).toMatch(/^T/)
    })

    test('derive index 1 gives different address', () => {
      const child1 = root.derive("0'/0/1")
      expect(child1.address).toBe(ACCOUNTS[1].address)
      expect(child1.address).not.toBe(child.address)
    })

    test('keyPair has privateKey and publicKey as Uint8Array', () => {
      const { privateKey, publicKey } = child.keyPair
      expect(privateKey).toBeInstanceOf(Uint8Array)
      expect(publicKey).toBeInstanceOf(Uint8Array)
      expect(privateKey).toHaveLength(32)
    })
  })

  describe('sign() — message signing', () => {
    let child

    beforeEach(() => {
      child = new SeedSignerTron(MNEMONIC).derive("0'/0/0")
    })

    test('returns a hex string with 0x prefix', async () => {
      const sig = await child.sign('hello world')
      expect(sig).toMatch(/^0x[0-9a-f]+$/i)
    })

    test('signature is 132 chars (0x + 65 bytes hex)', async () => {
      const sig = await child.sign('hello world')
      expect(sig).toHaveLength(132) // 0x + 130 hex chars (65 bytes)
    })

    test('same message produces same signature (deterministic)', async () => {
      const sig1 = await child.sign('hello')
      const sig2 = await child.sign('hello')
      expect(sig1).toBe(sig2)
    })

    test('different messages produce different signatures', async () => {
      const sig1 = await child.sign('hello')
      const sig2 = await child.sign('world')
      expect(sig1).not.toBe(sig2)
    })
  })

  describe('signTransaction()', () => {
    let child

    beforeEach(() => {
      child = new SeedSignerTron(MNEMONIC).derive("0'/0/0")
    })

    test('returns a hex string (no 0x prefix)', async () => {
      const txID = 'a'.repeat(64) // 32 bytes hex
      const sig = await child.signTransaction(txID)
      expect(sig).toMatch(/^[0-9a-f]+$/i)
      expect(sig).toHaveLength(130) // 65 bytes: r(32)+s(32)+v(1)
    })

    test('is deterministic for same txID', async () => {
      const txID = 'b'.repeat(64)
      const sig1 = await child.signTransaction(txID)
      const sig2 = await child.signTransaction(txID)
      expect(sig1).toBe(sig2)
    })
  })

  describe('dispose()', () => {
    test('sets isActive to false', () => {
      const root = new SeedSignerTron(MNEMONIC)
      root.dispose()
      expect(root.isActive).toBe(false)
    })

    test('child dispose zeroes the private key bytes', () => {
      const child = new SeedSignerTron(MNEMONIC).derive("0'/0/0")
      child.dispose()
      // After dispose, keyPair.privateKey should be null or zeroed
      const { privateKey } = child.keyPair
      if (privateKey !== null) {
        expect(privateKey.every(b => b === 0)).toBe(true)
      } else {
        expect(privateKey).toBeNull()
      }
    })
  })
})
