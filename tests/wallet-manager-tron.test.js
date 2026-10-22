import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import * as bip39 from 'bip39'

import { TronWeb, Trx } from 'tronweb'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const getChainParametersMock = jest.fn()

jest.unstable_mockModule('tronweb', () => {
  const TronWebMock = jest.fn().mockReturnValue({
    trx: {
      getChainParameters: getChainParametersMock
    }
  })

  // Assigns static properties of the 'TronWeb' class to the mock constructor:
  Object.defineProperties(TronWebMock, Object.getOwnPropertyDescriptors(TronWeb))

  return {
    TronWeb: TronWebMock,
    Trx
  }
})

const { default: WalletManagerTron, WalletAccountTron, InvalidSignerError, ValueError } = await import('../index.js')
const { SeedSignerTron, PrivateKeySignerTron } = await import('../src/signers/index.js')

const PRIVATE_KEY = '5d5645db7db2a3b86435e3ec9b3b2cc670fccef5b6d5705e310b8ac2d8d37633'
const ACCOUNT_0_ADDRESS = 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb'
const ACCOUNT_1_ADDRESS = 'TLeUMvxvtUmbCyHAzf3FKV7C2FxquGDWUj'
const SECOND_SEED_PHRASE = 'test walk nut penalty hip pave soap entry language right filter choice'
const COIN_NODE_ADDRESS = 'TNKypw2WjeChcDkRJ5zkBxZqxUCrhUG1Ao'
const UNSUPPORTED_DERIVATION_ERROR = new InvalidSignerError('The signer does not support account derivation.')

