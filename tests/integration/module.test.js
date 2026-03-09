import { beforeAll, afterAll, describe, expect, test } from '@jest/globals'

import { getSetup } from '../helpers/setup.js'
import WalletManagerTron from '../../index.js'

const TIMEOUT = 120_000
const RECIPIENT_ADDRESS = 'TCmGCGFR8ApgtEoq2kpHUgWDCFPrktxPD2'

async function waitForTx (account, txHash) {
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
  }, TIMEOUT)

  afterAll(() => {
    walletManager.dispose()
  })

  test('should derive an account, quote the cost of a tx and send the tx', async () => {
    const account0 = await walletManager.getAccount(0)

    const address0 = await account0.getAddress()
    expect(address0).toBe(setup.testAccountAddress)

    const TRANSACTION = {
      to: RECIPIENT_ADDRESS,
      value: 1_000_000
    }

    await account0.quoteSendTransaction(TRANSACTION)

    const { hash } = await account0.sendTransaction(TRANSACTION)

    await waitForTx(account0, hash)

    const onChainTx = await setup.tronWebProvider.trx.getTransaction(hash)
    const contract = onChainTx.raw_data.contract[0]

    expect(onChainTx.txID).toBe(hash)
    expect(contract.type).toBe('TransferContract')
    expect(contract.parameter.value.amount).toBe(TRANSACTION.value)
    expect(setup.tronWebProvider.address.fromHex(contract.parameter.value.to_address)).toBe(RECIPIENT_ADDRESS)
  }, TIMEOUT)

  test('should derive two accounts, send a tx from account 0 to 1 and get the correct balances', async () => {
    const account0 = await walletManager.getAccount(0)
    const account1 = await walletManager.getAccount(1)
    const account1Address = await account1.getAddress()

    const balance1Before = await account1.getBalance()

    const amountSun = 1_000_000n

    const { hash } = await account0.sendTransaction({
      to: account1Address,
      value: amountSun
    })

    await waitForTx(account0, hash)

    const balance1After = await account1.getBalance()

    expect(balance1After).toBe(balance1Before + amountSun)
  }, TIMEOUT)

  test('should derive an account by its path, quote the cost of transferring a token and transfer a token', async () => {
    const account0 = await walletManager.getAccountByPath("0'/0/0")

    const TRANSFER = {
      token: setup.testTokenAddress,
      recipient: RECIPIENT_ADDRESS,
      amount: 1_000_000
    }

    const { fee: estimatedFee } = await account0.quoteTransfer(TRANSFER)

    const { hash, fee } = await account0.transfer(TRANSFER)

    await waitForTx(account0, hash)

    const onChainTx = await setup.tronWebProvider.trx.getTransaction(hash)
    const contract = onChainTx.raw_data.contract[0]

    const data = contract.parameter.value.data
    const recipientFromChain = setup.tronWebProvider.address.fromHex('41' + data.slice(32, 72))
    const amountFromChain = BigInt('0x' + data.slice(72, 136))

    expect(onChainTx.txID).toBe(hash)
    expect(contract.type).toBe('TriggerSmartContract')
    expect(setup.tronWebProvider.address.fromHex(contract.parameter.value.contract_address)).toBe(setup.testTokenAddress)
    expect(recipientFromChain).toBe(RECIPIENT_ADDRESS)
    expect(amountFromChain).toBe(BigInt(TRANSFER.amount))

    expect(fee).toBe(estimatedFee)
  }, TIMEOUT)

  test('should derive two accounts by their paths, transfer a token from account 0 to 1 and get the correct balances and token balances', async () => {
    const account0 = await walletManager.getAccountByPath("0'/0/0")

    const tokenContract = await setup.genesisTronWeb.contract().at(setup.testTokenAddress)

    const balance0Before = await account0.getTokenBalance(setup.testTokenAddress)
    const recipientBalanceBefore = BigInt(await tokenContract.balanceOf(RECIPIENT_ADDRESS).call())

    const transferAmount = 1_000_000n

    const { hash } = await account0.transfer({
      token: setup.testTokenAddress,
      recipient: RECIPIENT_ADDRESS,
      amount: transferAmount
    })

    await waitForTx(account0, hash)

    const balance0After = await account0.getTokenBalance(setup.testTokenAddress)
    const recipientBalanceAfter = BigInt(await tokenContract.balanceOf(RECIPIENT_ADDRESS).call())

    expect(balance0After).toBe(balance0Before - transferAmount)
    expect(recipientBalanceAfter).toBe(recipientBalanceBefore + transferAmount)
  }, TIMEOUT)

  test('should derive an account, sign a message and verify its signature', async () => {
    const account0 = await walletManager.getAccountByPath("0'/0/0")

    const MESSAGE = 'Hello, Tron integration tests!'

    const signature = await account0.sign(MESSAGE)

    const isValid = await account0.verify(MESSAGE, signature)
    expect(isValid).toBe(true)
  }, TIMEOUT)

  test('should dispose the wallet and erase the private keys of the accounts', async () => {
    const disposableManager = new WalletManagerTron(setup.testSeedPhrase, {
      provider: setup.tronWebProvider
    })

    const acc0 = await disposableManager.getAccount(0)
    const acc1 = await disposableManager.getAccount(1)

    disposableManager.dispose()

    for (const acc of [acc0, acc1]) {
      expect(acc.keyPair.privateKey).toBe(null)

      await expect(acc.sign('Hello, world!')).rejects.toThrow('private key must be hex string or Uint8Array')
      await expect(acc.sendTransaction({ to: RECIPIENT_ADDRESS, value: 1_000_000 })).rejects.toThrow('private key must be hex string or Uint8Array')
    }

    await expect(acc0.transfer({ token: setup.testTokenAddress, recipient: RECIPIENT_ADDRESS, amount: 1_000_000 })).rejects.toThrow('private key must be hex string or Uint8Array')
  }, TIMEOUT)

  test('should create a wallet with a low transfer max fee, derive an account, try to transfer some tokens and gracefully fail', async () => {
    const limitedManager = new WalletManagerTron(setup.testSeedPhrase, {
      provider: setup.tronWebProvider,
      transferMaxFee: 100
    })

    const account = await limitedManager.getAccount(0)

    const TRANSFER = {
      token: setup.testTokenAddress,
      recipient: RECIPIENT_ADDRESS,
      amount: 1_000_000
    }

    await expect(account.transfer(TRANSFER))
      .rejects.toThrow('Exceeded maximum fee cost for transfer operations.')

    limitedManager.dispose()
  }, TIMEOUT)
})
