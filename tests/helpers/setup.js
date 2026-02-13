// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import TronWeb from 'tronweb'

import WalletManagerTron from '../../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

// ---------------------------------------------------------------------------
// Configuration — override via environment variables if needed
// ---------------------------------------------------------------------------

const TRON_FULL_NODE_URL = process.env.TRON_FULL_NODE_URL || 'http://127.0.0.1:8090'
const TRON_SOLIDITY_NODE_URL = process.env.TRON_SOLIDITY_NODE_URL || 'http://127.0.0.1:8091'

/**
 * Seed phrase used exclusively for integration tests.
 * The derived account at index 0 will be funded during setup.
 */
const TEST_SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

/**
 * How much TRX (in sun) to send to the test wallet during setup.
 * 1_000_000_000 sun = 1 000 TRX
 */
const FUND_TRX_AMOUNT = 1_000_000_000

/**
 * How many test tokens to transfer to the test wallet during setup.
 * With 6 decimals → 1 000 000 tokens.
 */
const FUND_TOKEN_AMOUNT = 1_000_000_000_000

/**
 * Initial supply minted when deploying TestToken.
 * With 6 decimals → 1 000 000 000 tokens.
 */
const TOKEN_INITIAL_SUPPLY = 1_000_000_000_000_000

// ---------------------------------------------------------------------------
// Singleton state — initialised once per test run
// ---------------------------------------------------------------------------

/** @type {SetupResult | null} */
let _setup = null

/**
 * @typedef {Object} SetupResult
 * @property {string} testSeedPhrase - The BIP-39 seed phrase for the test wallet.
 * @property {string} testAccountAddress - The Tron address of the test wallet (index 0).
 * @property {string} testTokenAddress - The deployed TRC20 test-token contract address.
 * @property {TronWeb} genesisTronWeb - A TronWeb instance connected with the genesis key.
 * @property {TronWeb} tronWebProvider - A TronWeb instance (no private key) for use as the wallet provider.
 */

/**
 * Returns (and lazily creates) the integration-test environment.
 *
 * On first call it will:
 *  1. Wait for the local Tron node to become reachable.
 *  2. Obtain a funded genesis account from the node.
 *  3. Deploy the TestToken contract.
 *  4. Fund the test-wallet address with TRX and test tokens.
 *
 * Subsequent calls return the cached result immediately.
 *
 * @returns {Promise<SetupResult>}
 */
export async function getSetup () {
  if (_setup) return _setup

  // 1. Obtain a genesis (pre-funded) private key
  const genesisPrivateKey = _getGenesisPrivateKey()

  const genesisTronWeb = new TronWeb({
    fullNode: TRON_FULL_NODE_URL,
    solidityNode: TRON_SOLIDITY_NODE_URL,
    eventServer: TRON_FULL_NODE_URL,
    privateKey: genesisPrivateKey
  })

  // 2. Wait until the node produces blocks
  await _waitForNode(genesisTronWeb)

  // A provider TronWeb instance without private key — used by wallet accounts.
  const tronWebProvider = new TronWeb({
    fullNode: TRON_FULL_NODE_URL,
    solidityNode: TRON_SOLIDITY_NODE_URL,
    eventServer: TRON_FULL_NODE_URL
  })

  // 3. Derive the test wallet address (local — no network needed)
  const walletManager = new WalletManagerTron(TEST_SEED_PHRASE, { provider: tronWebProvider })
  const testAccount = await walletManager.getAccount(0)
  const testAccountAddress = await testAccount.getAddress()

  // 4. Deploy the test TRC20 token from the genesis account
  const testTokenAddress = await _deployTestToken(genesisTronWeb)

  // 5. Fund the test wallet with TRX
  await _sendTrx(genesisTronWeb, testAccountAddress, FUND_TRX_AMOUNT)

  // 6. Transfer test tokens to the test wallet
  await _transferTokens(genesisTronWeb, testTokenAddress, testAccountAddress, FUND_TOKEN_AMOUNT)

  // Clean up the wallet manager used only for address derivation
  walletManager.dispose()

  _setup = {
    testSeedPhrase: TEST_SEED_PHRASE,
    testAccountAddress,
    testTokenAddress,
    genesisTronWeb,
    tronWebProvider
  }

  return _setup
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Default genesis / super-representative private key used by trontools/quickstart.
 * The corresponding address (TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY) holds the initial
 * TRX supply and can fund other accounts.
 */
const QUICKSTART_GENESIS_PRIVATE_KEY = 'da146374a75310b9666e834ee4ad0866d6f4035967bfc76217c5a495fff9f0d0'

/**
 * Returns a genesis private key that controls a funded account.
 *
 * Resolution order:
 *  1. `TRON_GENESIS_PRIVATE_KEY` env var (useful for custom nodes / CI).
 *  2. The well-known trontools/quickstart genesis key.
 *
 * @returns {string}
 */
function _getGenesisPrivateKey () {
  return process.env.TRON_GENESIS_PRIVATE_KEY || QUICKSTART_GENESIS_PRIVATE_KEY
}

/**
 * Blocks until the Tron node is producing blocks.
 *
 * @param {TronWeb} tronWeb
 * @param {number} [maxRetries=30]
 * @param {number} [interval=2000]
 */
async function _waitForNode (tronWeb, maxRetries = 30, interval = 2_000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const block = await tronWeb.trx.getCurrentBlock()
      if (block && block.block_header) return
    } catch {
      // not ready yet
    }

    await _sleep(interval)
  }

  throw new Error(`Tron node at ${TRON_NODE_URL} did not become ready in time.`)
}