describe('WalletManagerTron', () => {
  let wallet

  beforeEach(() => {
    wallet = new WalletManagerTron(SEED_PHRASE, {
      provider: 'https://tron.web.provider/'
    })
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('constructor', () => {
    test('should wrap a seed in a seed signer at the coin-type node', () => {
      const signer = wallet.getSigner()

      expect(signer).toBeInstanceOf(SeedSignerTron)
      expect(signer.path).toBe("m/44'/195'")
      expect(wallet.seed).toBeUndefined()
    })

    test('should accept a derivable signer as the default signer', async () => {
      const signer = new SeedSignerTron(SEED_PHRASE)
      const wallet = new WalletManagerTron(signer)

      expect(wallet.getSigner()).toBe(signer)

      const account = await wallet.getAccount(1)

      expect(account.path).toBe("m/44'/195'/0'/0/1")
      expect(await account.getAddress()).toBe(ACCOUNT_1_ADDRESS)
    })

    test('should throw if the default signer is not derivable', () => {
      expect(() => new WalletManagerTron(new PrivateKeySignerTron(PRIVATE_KEY)))
        .toThrow(InvalidSignerError)
      expect(() => new WalletManagerTron(new PrivateKeySignerTron(PRIVATE_KEY)))
        .toThrow('The default signer must be derivable. Non-derivable signers (e.g. private-key signers) can only be registered by name via addSigner.')
    })

    test('should throw if the seed phrase is invalid', () => {
      expect(() => new WalletManagerTron('invalid seed phrase'))
        .toThrow('The seed phrase is invalid.')
    })
  })

  describe('dispose', () => {
    test('should not wipe a seed supplied by the caller', async () => {
      const seed = Uint8Array.from(bip39.mnemonicToSeedSync(SEED_PHRASE))
      const copy = Uint8Array.from(seed)
      const wallet = new WalletManagerTron(seed)

      const account = await wallet.getAccount(0)

      expect(account.path).toBe("m/44'/195'/0'/0/0")
      expect(await account.getAddress()).toBe(ACCOUNT_0_ADDRESS)

      wallet.dispose()

      expect(seed).toEqual(copy)
    })

    test('should dispose the accounts and the default signer built from a seed', async () => {
      const wallet = new WalletManagerTron(SEED_PHRASE)
      const account = await wallet.getAccount(0)
      const signer = wallet.getSigner()

      wallet.dispose()

      expect(wallet.disposed).toBe(true)
      expect(account.disposed).toBe(true)
      expect(account.keyPair.privateKey).toBeNull()
      expect(signer.disposed).toBe(true)
    })

    test('should not dispose signers supplied by the caller', async () => {
      const defaultSigner = new SeedSignerTron(SEED_PHRASE)
      const namedSigner = new PrivateKeySignerTron(PRIVATE_KEY)
      const wallet = new WalletManagerTron(defaultSigner).addSigner('hot', namedSigner)

      const derived = await wallet.getAccount(0)
      const named = await wallet.getAccount('hot')

      wallet.dispose()

      expect(derived.disposed).toBe(true)
      expect(named.disposed).toBe(true)
      expect(defaultSigner.disposed).toBe(false)
      expect(namedSigner.disposed).toBe(false)
    })
  })

  describe('signers', () => {
    test('should use a named derivable signer as is, without derivation', async () => {
      wallet.addSigner('second', new SeedSignerTron(SEED_PHRASE))

      const account = await wallet.getAccount('second')

      expect(account.path).toBe("m/44'/195'")
      expect(await account.getAddress()).toBe(COIN_NODE_ADDRESS)
    })

    test('should return the account of a named non-derivable signer', async () => {
      wallet.addSigner('hot', new PrivateKeySignerTron(PRIVATE_KEY))

      const account = await wallet.getAccount('hot')

      expect(account).toBeInstanceOf(WalletAccountTron)
      expect(account.path).toBeNull()
      expect(await account.getAddress()).toBe(ACCOUNT_0_ADDRESS)
      expect(await wallet.getAccount('hot')).toBe(account)
    })

    test('should derive accounts from a named derivable signer', async () => {
      wallet.addSigner('second', new SeedSignerTron(SECOND_SEED_PHRASE))

      const account = await wallet.getAccount(0, { signerName: 'second' })
      const defaultAccount = await wallet.getAccount(0)

      expect(account.path).toBe("m/44'/195'/0'/0/0")
      expect(await account.getAddress()).not.toBe(await defaultAccount.getAddress())
      expect(await wallet.getAccountByPath("0'/0/0", { signerName: 'second' })).toBe(account)
    })

    test('should throw if the named signer does not support account derivation', async () => {
      wallet.addSigner('hot', new PrivateKeySignerTron(PRIVATE_KEY))

      await expect(wallet.getAccount(0, { signerName: 'hot' }))
        .rejects.toThrow(UNSUPPORTED_DERIVATION_ERROR)

      await expect(wallet.getAccountByPath("0'/0/0", { signerName: 'hot' }))
        .rejects.toThrow(UNSUPPORTED_DERIVATION_ERROR)
    })

    test('should throw if no signer is registered with the given name', async () => {
      await expect(wallet.getAccount('missing'))
        .rejects.toThrow('No signer found with name "missing".')
    })
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()

      expect(account).toBeInstanceOf(WalletAccountTron)

      expect(account.path).toBe("m/44'/195'/0'/0/0")
      expect(await account.getAddress()).toBe(ACCOUNT_0_ADDRESS)
    })

    test('should return the same account on repeated calls', async () => {
      expect(await wallet.getAccount(0)).toBe(await wallet.getAccount(0))
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)

      expect(account).toBeInstanceOf(WalletAccountTron)

      expect(account.path).toBe("m/44'/195'/0'/0/3")
    })

    test('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1))
        .rejects.toBeInstanceOf(ValueError)
      await expect(wallet.getAccount(-1))
        .rejects.toThrow('The derivation path "0\'/0/-1" has an invalid child index: "-1".')
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
        .rejects.toBeInstanceOf(ValueError)
      await expect(wallet.getAccountByPath("a'/b/c"))
        .rejects.toThrow('The derivation path "a\'/b/c" has an invalid child index: "a\'".')
    })
  })

  describe('getFeeRates', () => {
    test('should return the correct fee rates', async () => {
      const DUMMY_CHAIN_PARAMETERS = [
        { key: 'getTransactionFee', value: 1_000 }
      ]

      getChainParametersMock.mockResolvedValue(DUMMY_CHAIN_PARAMETERS)

      const feeRates = await wallet.getFeeRates()

      expect(getChainParametersMock).toHaveBeenCalled()
      expect(feeRates.normal).toBe(1_100n)
      expect(feeRates.fast).toBe(2_000n)
    })

    test('should throw if the wallet is not connected to tron web', async () => {
      const disconnectedWallet = new WalletManagerTron(SEED_PHRASE)
      await expect(disconnectedWallet.getFeeRates())
        .rejects.toThrow('The wallet must be connected to tron web to get fee rates.')
    })
  })
})
