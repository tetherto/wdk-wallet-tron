import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import { DisposalError, ProviderRequiredError } from '@tetherto/wdk-wallet'

import * as bip39 from 'bip39'

import { TronWeb, Trx, utils } from 'tronweb'

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
    Trx,
    utils
  }
})

const { default: WalletManagerTron, WalletAccountTron, InvalidSignerError, ValueError } = await import('../index.js')
const { SeedSignerTron, PrivateKeySignerTron } = await import('../src/signers/index.js')

const PRIVATE_KEY = '5d5645db7db2a3b86435e3ec9b3b2cc670fccef5b6d5705e310b8ac2d8d37633'
const ACCOUNT_0_ADDRESS = 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb'
const ACCOUNT_1_ADDRESS = 'TLeUMvxvtUmbCyHAzf3FKV7C2FxquGDWUj'
const SECOND_SEED_PHRASE = 'test walk nut penalty hip pave soap entry language right filter choice'
const COIN_NODE_ADDRESS = 'TNKypw2WjeChcDkRJ5zkBxZqxUCrhUG1Ao'
const UNSUPPORTED_DERIVATION_ERROR = expect.objectContaining({ constructor: InvalidSignerError, message: 'The signer does not support account derivation.' })

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
    test('should wrap a seed in a seed signer at the coin-type node', async () => {
      const signer = wallet.getSigner()

      expect(signer.path).toBe("m/44'/195'")
      expect(await signer.getAddress()).toBe(COIN_NODE_ADDRESS)
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
        .toThrow(expect.objectContaining({ constructor: InvalidSignerError, message: 'The default signer must be derivable. Non-derivable signers (e.g. private-key signers) can only be registered by name via addSigner.' }))
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
      await wallet.getAccount(0)

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

    test('should dispose the default signer built from a seed only once when disposed twice', () => {
      const wallet = new WalletManagerTron(SEED_PHRASE)
      const disposeSpy = jest.spyOn(wallet.getSigner(), 'dispose')
      wallet.dispose()

      wallet.dispose()

      expect(disposeSpy).toHaveBeenCalledTimes(1)
    })

    test('should throw on getAccount by name after the manager is disposed', async () => {
      const wallet = new WalletManagerTron(new SeedSignerTron(SEED_PHRASE)).addSigner('hot', new PrivateKeySignerTron(PRIVATE_KEY))
      wallet.dispose()

      await expect(wallet.getAccount('hot'))
        .rejects.toStrictEqual(new DisposalError('The wallet manager has been disposed.'))
    })

    test('should throw on getAccount by index after a manager with a caller-owned signer is disposed', async () => {
      const wallet = new WalletManagerTron(new SeedSignerTron(SEED_PHRASE))
      wallet.dispose()

      await expect(wallet.getAccount(0))
        .rejects.toStrictEqual(new DisposalError('The wallet manager has been disposed.'))
    })

    test('should throw on getAccountByPath after the manager is disposed', async () => {
      const wallet = new WalletManagerTron(new SeedSignerTron(SEED_PHRASE))
      wallet.dispose()

      await expect(wallet.getAccountByPath("0'/0/0"))
        .rejects.toStrictEqual(new DisposalError('The wallet manager has been disposed.'))
    })

    test('should throw on getAccount by name if the named signer is disposed', async () => {
      const signer = new PrivateKeySignerTron(PRIVATE_KEY)
      const wallet = new WalletManagerTron(SEED_PHRASE).addSigner('hot', signer)
      signer.dispose()

      await expect(wallet.getAccount('hot'))
        .rejects.toStrictEqual(new DisposalError('The given signer has been disposed.'))
    })

    test('should dispose the default signer built from a raw seed', () => {
      const wallet = new WalletManagerTron(Uint8Array.from(bip39.mnemonicToSeedSync(SEED_PHRASE)))
      const signer = wallet.getSigner()

      wallet.dispose()

      expect(signer.disposed).toBe(true)
    })

    test('should throw on getAccount for a previously returned index after dispose', async () => {
      const wallet = new WalletManagerTron(SEED_PHRASE)
      await wallet.getAccount(0)
      wallet.dispose()

      await expect(wallet.getAccount(0))
        .rejects.toStrictEqual(new DisposalError('The wallet manager has been disposed.'))
    })

    test('should throw on getAccount for a new index after dispose', async () => {
      const wallet = new WalletManagerTron(SEED_PHRASE)
      wallet.dispose()

      await expect(wallet.getAccount(1))
        .rejects.toStrictEqual(new DisposalError('The wallet manager has been disposed.'))
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

      expect(account.path).toBeNull()
      expect(await account.getAddress()).toBe(ACCOUNT_0_ADDRESS)
    })

    test('should return the same account on repeated calls for a named signer', async () => {
      wallet.addSigner('hot', new PrivateKeySignerTron(PRIVATE_KEY))
      const account = await wallet.getAccount('hot')

      expect(await wallet.getAccount('hot')).toBe(account)
    })

    test('should derive accounts from a named derivable signer', async () => {
      wallet.addSigner('second', new SeedSignerTron(SECOND_SEED_PHRASE))

      const account = await wallet.getAccount(0, { signerName: 'second' })

      expect(account.path).toBe("m/44'/195'/0'/0/0")
      expect(await account.getAddress()).toBe('TELqMyNVc8Y7kAMpnmjxcQxk4Mb4BvvFjv')
    })

    test('should return the same account by index and by path for a named derivable signer', async () => {
      wallet.addSigner('second', new SeedSignerTron(SECOND_SEED_PHRASE))
      const account = await wallet.getAccount(0, { signerName: 'second' })

      expect(await wallet.getAccountByPath("0'/0/0", { signerName: 'second' })).toBe(account)
    })

    test('should throw on getAccount if the named signer does not support account derivation', async () => {
      wallet.addSigner('hot', new PrivateKeySignerTron(PRIVATE_KEY))

      await expect(wallet.getAccount(0, { signerName: 'hot' }))
        .rejects.toThrow(UNSUPPORTED_DERIVATION_ERROR)
    })

    test('should throw on getAccountByPath if the named signer does not support account derivation', async () => {
      wallet.addSigner('hot', new PrivateKeySignerTron(PRIVATE_KEY))

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

      expect(account.path).toBe("m/44'/195'/0'/0/0")
      expect(await account.getAddress()).toBe(ACCOUNT_0_ADDRESS)
    })

    test('should derive the account at index 0 from a raw seed', async () => {
      const wallet = new WalletManagerTron(Uint8Array.from(bip39.mnemonicToSeedSync(SEED_PHRASE)))

      const account = await wallet.getAccount(0)

      expect(account.path).toBe("m/44'/195'/0'/0/0")
      expect(await account.getAddress()).toBe(ACCOUNT_0_ADDRESS)
    })

    test('should return the same account on repeated calls', async () => {
      expect(await wallet.getAccount(0)).toBe(await wallet.getAccount(0))
    })

    test('should return the same account on concurrent calls', async () => {
      const [first, second] = await Promise.all([wallet.getAccount(0), wallet.getAccount(0)])

      expect(first).toBe(second)
    })

    test('should wipe the keys of concurrently requested accounts on dispose', async () => {
      const wallet = new WalletManagerTron(SEED_PHRASE)
      const [first, second] = await Promise.all([wallet.getAccount(0), wallet.getAccount(0)])

      wallet.dispose()

      expect(first.keyPair.privateKey).toBeNull()
      expect(second.keyPair.privateKey).toBeNull()
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)

      expect(account.path).toBe("m/44'/195'/0'/0/3")
    })

    test.each([-1, 1.5, 2 ** 31])('should throw if the index is %d', async (index) => {
      await expect(wallet.getAccount(index))
        .rejects.toThrow(expect.objectContaining({ constructor: ValueError, message: 'The index must be an integer between 0 and 2^31 - 1.' }))
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")

      expect(account.path).toBe("m/44'/195'/1'/2/3")
    })

    test('should throw if the path is invalid', async () => {
      await expect(wallet.getAccountByPath("a'/b/c"))
        .rejects.toThrow(expect.objectContaining({ constructor: ValueError, message: 'The derivation path is not a valid BIP-32 path.' }))
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
        .rejects.toStrictEqual(new ProviderRequiredError('The wallet must be connected to tron web to get fee rates.'))
    })
  })
})
