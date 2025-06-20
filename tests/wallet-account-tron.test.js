import WalletAccountTron from '../src/wallet-account-tron.js'
import * as bip39 from 'bip39'

const SEED_PHRASE =
  'between oval abandon quantum heavy stable guess limb ring hobby surround wall'
const VALID_SEED = bip39.mnemonicToSeedSync(SEED_PHRASE)
const VALID_PATH = "0'/0'"
const VALID_CONFIG = {
  // provider: "https://api.trongrid.io", // Mainnet
  // provider: 'https://api.shasta.trongrid.io' // Testnet
  provider: 'https://nile.trongrid.io' // Nile testnet
}
const VALID_ADDRESS = 'TWcBKmZpttULdr9qN4ktr6YZG7YUSZizjh' // Example Tron address
const USDT_CONTRACT_ADDRESSES = {
  'https://api.trongrid.io': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT on Mainnet
  'https://api.shasta.trongrid.io': 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs', // USDT on Shasta
  'https://nile.trongrid.io': 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' // USDT on Nile
}

const ACCOUNT = {
  index: 0,
  path: "m/44'/195'/0'/0/0",
  address: 'TG7eEfeG8Ddo3nX6U2eCYDGRVx5WSirtqW',
  keyPair: {
    privateKey: '91e67d82f1ba9b9812442f00954fecd15b0f666c300347d9845e48a8b1f397a5',
    publicKey: '043e658288913d6789feefcef1adf59fb242d6f795418b8ccedd73f6d4baa3479a0df7dff809a95c70962e9d21f4560269073fefcb32eb7de2d398f13af8e22851'
  }
}

const VALID_TOKEN = USDT_CONTRACT_ADDRESSES[VALID_CONFIG.provider]

describe('WalletAccountTron', () => {
  let account

  beforeEach(async () => {
    account = new WalletAccountTron(VALID_SEED, VALID_PATH, VALID_CONFIG)
  })

  describe('constructor', () => {
    test('should throw if tronweb provider is invalid', () => {
      // eslint-disable-next-line no-new
      expect(() => { new WalletAccountTron(SEED_PHRASE, "0'/0/0") })
        .toThrow('Invalid full node provided')
    })

    test('should successfully initialize an account for the given seed phrase and path', async () => {
      const account = new WalletAccountTron(SEED_PHRASE, "0'/0/0", VALID_CONFIG)

      expect(account.index).toBe(ACCOUNT.index)
      expect(account.path).toBe(ACCOUNT.path)
      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should successfully initialize an account for the given seed and path', async () => {
      const account = new WalletAccountTron(VALID_SEED, "0'/0/0", VALID_CONFIG)

      expect(account.index).toBe(ACCOUNT.index)

      expect(account.path).toBe(ACCOUNT.path)

      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should throw if the path is invalid', () => {
      // eslint-disable-next-line no-new
      expect(() => { new WalletAccountTron(SEED_PHRASE, "a'/b/c", VALID_CONFIG) })
        .toThrow('Invalid derivation path format')
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

    const EXPECTED_SIGNATURE = '0x8151a59a30129f38215734aa5c4a71182b571f00f07dcd9fb7d40ef3bef096c214ab54106a3c7318d5df644e741b52cffc917bf7677dbdb37696534e4ee857d41c'

    test('should return the correct signature', async () => {
      const signature = await account.sign(MESSAGE)

      expect(signature).toBe(EXPECTED_SIGNATURE)
    })
  })

  describe('verify', () => {
    const MESSAGE = 'Dummy message to sign.'

    const SIGNATURE = '0xd130f94c52bf393206267278ac0b6009e14f11712578e5c1f7afe4a12685c5b96a77a0832692d96fc51f4bd403839572c55042ecbcc92d215879c5c8bb5778c51c'

    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, SIGNATURE)

      expect(result).toBe(true)
    })

    // test('should return false for an invalid signature', async () => {
    //   const result = await account.verify('Another message.', SIGNATURE)

    //   expect(result).toBe(false)
    // }) needs fixing...
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      const account = new WalletAccountTron(SEED_PHRASE, "0'/0/1", VALID_CONFIG)

      const balance = await account.getBalance()

      expect(balance).toBe(2_046_000_002)
    })
  })

  describe('getTokenBalance', () => {
    test('should return the correct token balance of the account', async () => {
      const account = new WalletAccountTron(SEED_PHRASE, "0'/0/1", VALID_CONFIG)

      const balance = await account.getTokenBalance(VALID_TOKEN)

      expect(balance).toBe(1_000_024)
    })
  })

  describe('quoteSendTransaction', () => {
    test('should successfully quote a transaction', async () => {
      const TRANSACTION_WITH_DATA = {
        to: VALID_ADDRESS,
        value: 1_000
      }

      const EXPECTED_FEE = 264_000

      const { fee } = await account.quoteSendTransaction(TRANSACTION_WITH_DATA)

      expect(fee).toBe(EXPECTED_FEE)
    })
  })

  describe('quoteTransfer', () => {
    test('should successfully quote a transfer operation', async () => {
      const TRANSFER = {
        token: VALID_TOKEN,
        recipient: VALID_ADDRESS,
        amount: 100
      }

      const EXPECTED_FEE = 424_000

      const { fee } = await account.quoteTransfer(TRANSFER)

      expect(fee).toBe(EXPECTED_FEE)
    })
  })
})
