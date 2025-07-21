import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals'

import * as bip39 from 'bip39'

import TronWeb from 'tronweb'

import WalletAccountTron from '../src/wallet-account-tron.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'invalid seed phrase'
const SEED = bip39.mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT = {
  index: 0,
  path: "m/44'/195'/0'/0/0",
  address: 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb',
  balance: 12345,
  keyPair: {
    privateKey: '5d5645db7db2a3b86435e3ec9b3b2cc670fccef5b6d5705e310b8ac2d8d37633',
    publicKey: '03ebdf0c06e1523a5931e7593e3ac231f5a123b898eb6c02af61aa83b32f8603b0'
  }
}

describe('WalletAccountTron', () => {
  let account,
    tronWeb

  beforeEach(() => {
    tronWeb = new TronWeb({
      fullHost: 'https://tron-rpc.example.com'
    })

    account = new WalletAccountTron(SEED, "0'/0/0", { provider: tronWeb })
  })

  afterEach(() => {
    account.dispose()
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      const account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")

      expect(account.index).toBe(ACCOUNT.index)

      expect(account.path).toBe(ACCOUNT.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const account = new WalletAccountTron(SEED, "0'/0/0")

      expect(account.index).toBe(ACCOUNT.index)

      expect(account.path).toBe(ACCOUNT.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new WalletAccountTron(INVALID_SEED_PHRASE, "0'/0/0"))
        .toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      expect(() => new WalletAccountTron(SEED_PHRASE, "a'/b/c"))
        .toThrow("invalid child index: a'")
    })
  })

  describe('getAddress', () => {
    test('should return the correct address', async () => {
      const address = await account.getAddress()

      expect(address).toBe(ACCOUNT.address)
    })
  })

  describe('sign', () => {
    const MESSAGE = 'Dummy message to sign.'

    const EXPECTED_SIGNATURE = '770e7176ecd91829c91b99020742d013c4bafcc989bbcd2a44e67388af357b0d5886aa1d8dc61be0f00e7decc0c5e1e5adb132604ebface654f09656e5045794'

    test('should return the correct signature', async () => {
      const signature = await account.sign(MESSAGE)

      expect(signature).toBe(EXPECTED_SIGNATURE)
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'

    const SIGNATURE = '770e7176ecd91829c91b99020742d013c4bafcc989bbcd2a44e67388af357b0d5886aa1d8dc61be0f00e7decc0c5e1e5adb132604ebface654f09656e5045794'

    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('Another message.', SIGNATURE)

      expect(result).toBe(false)
    })

    test('should throw on a malformed signature', async () => {
      await expect(account.verify(MESSAGE, 'A bad signature'))
        .rejects.toThrow('Uint8Array expected of length 64, got length=0')
    })
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      tronWeb.trx.getBalance = jest.fn().mockResolvedValue(ACCOUNT.balance)

      const balance = await account.getBalance()

      expect(balance).toBe(ACCOUNT.balance)
    })

    test('should throw if the account is not connected to tron web', async () => {
      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")

      await expect(account.getBalance()).rejects.toThrow('The wallet must be connected to tron web to retrieve balances.')
    })
  })

  describe('getTokenBalance', () => {
    const TOKEN_ADDRESS = '0xTOKEN'
    const TOKEN_BALANCE = 1000

    test('should return the correct token balance of the account', async () => {
      tronWeb.transactionBuilder.triggerConstantContract = jest.fn().mockResolvedValue({ constant_result: [TOKEN_BALANCE.toString(16)], transaction: { raw_data_hex: 'abcd' }, energy_used: 0 })

      const balance = await account.getTokenBalance(TOKEN_ADDRESS)

      expect(balance).toBe(TOKEN_BALANCE)
    })

    test('should throw if the account is not connected to tron web', async () => {
      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")

      await expect(account.getTokenBalance('0xTOKEN')).rejects.toThrow('The wallet must be connected to tron web to retrieve token balances.')
    })
  })

  describe('sendTransaction', () => {
    const TRANSACTION = { to: 'TUD9S8QfRig52cT721AYkXSfho2uqZcrQb', value: 1000 }
    const TRANSACTION_RESULT = { hash: 'b164fb1f395a1dc1bc7c88ab5ad7286f3fd4c54ef2884171d9a4cac48178b4e1', fee: 64000 }

    test('should successfully send a transaction', async () => {
      tronWeb.trx.sendRawTransaction = jest.fn().mockResolvedValue({ txid: TRANSACTION_RESULT.hash })

      tronWeb.trx.getAccountResources = jest.fn().mockResolvedValue({
        freeNetLimit: 10000,
        freeNetUsed: 10000,
        NetLimit: 10000,
        NetUsed: 10000
      })

      tronWeb.transactionBuilder.sendTrx = jest.fn().mockResolvedValue({ raw_data_hex: 'a'.repeat(64), txID: TRANSACTION_RESULT.hash })

      const result = await account.sendTransaction(TRANSACTION)

      expect(result.hash).toBe(TRANSACTION_RESULT.hash)
      expect(result.fee).toBe(TRANSACTION_RESULT.fee)
    })

    test('should throw if the account is not connected to tron web', async () => {
      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")

      await expect(account.sendTransaction({})).rejects.toThrow('The wallet must be connected to tron web to send transactions.')
    })
  })

  describe('quoteSendTransaction', () => {
    const TRANSACTION = { to: 'TUD9S8QfRig52cT721AYkXSfho2uqZcrQb', value: 1000 }

    test('should successfully quote a transaction', async () => {
      tronWeb.transactionBuilder.sendTrx = jest.fn().mockResolvedValue({ raw_data_hex: 'a'.repeat(64) })

      tronWeb.trx.getAccountResources = jest.fn().mockResolvedValue({
        freeNetLimit: 10000,
        freeNetUsed: 10000,
        NetLimit: 10000,
        NetUsed: 10000
      })

      const result = await account.quoteSendTransaction(TRANSACTION)

      expect(result).toEqual({ fee: 64000 })
    })

    test('should throw if the account is not connected to tron web', async () => {
      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")

      expect(account.quoteSendTransaction(TRANSACTION)).rejects.toThrow('The wallet must be connected to tron web to quote transactions.')
    })
  })

  describe('transfer', () => {
    const TRANSFER = { token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', recipient: 'TUD9S8QfRig52cT721AYkXSfho2uqZcrQb', amount: 1000 }
    const TRANSFER_RESULT = { hash: 'b164fb1f395a1dc1bc7c88ab5ad7286f3fd4c54ef2884171d9a4cac48178b4e1', fee: 106000 }

    test('should successfully transfer tokens', async () => {
      tronWeb.trx.sendRawTransaction = jest.fn().mockResolvedValue({ txid: TRANSFER_RESULT.hash })

      tronWeb.trx.getChainParameters = jest.fn().mockResolvedValue([{ key: 'getEnergyFee', value: 420 }])

      tronWeb.trx.getAccountResources = jest.fn().mockResolvedValue({
        freeNetLimit: 10000,
        freeNetUsed: 10000,
        NetLimit: 10000,
        NetUsed: 10000
      })

      tronWeb.transactionBuilder.triggerConstantContract = jest.fn().mockResolvedValue({
        transaction: { raw_data_hex: 'a'.repeat(64) },
        energy_used: 100
      })

      tronWeb.transactionBuilder.triggerSmartContract = jest.fn().mockResolvedValue({
        transaction: { raw_data_hex: 'a'.repeat(64), txID: TRANSFER_RESULT.hash }
      })

      tronWeb.trx.sendRawTransaction = jest.fn().mockResolvedValue({ txid: TRANSFER_RESULT.hash })

      const result = await account.transfer(TRANSFER)

      expect(result).toEqual(TRANSFER_RESULT)
    })

    test('should throw if transfer fee exceeds the transfer max fee configuration', async () => {
      tronWeb.transactionBuilder.triggerConstantContract = jest.fn().mockResolvedValue({
        transaction: { raw_data_hex: 'a'.repeat(64) },
        energy_used: 100
      })

      tronWeb.trx.getChainParameters = jest.fn().mockResolvedValue([{ key: 'getEnergyFee', value: 420 }])

      tronWeb.trx.getAccountResources = jest.fn().mockResolvedValue({
        freeNetLimit: 10000,
        freeNetUsed: 10000,
        NetLimit: 10000,
        NetUsed: 10000
      })

      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0", { provider: tronWeb, transferMaxFee: 0 })

      await expect(account.transfer(TRANSFER)).rejects.toThrow('Exceeded maximum fee cost for transfer operations.')
    })

    test('should throw if the account is not connected to tron web', async () => {
      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")

      await expect(account.transfer({})).rejects.toThrow('The wallet must be connected to tron web to transfer tokens.')
    })
  })

  describe('quoteTransfer', () => {
    const TRANSFER = { token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', recipient: 'TUD9S8QfRig52cT721AYkXSfho2uqZcrQb', amount: 1000 }

    test('should successfully quote a transfer operation', async () => {
      tronWeb.trx.getChainParameters = jest.fn().mockResolvedValue([{ key: 'getEnergyFee', value: 420 }])

      tronWeb.trx.getAccountResources = jest.fn().mockResolvedValue({
        freeNetLimit: 10000,
        freeNetUsed: 10000,
        NetLimit: 10000,
        NetUsed: 10000
      })

      tronWeb.transactionBuilder.triggerConstantContract = jest.fn().mockResolvedValue({
        transaction: { raw_data_hex: 'a'.repeat(64) },
        energy_used: 100
      })

      const { fee } = await account.quoteTransfer(TRANSFER)

      expect(fee).toBe(106000)
    })

    test('should throw if the account is not connected to tron web', async () => {
      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")
      await expect(account.quoteTransfer({})).rejects.toThrow('The wallet must be connected to tron web to quote transfer operations.')
    })
  })

  describe('getTransactionReceipt', () => {
    const TRANSACTION_RECEIPT = { id: 'transaction-id' }

    test('should return the correct transaction receipt', async () => {
      tronWeb.trx.getTransactionInfo = jest.fn().mockResolvedValue(TRANSACTION_RECEIPT)

      const receipt = await account.getTransactionReceipt(TRANSACTION_RECEIPT.id)

      expect(receipt).toEqual(TRANSACTION_RECEIPT)
    })

    test('should return null if the transaction has not been included in a block yet', async () => {
      tronWeb.trx.getTransactionInfo = jest.fn().mockResolvedValue(null)

      const receipt = await account.getTransactionReceipt(TRANSACTION_RECEIPT.id)

      expect(receipt).toBeNull()
    })

    test('should throw if the account is not connected to tron web', async () => {
      account = new WalletAccountTron(SEED_PHRASE, "0'/0/0")

      expect(account.getTransactionReceipt(TRANSACTION_RECEIPT.id)).rejects.toThrow()
    })
  })
})
