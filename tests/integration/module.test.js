import { describe, test, expect, jest } from '@jest/globals'
import WalletManagerTron from '../../src/wallet-manager-tron.js'
import SeedSignerTron from '../../src/signers/seed-signer-tron.js'

const NILE_PROVIDER = 'https://nile.trongrid.io'
const TEST_TOKEN = process.env.TEST_TRON_TOKEN
const SEED = process.env.TEST_TRON_SEED

const describeIf = SEED ? describe : describe.skip

describeIf('Integration: WalletManagerTron on Nile testnet', () => {
  let wallet, accountA, accountB

  // Increase timeout for network calls (TRON Nile testnet can be slow)
  jest.setTimeout(120_000)

  test('full flow: create manager → get accounts → send TRX', async () => {
    const root = new SeedSignerTron(SEED)
    wallet = new WalletManagerTron(root, { provider: NILE_PROVIDER })

    accountA = await wallet.getAccount(0)
    accountB = await wallet.getAccount(1)

    const addressA = await accountA.getAddress()
    const addressB = await accountB.getAddress()

    console.log('Account A:', addressA)
    console.log('Account B:', addressB)

    // Verify addresses start with T (TRON mainnet/nile format)
    expect(addressA).toMatch(/^T/)
    expect(addressB).toMatch(/^T/)
    expect(addressA).not.toBe(addressB)

    // Check balance of account A
    const balance = await accountA.getBalance()
    console.log('Balance A:', balance.toString(), 'suns')
    expect(balance).toBeGreaterThan(0n)

    // Send 1 TRX (1_000_000 suns) from A to B
    const AMOUNT = 1_000_000n
    const result = await accountA.sendTransaction({
      to: addressB,
      value: AMOUNT
    })

    console.log('Transaction hash:', result.hash)
    expect(typeof result.hash).toBe('string')
    expect(result.hash).toHaveLength(64)
    expect(result.fee).toBeGreaterThanOrEqual(0n)

    // Poll for receipt (up to 30s)
    let receipt = null
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      receipt = await accountA.getTransactionReceipt(result.hash)
      if (receipt) break
    }

    console.log('Receipt:', JSON.stringify(receipt, null, 2))
    expect(receipt).not.toBeNull()
  })

  test.only('full flow: transfer TRC-20 token from A to B', async () => {
    const root = new SeedSignerTron(SEED)
    wallet = new WalletManagerTron(root, { provider: NILE_PROVIDER })

    accountA = await wallet.getAccount(0)
    accountB = await wallet.getAccount(1)

    const addressA = await accountA.getAddress()
    const addressB = await accountB.getAddress()

    console.log('Token:', TEST_TOKEN)
    console.log('Account A:', addressA)
    console.log('Account B:', addressB)

    // Check token balance before transfer
    const balanceBefore = await accountA.getTokenBalance(TEST_TOKEN)
    console.log('Token balance A before:', balanceBefore.toString())
    expect(balanceBefore).toBeGreaterThan(0n)

    // Quote the transfer first
    const AMOUNT = 1n // smallest unit
    const { fee } = await accountA.quoteTransfer({ token: TEST_TOKEN, recipient: addressB, amount: AMOUNT })
    console.log('Quoted transfer fee:', fee.toString(), 'suns')
    expect(fee).toBeGreaterThanOrEqual(0n)

    // Execute the TRC-20 transfer
    const result = await accountA.transfer({ token: TEST_TOKEN, recipient: addressB, amount: AMOUNT })

    console.log('Transfer hash:', result.hash)
    expect(typeof result.hash).toBe('string')
    expect(result.hash).toHaveLength(64)
    expect(result.fee).toBeGreaterThanOrEqual(0n)

    // Poll for receipt (up to 30s)
    let receipt = null
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      receipt = await accountA.getTransactionReceipt(result.hash)
      if (receipt) break
    }

    console.log('Transfer receipt:', JSON.stringify(receipt, null, 2))
    expect(receipt).not.toBeNull()
  })
})
