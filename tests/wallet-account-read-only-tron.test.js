import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { TronWeb, Trx } from 'tronweb'

const ADDRESS = 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb'

const getBalanceMock = jest.fn()
const getAccountMock = jest.fn()
const getAccountResourcesMock = jest.fn()
const getTransactionInfoMock = jest.fn()
const getChainParametersMock = jest.fn()

const triggerConstantContractMock = jest.fn()
const triggerSmartContractMock = jest.fn()
const sendTrxMock = jest.fn()
const freezeBalanceV2Mock = jest.fn()

jest.unstable_mockModule('tronweb', () => {
  const TronWebMock = jest.fn().mockImplementation((options) => {
    const provider = new TronWeb(options)

    provider.trx = {
      getBalance: getBalanceMock,
      getAccount: getAccountMock,
      getAccountResources: getAccountResourcesMock,
      getTransactionInfo: getTransactionInfoMock,
      getChainParameters: getChainParametersMock
    }

    provider.transactionBuilder = {
      triggerConstantContract: triggerConstantContractMock,
      triggerSmartContract: triggerSmartContractMock,
      sendTrx: sendTrxMock,
      freezeBalanceV2: freezeBalanceV2Mock
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

    test('should return false for an address with invalid casing', async () => {
      const lowercasedAddressAccount = new WalletAccountReadOnlyTron(ADDRESS.toLowerCase())

      const result = await lowercasedAddressAccount.verify(MESSAGE, SIGNATURE)

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
    const RECIPIENT = 'TAibbFBAkcNioexXTFWKbp65mgLp7JiqHD'

    const transferTx = (to) => ({
      txID: 'dummy-tx-id',
      raw_data: {
        contract: [{
          type: 'TransferContract',
          parameter: {
            value: {
              amount: 1_000_000,
              owner_address: TronWeb.address.toHex(ADDRESS),
              to_address: TronWeb.address.toHex(to)
            }
          }
        }]
      },
      raw_data_hex: '0a' + '00'.repeat(100)
    })

    test('should successfully quote a tronix transfer', async () => {
      const TRANSACTION = { to: RECIPIENT, value: 1_000_000 }
      const EXPECTED_FEE = 245_000n

      sendTrxMock.mockResolvedValue(transferTx(RECIPIENT))

      getAccountMock.mockResolvedValue({ address: RECIPIENT }) // recipient already activated

      getAccountResourcesMock.mockResolvedValue({
        freeNetLimit: 5000,
        freeNetUsed: 4900,
        NetLimit: 0,
        NetUsed: 0
      })

      const { fee, activationFee } = await account.quoteSendTransaction(TRANSACTION)

      expect(sendTrxMock).toHaveBeenCalledWith(TRANSACTION.to, TRANSACTION.value, ADDRESS)
      expect(getAccountMock).toHaveBeenCalledWith(TronWeb.address.toHex(RECIPIENT))
      expect(getAccountResourcesMock).toHaveBeenCalledWith(ADDRESS)

      expect(fee).toBe(EXPECTED_FEE)
      expect(activationFee).toBe(0n)
    })

    test('should quote 1.1 TRX for account activation when resources are missing', async () => {
      const TRANSACTION = { to: ADDRESS, value: 1_000_000 }
      // 1 TRX (Activation) + 0.1 TRX (Fixed Bandwidth Burn) = 1.1 TRX = 1,100,000 SUN
      const EXPECTED_FEE = 1_100_000n
      const EXPECTED_ACTIVATION_FEE = 1_000_000n

      sendTrxMock.mockResolvedValue(transferTx(ADDRESS))

      getAccountMock.mockResolvedValue({}) // Account does not exist

      getAccountResourcesMock.mockResolvedValue({
        freeNetLimit: 5000,
        freeNetUsed: 0,
        NetLimit: 0,
        NetUsed: 0
      })

      const { fee, activationFee } = await account.quoteSendTransaction(TRANSACTION)

      expect(sendTrxMock).toHaveBeenCalledWith(TRANSACTION.to, TRANSACTION.value, ADDRESS)
      expect(getAccountMock).toHaveBeenCalledWith(TronWeb.address.toHex(ADDRESS))
      expect(getAccountResourcesMock).toHaveBeenCalledWith(ADDRESS)
      expect(fee).toBe(EXPECTED_FEE)
      expect(activationFee).toBe(EXPECTED_ACTIVATION_FEE)
    })

    test('should quote only 1 TRX for account activation when frozen bandwidth is sufficient', async () => {
      const TRANSACTION = { to: ADDRESS, value: 1_000_000 }
      // 1 TRX (Activation) + 0 SUN (Frozen BP covers it) = 1,000,000 SUN
      const EXPECTED_FEE = 1_000_000n
      const EXPECTED_ACTIVATION_FEE = 1_000_000n

      sendTrxMock.mockResolvedValue(transferTx(ADDRESS))

      getAccountMock.mockResolvedValue({}) // Account does not exist

      getAccountResourcesMock.mockResolvedValue({
        freeNetLimit: 5000,
        freeNetUsed: 0,
        NetLimit: 5000,
        NetUsed: 0
      })

      const { fee, activationFee } = await account.quoteSendTransaction(TRANSACTION)

      expect(sendTrxMock).toHaveBeenCalledWith(TRANSACTION.to, TRANSACTION.value, ADDRESS)
      expect(getAccountMock).toHaveBeenCalledWith(TronWeb.address.toHex(ADDRESS))
      expect(getAccountResourcesMock).toHaveBeenCalledWith(ADDRESS)
      expect(fee).toBe(EXPECTED_FEE)
      expect(activationFee).toBe(EXPECTED_ACTIVATION_FEE)
    })

    test('should quote a smart contract call (energy + bandwidth, no activation fee)', async () => {
      const CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
      const CALL = {
        method: 'triggerSmartContract',
        args: [
          CONTRACT,
          'approve(address,uint256)',
          { feeLimit: 15_000_000 },
          [{ type: 'address', value: TronWeb.address.toHex(RECIPIENT) }, { type: 'uint256', value: 100 }],
          TronWeb.address.toHex(ADDRESS)
        ]
      }
      // energy_used (10000) * energy price (420) = 4,200,000 SUN; bandwidth covered by the free limit
      const EXPECTED_FEE = 4_200_000n

      triggerSmartContractMock.mockResolvedValue({
        transaction: {
          txID: 'contract-tx-id',
          raw_data: {
            contract: [{
              type: 'TriggerSmartContract',
              parameter: {
                value: {
                  contract_address: TronWeb.address.toHex(CONTRACT),
                  owner_address: TronWeb.address.toHex(ADDRESS),
                  data: 'deadbeef',
                  call_value: 0
                }
              }
            }]
          },
          raw_data_hex: '0a' + '00'.repeat(200)
        }
      })

      triggerConstantContractMock.mockResolvedValue({ energy_used: 10000 })

      getAccountResourcesMock.mockResolvedValue({
        freeNetLimit: 5000,
        freeNetUsed: 0,
        NetLimit: 0,
        NetUsed: 0,
        EnergyLimit: 0,
        EnergyUsed: 0
      })

      getChainParametersMock.mockResolvedValue([{ key: 'getEnergyFee', value: 420 }])

      const { fee, activationFee } = await account.quoteSendTransaction(CALL)

      expect(triggerConstantContractMock).toHaveBeenCalledWith(
        TronWeb.address.toHex(CONTRACT),
        '',
        { input: 'deadbeef', callValue: 0 },
        [],
        TronWeb.address.toHex(ADDRESS)
      )
      expect(fee).toBe(EXPECTED_FEE)
      expect(activationFee).toBe(0n)
    })

    test('should quote a system contract (bandwidth only, no energy, no activation)', async () => {
      const CALL = { method: 'freezeBalanceV2', args: [10_000_000, 'ENERGY', ADDRESS] }
      const EXPECTED_FEE = 245_000n

      freezeBalanceV2Mock.mockResolvedValue({
        txID: 'freeze-tx-id',
        raw_data: {
          contract: [{
            type: 'FreezeBalanceV2Contract',
            parameter: { value: { owner_address: TronWeb.address.toHex(ADDRESS), frozen_balance: 10_000_000, resource: 'ENERGY' } }
          }]
        },
        raw_data_hex: '0a' + '00'.repeat(100)
      })

      getAccountResourcesMock.mockResolvedValue({
        freeNetLimit: 0,
        freeNetUsed: 0,
        NetLimit: 0,
        NetUsed: 0
      })

      const { fee, activationFee } = await account.quoteSendTransaction(CALL)

      expect(freezeBalanceV2Mock).toHaveBeenCalledWith(10_000_000, 'ENERGY', ADDRESS)
      expect(triggerConstantContractMock).not.toHaveBeenCalled()
      expect(getChainParametersMock).not.toHaveBeenCalled()
      expect(fee).toBe(EXPECTED_FEE)
      expect(activationFee).toBe(0n)
    })

    test('should throw for an unknown builder method', async () => {
      await expect(account.quoteSendTransaction({ method: 'notARealMethod', args: [] }))
        .rejects.toThrow("Unknown tron web transaction builder method: 'notARealMethod'.")
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
      const EXPECTED_FEE = 0n

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

      const { fee, activationFee } = await account.quoteTransfer(TRANSFER)

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
      expect(getChainParametersMock).toHaveBeenCalled()

      expect(fee).toBe(EXPECTED_FEE)
      expect(activationFee).toBe(undefined)
    })

    test('should quote based on energy deficit', async () => {
      const TRANSFER = {
        token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        recipient: 'TAibbFBAkcNioexXTFWKbp65mgLp7JiqHD',
        amount: 100_000_000
      }
      const ENERGY_NEEDED = 10000
      const AVAILABLE_ENERGY = 4000
      const ENERGY_PRICE = 420
      // (10000 - 4000) * 420 = 2,520,000 SUN
      // Bandwidth is 0 because of free limit
      const EXPECTED_FEE = 2_520_000n

      triggerConstantContractMock.mockResolvedValue({
        constant_result: ['0000000000000000000000000000000000000000000000000000000000000064'],
        energy_used: ENERGY_NEEDED,
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
        EnergyUsed: 100000 - AVAILABLE_ENERGY
      })

      getChainParametersMock.mockResolvedValue([
        { key: 'getEnergyFee', value: ENERGY_PRICE }
      ])

      const { fee, activationFee } = await account.quoteTransfer(TRANSFER)

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
      expect(getChainParametersMock).toHaveBeenCalled()

      expect(fee).toBe(EXPECTED_FEE)
      expect(activationFee).toBe(undefined)
    })

    test('should throw "Insufficient token balance" when simulation reverts and balance is below the transfer amount', async () => {
      const TRANSFER = {
        token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        recipient: 'TAibbFBAkcNioexXTFWKbp65mgLp7JiqHD',
        amount: 100_000_000
      }

      // transfer simulation reverts
      triggerConstantContractMock.mockRejectedValueOnce(new Error('REVERT opcode'))
      // balanceOf returns 50_000_000 (0x02faf080) — below the transfer amount
      triggerConstantContractMock.mockResolvedValueOnce({
        constant_result: ['0000000000000000000000000000000000000000000000000000000002faf080']
      })

      await expect(account.quoteTransfer(TRANSFER))
        .rejects.toThrow('Insufficient token balance for the transfer.')

      expect(triggerConstantContractMock).toHaveBeenNthCalledWith(
        1,
        TRANSFER.token,
        'transfer(address,uint256)',
        {},
        [
          { type: 'address', value: TronWeb.address.toHex(TRANSFER.recipient) },
          { type: 'uint256', value: TRANSFER.amount }
        ],
        TronWeb.address.toHex(ADDRESS)
      )
      expect(triggerConstantContractMock).toHaveBeenNthCalledWith(
        2,
        TRANSFER.token,
        'balanceOf(address)',
        {},
        [{ type: 'address', value: TronWeb.address.toHex(ADDRESS) }],
        TronWeb.address.toHex(ADDRESS)
      )
    })

    test('should rethrow the original error when simulation reverts but balance is sufficient', async () => {
      const TRANSFER = {
        token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        recipient: 'TAibbFBAkcNioexXTFWKbp65mgLp7JiqHD',
        amount: 100_000_000
      }

      const originalError = new Error('REVERT opcode')

      // transfer simulation reverts
      triggerConstantContractMock.mockRejectedValueOnce(originalError)
      // balanceOf returns 200_000_000 (0x0bebc200) — above the transfer amount
      triggerConstantContractMock.mockResolvedValueOnce({
        constant_result: ['000000000000000000000000000000000000000000000000000000000bebc200']
      })

      await expect(account.quoteTransfer(TRANSFER)).rejects.toBe(originalError)

      expect(triggerConstantContractMock).toHaveBeenNthCalledWith(
        1,
        TRANSFER.token,
        'transfer(address,uint256)',
        {},
        [
          { type: 'address', value: TronWeb.address.toHex(TRANSFER.recipient) },
          { type: 'uint256', value: TRANSFER.amount }
        ],
        TronWeb.address.toHex(ADDRESS)
      )
      expect(triggerConstantContractMock).toHaveBeenNthCalledWith(
        2,
        TRANSFER.token,
        'balanceOf(address)',
        {},
        [{ type: 'address', value: TronWeb.address.toHex(ADDRESS) }],
        TronWeb.address.toHex(ADDRESS)
      )
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
