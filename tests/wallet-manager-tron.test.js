import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import { TronWeb, Trx } from 'tronweb'

jest.unstable_mockModule('tronweb', () => {
  const TronWebMock = jest.fn().mockImplementation(() => ({
    trx: {
      getChainParameters: jest.fn().mockResolvedValue([
        { key: 'getTransactionFee', value: 1000 }
      ])
    }
  }))

  // Assigns static properties of the 'TronWeb' class to the mock constructor:
  Object.defineProperties(TronWebMock, Object.getOwnPropertyDescriptors(TronWeb))

  return {
    TronWeb: TronWebMock,
    Trx
  }
})

const { default: WalletManagerTron } = await import('../src/wallet-manager-tron.js')
const { default: WalletAccountTron } = await import('../src/wallet-account-tron.js')
const { default: SeedSignerTron } = await import('../src/signers/seed-signer-tron.js')

const MNEMONIC = 'cook voyage document eight skate token alien guide drink uncle term abuse'

describe('WalletManagerTron', () => {
  let root, wallet

  beforeEach(() => {
    root = new SeedSignerTron(MNEMONIC)
    wallet = new WalletManagerTron(root, { provider: 'https://api.trongrid.io' })
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('getAccount()', () => {
    test('returns WalletAccountTron at index 0 by default', async () => {
      const account = await wallet.getAccount()
      expect(account).toBeInstanceOf(WalletAccountTron)
    })

    test('account at index 0 has correct path', async () => {
      const account = await wallet.getAccount()
      expect(account.path).toBe("m/44'/195'/0'/0/0")
    })

    test('account at index 3 has correct path', async () => {
      const account = await wallet.getAccount(3)
      expect(account.path).toBe("m/44'/195'/0'/0/3")
    })

    test('returns same cached instance on second call', async () => {
      const a1 = await wallet.getAccount(0)
      const a2 = await wallet.getAccount(0)
      expect(a1).toBe(a2)
    })
  })

  describe('getAccountByPath()', () => {
    test('returns account with given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")
      expect(account.path).toBe("m/44'/195'/1'/2/3")
    })

    test('throws if signer name not found', async () => {
      await expect(wallet.getAccountByPath("0'/0/0", 'nonexistent'))
        .rejects.toThrow('nonexistent')
    })

    test('caches by signerName:path key', async () => {
      const a1 = await wallet.getAccountByPath("0'/0/0")
      const a2 = await wallet.getAccountByPath("0'/0/0")
      expect(a1).toBe(a2)
    })
  })

  describe('getFeeRates()', () => {
    test('returns normal and fast fee rates as bigints', async () => {
      const rates = await wallet.getFeeRates()
      expect(typeof rates.normal).toBe('bigint')
      expect(typeof rates.fast).toBe('bigint')
      expect(rates.fast > rates.normal).toBe(true)
    })

    test('normal is 110% of base fee', async () => {
      const rates = await wallet.getFeeRates()
      // base fee = 1000, normal = 1000 * 110 / 100 = 1100n
      expect(rates.normal).toBe(1100n)
    })

    test('fast is 200% of base fee', async () => {
      const rates = await wallet.getFeeRates()
      expect(rates.fast).toBe(2000n)
    })

    test('throws if not connected to a provider', async () => {
      const offline = new WalletManagerTron(root)
      await expect(offline.getFeeRates()).rejects.toThrow('connected to tron web')
    })
  })

  describe('static methods', () => {
    test('getRandomSeedPhrase returns a valid mnemonic', () => {
      const phrase = WalletManagerTron.getRandomSeedPhrase()
      expect(WalletManagerTron.isValidSeedPhrase(phrase)).toBe(true)
    })

    test('isValidSeedPhrase returns false for invalid phrase', () => {
      expect(WalletManagerTron.isValidSeedPhrase('not a valid phrase')).toBe(false)
    })
  })
})