/**
 * Deploys the TestToken contract and returns its base58 address.
 *
 * Reads the compiled Hardhat-tron artifact from `tests/artifacts/artifacts-tron/`.
 *
 * @param {TronWeb} tronWeb
 * @returns {Promise<string>}
 */
async function _deployTestToken (tronWeb) {
  const artifactPath = path.join(
    PROJECT_ROOT,
    'tests',
    'artifacts',
    'artifacts-tron',
    'contracts',
    'TestToken.sol',
    'TestToken.json'
  )

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Compiled artifact not found at ${artifactPath}. ` +
      'Run "npm run compile:tron" first.'
    )
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))

  const issuerHex = tronWeb.defaultAddress.hex

  const tx = await tronWeb.transactionBuilder.createSmartContract(
    {
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      feeLimit: 1_000_000_000,
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 10_000_000,
      parameters: [TOKEN_INITIAL_SUPPLY]
    },
    issuerHex
  )

  const signedTx = await tronWeb.trx.sign(tx)
  const result = await tronWeb.trx.sendRawTransaction(signedTx)

  if (!result.result) {
    throw new Error('TestToken deployment transaction was rejected: ' + JSON.stringify(result))
  }

  const receipt = await _waitForConfirmation(tronWeb, result.txid)
  const contractAddressHex = receipt.contract_address

  if (!contractAddressHex) {
    throw new Error('TestToken deployment did not return a contract address.')
  }

  return TronWeb.address.fromHex(contractAddressHex)
}

/**
 * Sends TRX from the genesis account to a destination address.
 *
 * @param {TronWeb} tronWeb
 * @param {string} toAddress
 * @param {number} amountSun
 */
async function _sendTrx (tronWeb, toAddress, amountSun) {
  const tx = await tronWeb.transactionBuilder.sendTrx(toAddress, amountSun, tronWeb.defaultAddress.base58)
  const signedTx = await tronWeb.trx.sign(tx)
  const result = await tronWeb.trx.sendRawTransaction(signedTx)

  if (!result.result) {
    throw new Error('TRX funding transaction was rejected: ' + JSON.stringify(result))
  }

  await _waitForConfirmation(tronWeb, result.txid)
}

/**
 * Transfers TRC20 tokens from the genesis account to a destination address.
 *
 * @param {TronWeb} tronWeb
 * @param {string} tokenAddress
 * @param {string} toAddress
 * @param {number} amount
 */
async function _transferTokens (tronWeb, tokenAddress, toAddress, amount) {
  const issuerHex = tronWeb.defaultAddress.hex

  const parameters = [
    { type: 'address', value: tronWeb.address.toHex(toAddress) },
    { type: 'uint256', value: amount }
  ]

  const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
    tokenAddress,
    'transfer(address,uint256)',
    { feeLimit: 100_000_000, callValue: 0 },
    parameters,
    issuerHex
  )

  const signedTx = await tronWeb.trx.sign(transaction)
  const result = await tronWeb.trx.sendRawTransaction(signedTx)

  if (!result.result) {
    throw new Error('Token transfer transaction was rejected: ' + JSON.stringify(result))
  }

  await _waitForConfirmation(tronWeb, result.txid)
}

/**
 * Polls until a transaction appears in a block.
 *
 * @param {TronWeb} tronWeb
 * @param {string} txId
 * @param {number} [maxRetries=30]
 * @param {number} [interval=3000]
 * @returns {Promise<object>}
 */
async function _waitForConfirmation (tronWeb, txId, maxRetries = 30, interval = 3_000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const info = await tronWeb.trx.getTransactionInfo(txId)
      if (info && Object.keys(info).length > 0) {
        return info
      }
    } catch {
      // not confirmed yet
    }

    await _sleep(interval)
  }

  throw new Error(`Transaction ${txId} was not confirmed within the timeout.`)
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function _sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
