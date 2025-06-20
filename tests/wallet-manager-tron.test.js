/* eslint-env jest */
import { jest } from '@jest/globals'
import WalletManagerTron from '../src/wallet-manager-tron.js'
import WalletAccountTron from '../src/wallet-account-tron.js'

describe('WalletManagerTron', () => {
  let walletManager
  const SEED_PHRASE =
    'between oval abandon quantum heavy stable guess limb ring hobby surround wall'
  const testConfig = {
    // rpcUrl: "https://api.trongrid.io", // Mainnet
    // rpcUrl: 'https://api.shasta.trongrid.io' // Testnet
    provider: 'https://nile.trongrid.io' // Nile testnet
  }

  beforeEach(async () => {
    walletManager = new WalletManagerTron(SEED_PHRASE, testConfig)
  })

  describe('constructor', () => {
    test('should throw an error if the provider is invalid', () => {
      // eslint-disable-next-line no-new
      expect(() => { new WalletManagerTron(SEED_PHRASE, "a'/b/c") })
        .toThrow('Invalid full node provided')
    })
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await walletManager.getAccount()

      expect(account).toBeInstanceOf(WalletAccountTron)

      expect(account.path).toBe("m/44'/195'/0'/0/0")
    })

    test('should return the account at the given index', async () => {
      const account = await walletManager.getAccount(3)

      expect(account).toBeInstanceOf(WalletAccountTron)

      expect(account.path).toBe("m/44'/195'/0'/0/3")
    })

    test('should throw if the index is a negative number', async () => {
      await expect(walletManager.getAccount(-1))
        .rejects.toThrow('Invalid derivation path format')
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await walletManager.getAccountByPath("1'/2/3")

      expect(account).toBeInstanceOf(WalletAccountTron)

      expect(account.path).toBe("m/44'/195'/1'/2/3")
    })

    test('should throw if the path is invalid', async () => {
      await expect(walletManager.getAccountByPath("a'/b/c"))
        .rejects.toThrow('Invalid derivation path format')
    })
  })

  describe('getFeeRates', () => {
    test('should return the correct fee rates', async () => {
      const feeRates = await walletManager.getFeeRates()

      expect(feeRates.normal).toBe(1_100)

      expect(feeRates.fast).toBe(2_000)
    })
  })

  describe('dispose', () => {
    it('should dispose all accounts and clear sensitive data', async () => {
      const account1 = await walletManager.getAccount(0)
      const account2 = await walletManager.getAccount(1)

      const disposeSpy1 = jest.spyOn(account1, 'dispose')
      const disposeSpy2 = jest.spyOn(account2, 'dispose')

      walletManager.dispose()

      expect(disposeSpy1).toHaveBeenCalled()
      expect(disposeSpy2).toHaveBeenCalled()

      expect(walletManager.seed.equals(Buffer.alloc(64))).toBe(true)
    })
  })
})
