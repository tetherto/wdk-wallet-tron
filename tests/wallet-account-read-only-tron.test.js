import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { TronWeb, Trx } from 'tronweb'

const ADDRESS = 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb'

const getBalanceMock = jest.fn()
const getAccountResourcesMock = jest.fn()
const getTransactionInfoMock = jest.fn()
const getChainParametersMock = jest.fn()

const triggerConstantContractMock = jest.fn()
const sendTrxMock = jest.fn()

jest.unstable_mockModule('tronweb', () => {
  const TronWebMock = jest.fn().mockImplementation((options) => {
    const provider = new TronWeb(options)

    provider.trx = {
      getBalance: getBalanceMock,
      getAccountResources: getAccountResourcesMock,
      getTransactionInfo: getTransactionInfoMock,
      getChainParameters: getChainParametersMock
    }

    provider.transactionBuilder = {
      triggerConstantContract: triggerConstantContractMock,
      sendTrx: sendTrxMock
    }

    return provider
  })

  // Assigns static properties of the 'TronWeb' class to the mock constructor:
  Object.defineProperties(TronWebMock, Object.getOwnPropertyDescriptors(TronWeb))

  return {
    TronWeb: TronWebMock,
    Trx
  }
})

const { WalletAccountReadOnlyTron } = await import('../index.js')

