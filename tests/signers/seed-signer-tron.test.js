import { describe, expect, test } from '@jest/globals'
import * as bip39 from 'bip39'

import { DisposalError, ValueError } from '@tetherto/wdk-wallet'

import SeedSignerTron from '../../src/signers/seed-signer-tron.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'invalid seed phrase'
const SEED = bip39.mnemonicToSeedSync(SEED_PHRASE)

const COIN_NODE = {
  path: "m/44'/195'",
  address: 'TNKypw2WjeChcDkRJ5zkBxZqxUCrhUG1Ao'
}

const MASTER_NODE_ADDRESS = 'TXEi9t5yajmBVB1FUdok6W7s66aX6w1AyC'

const ACCOUNT_0 = {
  path: "m/44'/195'/0'/0/0",
  address: 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb',
  keyPair: {
    privateKey: '5d5645db7db2a3b86435e3ec9b3b2cc670fccef5b6d5705e310b8ac2d8d37633',
    publicKey: '03ebdf0c06e1523a5931e7593e3ac231f5a123b898eb6c02af61aa83b32f8603b0'
  }
}

const ACCOUNT_1 = {
  path: "m/44'/195'/0'/0/1",
  address: 'TLeUMvxvtUmbCyHAzf3FKV7C2FxquGDWUj'
}

const MESSAGE = 'Dummy message to sign.'
const MESSAGE_SIGNATURE = '0x67b1e4bb9a9b070cd60776ceab1ff4d7c4d4997bb5b4a71757da646f75d847e6600c22d8d83caa13d42c33099f75ba5ec30390467392aa78a3e5319da6c30e291b'

const TRANSACTION = { txID: 'cbc59768e37a8d186165d94cb56579b8c76ec9b78239709c357e5d8ccaa59b38' }
const ACCOUNT_0_TRANSACTION_SIGNATURE = '90772e79b238b0ce83446675f091e48a5ee7d3e76afcd830d21e91247aa9f7800d91038aaada318c28c6f01a2563a4a29b970bc651c9bdff5e7f70daf9a4f7e101'
const ACCOUNT_1_TRANSACTION_SIGNATURE = '7a17bbb17bb8d9d15fcf12c2ad5c8677260b9ef3384c57dacf80b9c3372223e3603599606895f60d46abf25764351e32413519a94e2df46daa86848a62c8dccb00'

const DISPOSAL_ERROR = new DisposalError('The signer has been disposed.')

