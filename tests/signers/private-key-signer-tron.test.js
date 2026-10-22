import { describe, expect, test } from '@jest/globals'

import { DisposalError, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

import PrivateKeySignerTron from '../../src/signers/private-key-signer-tron.js'

const ACCOUNT = {
  address: 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb',
  keyPair: {
    privateKey: '5d5645db7db2a3b86435e3ec9b3b2cc670fccef5b6d5705e310b8ac2d8d37633',
    publicKey: '03ebdf0c06e1523a5931e7593e3ac231f5a123b898eb6c02af61aa83b32f8603b0'
  }
}

const PRIVATE_KEY_BYTES = new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex'))
const PUBLIC_KEY_BYTES = new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))

const MESSAGE = 'Dummy message to sign.'
const MESSAGE_SIGNATURE = '0x67b1e4bb9a9b070cd60776ceab1ff4d7c4d4997bb5b4a71757da646f75d847e6600c22d8d83caa13d42c33099f75ba5ec30390467392aa78a3e5319da6c30e291b'

const TRANSACTION = { txID: 'cbc59768e37a8d186165d94cb56579b8c76ec9b78239709c357e5d8ccaa59b38' }
const TRANSACTION_SIGNATURE = '90772e79b238b0ce83446675f091e48a5ee7d3e76afcd830d21e91247aa9f7800d91038aaada318c28c6f01a2563a4a29b970bc651c9bdff5e7f70daf9a4f7e101'

const INVALID_PRIVATE_KEY_ERROR = new ValueError('The private key must be a valid 32-byte secp256k1 key (hex or bytes).')

const DISPOSAL_ERROR = new DisposalError('The signer has been disposed.')

describe('PrivateKeySignerTron', () => {
  describe('constructor', () => {
    test.each([
      ['a hex string', ACCOUNT.keyPair.privateKey],
      ['a 0x-prefixed hex string', '0x' + ACCOUNT.keyPair.privateKey],
      ['bytes', PRIVATE_KEY_BYTES]
    ])('should create a signer from %s', async (_, privateKey) => {
      const signer = new PrivateKeySignerTron(privateKey)

      expect(signer.isDerivable).toBe(false)
      expect(signer.path).toBeNull()
      expect(signer.disposed).toBe(false)
      expect(await signer.getAddress()).toBe(ACCOUNT.address)
      expect(signer.keyPair).toEqual({ privateKey: PRIVATE_KEY_BYTES, publicKey: PUBLIC_KEY_BYTES })
    })

    test.each([
      ['a short hex string', 'abcd'],
      ['a non-hex string', 'z'.repeat(64)],
      ['a 31-byte key', new Uint8Array(31).fill(1)],
      ['a zero key', new Uint8Array(32)],
      ['a key above the curve order', new Uint8Array(32).fill(0xff)]
    ])('should throw for %s', (_, privateKey) => {
      expect(() => new PrivateKeySignerTron(privateKey)).toThrow(INVALID_PRIVATE_KEY_ERROR)
    })
  })

  describe('derive', () => {
    test('should throw an unsupported operation error', async () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      await expect(signer.derive("0'/0/0")).rejects.toBeInstanceOf(UnsupportedOperationError)
      await expect(signer.derive("0'/0/0")).rejects.toThrow('derive(path)')
    })
  })

  describe('sign', () => {
    test('should return the correct signature', async () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      expect(await signer.sign(MESSAGE)).toBe(MESSAGE_SIGNATURE)
    })
  })

  describe('signTransaction', () => {
    test('should sign the transaction id', async () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      expect(await signer.signTransaction(TRANSACTION)).toEqual({
        ...TRANSACTION,
        signature: [TRANSACTION_SIGNATURE]
      })
    })
  })

  describe('dispose', () => {
    test('should stay disposed when disposed twice', () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      signer.dispose()
      signer.dispose()

      expect(signer.disposed).toBe(true)
      expect(signer.keyPair.privateKey).toBeNull()
    })

    test('should erase the private key and mark the signer as disposed', () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)
      const { privateKey } = signer.keyPair

      signer.dispose()

      expect(signer.disposed).toBe(true)
      expect(signer.keyPair).toEqual({ privateKey: null, publicKey: PUBLIC_KEY_BYTES })
      expect(privateKey.every((byte) => byte === 0)).toBe(true)
    })

    test.each([
      ['sign', (signer) => signer.sign(MESSAGE)],
      ['signTransaction', (signer) => signer.signTransaction(TRANSACTION)]
    ])('should throw from %s once disposed', async (_, call) => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      signer.dispose()

      await expect(call(signer)).rejects.toThrow(DISPOSAL_ERROR)
    })
  })

  describe('key ownership', () => {
    test('should keep working after the caller wipes the supplied key', async () => {
      const privateKey = Uint8Array.from(PRIVATE_KEY_BYTES)
      const signer = new PrivateKeySignerTron(privateKey)

      privateKey.fill(0)

      expect(await signer.sign(MESSAGE)).toBe(MESSAGE_SIGNATURE)
    })

    test('should not wipe the supplied key on dispose', () => {
      const privateKey = Uint8Array.from(PRIVATE_KEY_BYTES)
      const signer = new PrivateKeySignerTron(privateKey)

      signer.dispose()

      expect(privateKey).toEqual(PRIVATE_KEY_BYTES)
    })
  })
})