describe('WalletAccountReadOnlyTron', () => {
  let account

  beforeEach(() => {
    jest.clearAllMocks()

    account = new WalletAccountReadOnlyTron(ADDRESS, {
      provider: 'https://tron.web.provider/'
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'
    const SIGNATURE = '0x67b1e4bb9a9b070cd60776ceab1ff4d7c4d4997bb5b4a71757da646f75d847e6600c22d8d83caa13d42c33099f75ba5ec30390467392aa78a3e5319da6c30e291b'

    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('Another message.', SIGNATURE)

      expect(result).toBe(false)
    })

    test('should throw on a malformed signature', async () => {
      await expect(account.verify(MESSAGE, '0xinvalid'))
        .rejects.toThrow(/invalid BytesLike value/)
    })
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      const DUMMY_BALANCE = 1_000_000_000
      getBalanceMock.mockResolvedValue(DUMMY_BALANCE)

      const balance = await account.getBalance()

      expect(getBalanceMock).toHaveBeenCalledWith(ADDRESS)
      expect(balance).toBe(1_000_000_000n)
    })

    test('should throw if the account is not connected to tron web', async () => {
      const disconnectedAccount = new WalletAccountReadOnlyTron(ADDRESS)
      await expect(disconnectedAccount.getBalance())
        .rejects.toThrow('The wallet must be connected to tron web to retrieve balances.')
    })
  })

  describe('getTokenBalance', () => {
    const TOKEN_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

    test('should return the correct token balance of the account', async () => {
      const DUMMY_CONSTANT_RESULT = {
        constant_result: ['00000000000000000000000000000000000000000000000000000000000f4240']
      }

      triggerConstantContractMock.mockResolvedValue(DUMMY_CONSTANT_RESULT)

      const balance = await account.getTokenBalance(TOKEN_ADDRESS)

      expect(triggerConstantContractMock).toHaveBeenCalledWith(
        TOKEN_ADDRESS,
        'balanceOf(address)',
        {},
        [{ type: 'address', value: TronWeb.address.toHex(ADDRESS) }],
        TronWeb.address.toHex(ADDRESS)
      )

      expect(balance).toBe(1_000_000n)
    })

    test('should throw if the account is not connected to tron web', async () => {
      const disconnectedAccount = new WalletAccountReadOnlyTron(ADDRESS)
      await expect(disconnectedAccount.getTokenBalance(TOKEN_ADDRESS))
        .rejects.toThrow('The wallet must be connected to tron web to retrieve token balances.')
    })
  })

  describe('quoteSendTransaction', () => {
    test('should successfully quote a transaction', async () => {
      const TRANSACTION = {
        to: 'TAibbFBAkcNioexXTFWKbp65mgLp7JiqHD',
        value: 1_000_000
      }
      const EXPECTED_FEE = 202_000n

      sendTrxMock.mockResolvedValue({
        txID: 'dummy-tx-id',
        raw_data_hex: '0a' + '00'.repeat(100)
      })

      getAccountResourcesMock.mockResolvedValue({
        freeNetLimit: 5000,
        freeNetUsed: 4900,
        NetLimit: 0,
        NetUsed: 0
      })

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      expect(sendTrxMock).toHaveBeenCalledWith(
        TRANSACTION.to,
        TRANSACTION.value,
        ADDRESS
      )

      expect(getAccountResourcesMock).toHaveBeenCalledWith(ADDRESS)

      expect(fee).toBe(EXPECTED_FEE)
    })

    test('should throw if the account is not connected to tron web', async () => {
      const disconnectedAccount = new WalletAccountReadOnlyTron(ADDRESS)
      await expect(disconnectedAccount.quoteSendTransaction({ to: ADDRESS, value: 1000 }))
        .rejects.toThrow('The wallet must be connected to tron web to quote transactions.')
    })
  })

  describe('quoteTransfer', () => {
    test('should successfully quote a transfer operation', async () => {
      const TRANSFER = {
        token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        recipient: 'TAibbFBAkcNioexXTFWKbp65mgLp7JiqHD',
        amount: 100_000_000
      }

      triggerConstantContractMock.mockResolvedValue({
        constant_result: ['0000000000000000000000000000000000000000000000000000000000000064'],
        energy_used: 10000,
        transaction: {
          raw_data_hex: '0a' + '00'.repeat(200)
        }
      })

      getAccountResourcesMock.mockResolvedValue({
        freeNetLimit: 5000,
        freeNetUsed: 0,
        NetLimit: 0,
        NetUsed: 0,
        EnergyLimit: 100000,
        EnergyUsed: 0
      })

      getChainParametersMock.mockResolvedValue([
        { key: 'getEnergyFee', value: 420 }
      ])

      const { fee } = await account.quoteTransfer(TRANSFER)

      expect(triggerConstantContractMock).toHaveBeenCalledWith(
        TRANSFER.token,
        'transfer(address,uint256)',
        {},
        [
          { type: 'address', value: TronWeb.address.toHex(TRANSFER.recipient) },
          { type: 'uint256', value: TRANSFER.amount }
        ],
        TronWeb.address.toHex(ADDRESS)
      )

      expect(getAccountResourcesMock).toHaveBeenCalledWith(ADDRESS)

      expect(typeof fee).toBe('bigint')
    })

    test('should throw if the account is not connected to tron web', async () => {
      const disconnectedAccount = new WalletAccountReadOnlyTron(ADDRESS)
      await expect(disconnectedAccount.quoteTransfer({
        token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        recipient: ADDRESS,
        amount: 100
      }))
        .rejects.toThrow('The wallet must be connected to tron web to quote transfer operations.')
    })
  })

  describe('getTransactionReceipt', () => {
    const TRANSACTION_HASH = 'abc123def456'

    test('should return the correct transaction receipt', async () => {
      const DUMMY_RECEIPT = {
        id: TRANSACTION_HASH,
        blockNumber: 12345,
        fee: 1000,
        result: 'SUCCESS'
      }

      getTransactionInfoMock.mockResolvedValue(DUMMY_RECEIPT)

      const receipt = await account.getTransactionReceipt(TRANSACTION_HASH)

      expect(getTransactionInfoMock).toHaveBeenCalledWith(TRANSACTION_HASH)
      expect(receipt).toEqual(DUMMY_RECEIPT)
    })

    test('should return null if the transaction has not been included in a block yet', async () => {
      getTransactionInfoMock.mockResolvedValue({})

      const receipt = await account.getTransactionReceipt(TRANSACTION_HASH)

      expect(getTransactionInfoMock).toHaveBeenCalledWith(TRANSACTION_HASH)
      expect(receipt).toBe(null)
    })

    test('should throw if the account is not connected to tron web', async () => {
      const disconnectedAccount = new WalletAccountReadOnlyTron(ADDRESS)
      await expect(disconnectedAccount.getTransactionReceipt(TRANSACTION_HASH))
        .rejects.toThrow('The wallet must be connected to tron web to fetch transaction receipts.')
    })
  })
})
