import { beforeAll, afterAll, describe, expect, test } from '@jest/globals'

import { getSetup } from '../helpers/setup.js'
import WalletManagerTron from '../../index.js'
import { WalletAccountReadOnlyTron } from '../../index.js'

const TIMEOUT = 120_000

async function waitForTx (txHash, account) {
  let receipt = null
  let counter = 0

  while (!receipt) {
    try {
      receipt = await account.getTransactionReceipt(txHash)
    } catch {}

    if (!receipt) {
      await new Promise(resolve => setTimeout(resolve, 3_000))
      counter++
      if (counter > 40) {
        throw new Error(`Transaction not confirmed after 120 seconds: ${txHash}`)
      }
    }
  }
  return receipt
}

describe('@tetherto/wdk-wallet-tron', () => {
  let setup
  let walletManager

  beforeAll(async () => {
    setup = await getSetup()

    walletManager = new WalletManagerTron(setup.testSeedPhrase, {
      provider: setup.tronWebProvider
    })

    const account0 = await walletManager.getAccount(0)
    const account1 = await walletManager.getAccount(1)
    const account1Address = await account1.getAddress()

    const { hash } = await account0.sendTransaction({
      to: account1Address,
      value: 100_000_000
    })
    await waitForTx(hash, account0)
  }, TIMEOUT)

  afterAll(() => {
    walletManager?.dispose()
  })

  test('should derive an account, quote the cost of a tx and send the tx', async () => {
    const account0 = await walletManager.getAccount(0)
    const account1 = await walletManager.getAccount(1)

    expect(account0.index).toBe(0)
    expect(account0.path).toBe("m/44'/195'/0'/0/0")
    expect(account0.keyPair.privateKey).toBeInstanceOf(Uint8Array)
    expect(account0.keyPair.publicKey).toBeInstanceOf(Uint8Array)

    const address0 = await account0.getAddress()
    expect(address0).toBe(setup.testAccountAddress)

    const account1Address = await account1.getAddress()

    const TRANSACTION = {
      to: account1Address,
      value: 1_000_000
    }

    const { fee: estimatedFee } = await account0.quoteSendTransaction(TRANSACTION)

    const { hash, fee } = await account0.sendTransaction(TRANSACTION)

    await waitForTx(hash, account0)

    const onChainTx = await setup.tronWebProvider.trx.getTransaction(hash)
    const contract = onChainTx.raw_data.contract[0]

    expect(onChainTx.txID).toBe(hash)
    expect(contract.type).toBe('TransferContract')
    expect(contract.parameter.value.amount).toBe(TRANSACTION.value)
    expect(setup.tronWebProvider.address.fromHex(contract.parameter.value.to_address)).toBe(account1Address)

    expect(fee).toBe(estimatedFee)
  }, TIMEOUT)

  test('should derive two accounts, send a tx from account 0 to 1 and get the correct balances', async () => {
    const account0 = await walletManager.getAccount(0)
    const account1 = await walletManager.getAccount(1)
    const account1Address = await account1.getAddress()

    const balance0Before = await account0.getBalance()
    const balance1Before = await account1.getBalance()

    const amountSun = 1_000_000n

    const { hash } = await account0.sendTransaction({
      to: account1Address,
      value: Number(amountSun)
    })

    await waitForTx(hash, account0)

    const balance0After = await account0.getBalance()
    const balance1After = await account1.getBalance()

    expect(balance0After).toBeLessThan(balance0Before)
    expect(balance1After).toBe(balance1Before + amountSun)
  }, TIMEOUT)

  test('should derive an account by its path, quote the cost of transferring a token and transfer a token', async () => {
    const account0 = await walletManager.getAccountByPath("0'/0/0")
    const account1 = await walletManager.getAccountByPath("0'/0/1")
    const account1Address = await account1.getAddress()

    const TRANSFER = {
      token: setup.testTokenAddress,
      recipient: account1Address,
      amount: 1_000_000
    }

    const { fee: estimatedFee } = await account0.quoteTransfer(TRANSFER)

    const { hash, fee } = await account0.transfer(TRANSFER)

    await waitForTx(hash, account0)

    const onChainTx = await setup.tronWebProvider.trx.getTransaction(hash)
    const contract = onChainTx.raw_data.contract[0]

    expect(onChainTx.txID).toBe(hash)
    expect(contract.type).toBe('TriggerSmartContract')
    expect(setup.tronWebProvider.address.fromHex(contract.parameter.value.contract_address)).toBe(setup.testTokenAddress)

    expect(fee).toBe(estimatedFee)
  }, TIMEOUT)

  test('should derive two accounts by their paths, transfer a token from account 0 to 1 and get the correct balances and token balances', async () => {
    const account0 = await walletManager.getAccountByPath("0'/0/0")
    const account1 = await walletManager.getAccountByPath("0'/0/1")
    const account1Address = await account1.getAddress()

    const balance0Before = await account0.getTokenBalance(setup.testTokenAddress)
    const balance1Before = await account1.getTokenBalance(setup.testTokenAddress)

    const transferAmount = 1_000_000n

    const { hash } = await account0.transfer({
      token: setup.testTokenAddress,
      recipient: account1Address,
      amount: Number(transferAmount)
    })

    await waitForTx(hash, account0)

    const balance0After = await account0.getTokenBalance(setup.testTokenAddress)
    const balance1After = await account1.getTokenBalance(setup.testTokenAddress)

    expect(balance0After).toBe(balance0Before - transferAmount)
    expect(balance1After).toBe(balance1Before + transferAmount)
  }, TIMEOUT)

  test('should derive an account, sign a message and verify its signature', async () => {
    const account0 = await walletManager.getAccountByPath("0'/0/0")

    const MESSAGE = 'Hello, Tron integration tests!'

    const signature = await account0.sign(MESSAGE)

    const isValid = await account0.verify(MESSAGE, signature)
    expect(isValid).toBe(true)
  }, TIMEOUT)

  test('should convert a full account to read-only and perform balance, quote and receipt operations', async () => {
    const account0 = await walletManager.getAccount(0)
    const account1 = await walletManager.getAccount(1)
    const account0Address = await account0.getAddress()
    const account1Address = await account1.getAddress()

    const readOnly = await account0.toReadOnlyAccount()

    expect(readOnly).toBeInstanceOf(WalletAccountReadOnlyTron)
    expect(await readOnly.getAddress()).toBe(account0Address)

    const MESSAGE = 'Read-only verification test'
    const signature = await account0.sign(MESSAGE)
    expect(await readOnly.verify(MESSAGE, signature)).toBe(true)

    expect(await readOnly.getBalance()).toBe(await account0.getBalance())
    expect(await readOnly.getTokenBalance(setup.testTokenAddress))
      .toBe(await account0.getTokenBalance(setup.testTokenAddress))

    const txParams = { to: account1Address, value: 1_000_000 }
    const readOnlyQuote = await readOnly.quoteSendTransaction(txParams)
    const fullQuote = await account0.quoteSendTransaction(txParams)
    expect(readOnlyQuote.fee).toBe(fullQuote.fee)

    const transferParams = { token: setup.testTokenAddress, recipient: account1Address, amount: 1_000_000 }
    const readOnlyTransferQuote = await readOnly.quoteTransfer(transferParams)
    expect(readOnlyTransferQuote.fee).toBeGreaterThan(0n)

    const { hash } = await account0.sendTransaction(txParams)
    const receipt = await waitForTx(hash, readOnly)
    expect(receipt).toHaveProperty('id')
  }, TIMEOUT)

  test('should dispose the wallet and erase the private keys of the accounts', async () => {
    const disposableManager = new WalletManagerTron(setup.testSeedPhrase, {
      provider: setup.tronWebProvider
    })

    const acc0 = await disposableManager.getAccount(0)
    const acc1 = await disposableManager.getAccount(1)

    disposableManager.dispose()

    for (const acc of [acc0, acc1]) {
      expect(acc.keyPair.privateKey).toBeFalsy()

      await expect(acc.sign('Hello, world!')).rejects.toThrow()
    }
  }, TIMEOUT)

  test('should create a wallet with a low transfer max fee, derive an account, try to transfer some tokens and gracefully fail', async () => {
    const limitedManager = new WalletManagerTron(setup.testSeedPhrase, {
      provider: setup.tronWebProvider,
      transferMaxFee: 100
    })

    const account = await limitedManager.getAccount(0)

    const TRANSFER = {
      token: setup.testTokenAddress,
      recipient: await (await walletManager.getAccount(1)).getAddress(),
      amount: 1_000_000
    }

    await expect(account.transfer(TRANSFER))
      .rejects.toThrow('Exceeded maximum fee cost for transfer operations.')

    limitedManager.dispose()
  }, TIMEOUT)
})
