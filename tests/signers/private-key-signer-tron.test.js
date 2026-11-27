import { describe, expect, test } from '@jest/globals'

import { Trx } from 'tronweb'

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

const TYPED_DATA = {
  domain: {
    name: 'GasFreeController',
    version: 'V1.0.0',
    chainId: '728126428',
    verifyingContract: 'TFFAMQLZybALaLb4uxHA9RBE7pxhUAjF3U'
  },
  types: {
    PermitTransfer: [
      { name: 'token', type: 'address' },
      { name: 'serviceProvider', type: 'address' },
      { name: 'user', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'version', type: 'uint256' },
      { name: 'nonce', type: 'uint256' }
    ]
  },
  message: {
    token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    serviceProvider: 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E',
    user: 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E',
    receiver: 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E',
    value: '1',
    maxFee: '1',
    deadline: 1,
    version: 1,
    nonce: 0
  }
}

const TYPED_DATA_ACCOUNT = {
  privateKey: '1111111111111111111111111111111111111111111111111111111111111111',
  address: 'TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ'
}

const TYPED_DATA_SIGNATURE = '0x687236217ae223e3dd1ca10664bc9593d7e0994e2e1cb3fb09dd6429997c88672520257566f938b1f20c0f72d70bbc5adfefb6907a5b2592d61e42b51ee1294d1b'

const INVALID_PRIVATE_KEY_ERROR = expect.objectContaining({ constructor: ValueError, message: 'The private key must be a valid 32-byte secp256k1 key (hex or bytes).' })

const DISPOSAL_ERROR = expect.objectContaining({ constructor: DisposalError, message: 'The signer has been disposed.' })

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

      await expect(signer.derive("0'/0/0"))
        .rejects.toThrow(expect.objectContaining({ constructor: UnsupportedOperationError, message: "Method 'derive(path)' is not supported." }))
    })
  })

  describe('sign', () => {
    test('should return the correct signature', async () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      expect(await signer.sign(MESSAGE)).toBe(MESSAGE_SIGNATURE)
    })
  })

  describe('signTransaction', () => {
    test('should throw if the transaction id is shorter than 32 bytes', async () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      await expect(signer.signTransaction({ ...TRANSACTION, txID: 'abc' }))
        .rejects.toStrictEqual(new ValueError('The transaction id must be a 32-byte hex string.'))
    })

    test('should throw if the transaction id is not hex', async () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      await expect(signer.signTransaction({ ...TRANSACTION, txID: 'z'.repeat(64) }))
        .rejects.toStrictEqual(new ValueError('The transaction id must be a 32-byte hex string.'))
    })

    test('should sign the transaction id', async () => {
      const signer = new PrivateKeySignerTron(ACCOUNT.keyPair.privateKey)

      expect(await signer.signTransaction(TRANSACTION)).toEqual({
        ...TRANSACTION,
        signature: [TRANSACTION_SIGNATURE]
      })
    })
  })

  describe('signTypedData', () => {
    test('should return the TIP-712 signature', async () => {
      const signer = new PrivateKeySignerTron(TYPED_DATA_ACCOUNT.privateKey)

      expect(await signer.signTypedData(TYPED_DATA)).toBe(TYPED_DATA_SIGNATURE)
    })

    test('should return a signature that tronweb verifies', async () => {
      const signer = new PrivateKeySignerTron(TYPED_DATA_ACCOUNT.privateKey)
      const { domain, types, message } = TYPED_DATA

      const signature = await signer.signTypedData(TYPED_DATA)

      expect(Trx.verifyTypedData(domain, types, message, signature, TYPED_DATA_ACCOUNT.address)).toBe(true)
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
      expect(privateKey).toEqual(new Uint8Array(32))
    })

    test.each([
      ['sign', (signer) => signer.sign(MESSAGE)],
      ['signTransaction', (signer) => signer.signTransaction(TRANSACTION)],
      ['signTypedData', (signer) => signer.signTypedData(TYPED_DATA)]
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
