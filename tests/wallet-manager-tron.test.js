import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals'

import WalletManagerTron from '../src/wallet-manager-tron.js'
import WalletAccountTron from '../src/wallet-account-tron.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

describe('WalletManagerTron', () => {
  let wallet

  beforeEach(() => {
    const tronWebMock = {
      trx: {
        getChainParameters: jest.fn().mockResolvedValue([
          { key: 'getTransactionFee', value: 1000 }
        ])
      }
    }

    wallet = new WalletManagerTron(SEED_PHRASE, {
      provider: tronWebMock
    })
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()
      expect(account).toBeInstanceOf(WalletAccountTron)
      expect(account.path).toBe("m/44'/195'/0'/0/0")
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)
      expect(account).toBeInstanceOf(WalletAccountTron)
      expect(account.path).toBe("m/44'/195'/0'/0/3")
    })

    test('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1))
        .rejects.toThrow('invalid child index: -1')
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")
      expect(account).toBeInstanceOf(WalletAccountTron)
      expect(account.path).toBe("m/44'/195'/1'/2/3")
    })

    test('should throw if the path is invalid', async () => {
      await expect(wallet.getAccountByPath("a'/b/c"))
        .rejects.toThrow("invalid child index: a'")
    })
  })

  describe('getFeeRates', () => {
    test('should return the correct fee rates', async () => {
      const feeRates = await wallet.getFeeRates()

      expect(feeRates.normal).toBeGreaterThan(0)
      expect(feeRates.fast).toBeGreaterThan(0)
    })

    test('should throw if the wallet is not connected to tron web', async () => {
      const wallet = new WalletManagerTron(SEED_PHRASE)

      await expect(wallet.getFeeRates())
        .rejects.toThrow('The wallet must be connected to tron web to get fee rates.')
    })
  })
})
