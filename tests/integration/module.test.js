import { describe, test, expect, jest } from '@jest/globals'
import WalletManagerTron from '../../src/wallet-manager-tron.js'
import SeedSignerTron from '../../src/signers/seed-signer-tron.js'

const NILE_PROVIDER = 'https://nile.trongrid.io'
const SEED = process.env.TEST_TRON_SEED

const describeIf = SEED ? describe : describe.skip

describeIf('Integration: WalletManagerTron on Nile testnet', () => {
  let wallet, accountA, accountB

  // Increase timeout for network calls
  jest.setTimeout(60_000)

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
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      receipt = await accountA.getTransactionReceipt(result.hash)
      if (receipt) break
    }

    console.log('Receipt:', JSON.stringify(receipt, null, 2))
    expect(receipt).not.toBeNull()
  })
})