describe('SeedSignerTron', () => {
  describe('constructor', () => {
    test('should default to the tron coin-type node', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE)

      expect(signer.isDerivable).toBe(true)
      expect(signer.path).toBe(COIN_NODE.path)
      expect(await signer.getAddress()).toBe(COIN_NODE.address)
    })

    test('should derive the given absolute path from a seed phrase', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path)

      expect(signer.path).toBe(ACCOUNT_0.path)
      expect(await signer.getAddress()).toBe(ACCOUNT_0.address)
    })

    test('should derive the given absolute path from a seed', async () => {
      const signer = new SeedSignerTron(SEED, ACCOUNT_0.path)

      expect(await signer.getAddress()).toBe(ACCOUNT_0.address)
    })

    test('should accept the master node path', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE, 'm')

      expect(signer.path).toBe('m')
      expect(await signer.getAddress()).toBe(MASTER_NODE_ADDRESS)
    })

    test('should not wipe a seed supplied by the caller', () => {
      const seed = Uint8Array.from(SEED)

      new SeedSignerTron(seed).dispose()

      expect(seed).toEqual(Uint8Array.from(SEED))
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new SeedSignerTron(INVALID_SEED_PHRASE))
        .toThrow(new ValueError('The seed phrase is invalid.'))
    })

    test.each([15, 65])('should throw if the seed is %i bytes long', (length) => {
      expect(() => new SeedSignerTron(new Uint8Array(length).fill(1)))
        .toThrow(new ValueError('The seed must be between 16 and 64 bytes.'))
    })

    test('should throw if the path is not absolute', () => {
      expect(() => new SeedSignerTron(SEED_PHRASE, "44'/195'"))
        .toThrow(ValueError)
      expect(() => new SeedSignerTron(SEED_PHRASE, "44'/195'"))
        .toThrow('The derivation path must be absolute (e.g. "m/44\'/195\'"), got "44\'/195\'".')
    })

    test('should throw if the path has an invalid child index', () => {
      expect(() => new SeedSignerTron(SEED_PHRASE, "m/44'/a'"))
        .toThrow(ValueError)
      expect(() => new SeedSignerTron(SEED_PHRASE, "m/44'/a'"))
        .toThrow('The derivation path "44\'/a\'" has an invalid child index: "a\'".')

      expect(() => new SeedSignerTron(SEED_PHRASE, "m/44'/2147483648'"))
        .toThrow(ValueError)
      expect(() => new SeedSignerTron(SEED_PHRASE, "m/44'/2147483648'"))
        .toThrow('The derivation path "44\'/2147483648\'" has an invalid child index: "2147483648\'".')
    })
  })

  describe('keyPair', () => {
    test('should return the key pair of the signer', () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path)

      expect(signer.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT_0.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT_0.keyPair.publicKey, 'hex'))
      })
    })
  })

  describe('derive', () => {
    test('should derive a child relative to the signer path', async () => {
      const root = new SeedSignerTron(SEED_PHRASE)

      const child = await root.derive("0'/0/1")

      expect(child).toBeInstanceOf(SeedSignerTron)
      expect(child.isDerivable).toBe(true)
      expect(child.path).toBe(ACCOUNT_1.path)
      expect(await child.getAddress()).toBe(ACCOUNT_1.address)
    })

    test('should derive the same key as the constructor', async () => {
      const child = await new SeedSignerTron(SEED_PHRASE).derive("0'/0/0")

      expect(child.keyPair).toEqual(new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path).keyPair)
    })

    test('should derive further from a derived child', async () => {
      const parent = await new SeedSignerTron(SEED_PHRASE).derive("0'/0")

      const child = await parent.derive('1')

      expect(child.path).toBe(ACCOUNT_1.path)
      expect(await child.getAddress()).toBe(ACCOUNT_1.address)
    })

    test('should throw if the path is not valid', async () => {
      const root = new SeedSignerTron(SEED_PHRASE)

      await expect(root.derive("a'/b/c")).rejects.toBeInstanceOf(ValueError)
      await expect(root.derive("a'/b/c")).rejects.toThrow('The derivation path "a\'/b/c" has an invalid child index: "a\'".')
      await expect(root.derive('-1')).rejects.toBeInstanceOf(ValueError)
      await expect(root.derive('-1')).rejects.toThrow('The derivation path "-1" has an invalid child index: "-1".')
      await expect(root.derive("m/0'")).rejects.toBeInstanceOf(ValueError)
      await expect(root.derive("m/0'")).rejects.toThrow('The derivation path "m/0\'" has an invalid child index: "m".')
    })

    test('should throw if a child index has leading zeros', async () => {
      const root = new SeedSignerTron(SEED_PHRASE)

      await expect(root.derive("0'/0/01"))
        .rejects.toBeInstanceOf(ValueError)
      await expect(root.derive("0'/0/01"))
        .rejects.toThrow('The derivation path "0\'/0/01" has an invalid child index: "01".')

      expect(() => new SeedSignerTron(SEED_PHRASE, "m/44'/0195'"))
        .toThrow(ValueError)
      expect(() => new SeedSignerTron(SEED_PHRASE, "m/44'/0195'"))
        .toThrow('The derivation path "44\'/0195\'" has an invalid child index: "0195\'".')
    })
  })

  describe('sign', () => {
    test('should return the correct signature', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path)

      expect(await signer.sign(MESSAGE)).toBe(MESSAGE_SIGNATURE)
    })
  })

  describe('signTransaction', () => {
    test('should sign the transaction id', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path)

      expect(await signer.signTransaction(TRANSACTION)).toEqual({
        ...TRANSACTION,
        signature: [ACCOUNT_0_TRANSACTION_SIGNATURE]
      })
    })

    test('should keep the signatures the transaction already carries', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_1.path)

      const transaction = { ...TRANSACTION, signature: [ACCOUNT_0_TRANSACTION_SIGNATURE] }

      expect(await signer.signTransaction(transaction)).toEqual({
        ...TRANSACTION,
        signature: [ACCOUNT_0_TRANSACTION_SIGNATURE, ACCOUNT_1_TRANSACTION_SIGNATURE]
      })

      expect(transaction.signature).toEqual([ACCOUNT_0_TRANSACTION_SIGNATURE])
    })
  })

  describe('dispose', () => {
    test('should not be disposed after construction or derivation', async () => {
      const root = new SeedSignerTron(SEED_PHRASE)

      expect(root.disposed).toBe(false)
      expect((await root.derive("0'/0/0")).disposed).toBe(false)
    })

    test('should erase the private key', () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path)
      const { privateKey } = signer.keyPair

      signer.dispose()

      expect(signer.disposed).toBe(true)
      expect(signer.keyPair.privateKey).toBeNull()
      expect(signer.keyPair.publicKey).toEqual(new Uint8Array(Buffer.from(ACCOUNT_0.keyPair.publicKey, 'hex')))
      expect(privateKey.every((byte) => byte === 0)).toBe(true)
    })

    test('should not affect the children of the disposed signer', async () => {
      const root = new SeedSignerTron(SEED_PHRASE)
      const child = await root.derive("0'/0/0")

      root.dispose()

      expect(child.disposed).toBe(false)
      expect(await child.sign(MESSAGE)).toBe(MESSAGE_SIGNATURE)
    })

    test('should not affect the parent of the disposed signer', async () => {
      const root = new SeedSignerTron(SEED_PHRASE)
      const child = await root.derive("0'/0/0")

      child.dispose()

      expect(root.disposed).toBe(false)
      expect(await (await root.derive("0'/0/1")).getAddress()).toBe(ACCOUNT_1.address)
    })

    test.each([
      ['derive', (signer) => signer.derive("0'/0/0")],
      ['sign', (signer) => signer.sign(MESSAGE)],
      ['signTransaction', (signer) => signer.signTransaction(TRANSACTION)]
    ])('should throw from %s once disposed', async (_, call) => {
      const signer = new SeedSignerTron(SEED_PHRASE)

      signer.dispose()

      await expect(call(signer)).rejects.toThrow(DISPOSAL_ERROR)
    })

    test('should stay disposed when disposed twice', () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path)

      signer.dispose()
      signer.dispose()

      expect(signer.disposed).toBe(true)
      expect(signer.keyPair.privateKey).toBeNull()
    })

    test('should keep returning the address once disposed', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE, ACCOUNT_0.path)

      signer.dispose()

      expect(await signer.getAddress()).toBe(ACCOUNT_0.address)
    })
  })
})
