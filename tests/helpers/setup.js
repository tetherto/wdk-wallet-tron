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

import { TronWeb } from 'tronweb'

import WalletManagerTron from '../../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

const TRON_FULL_NODE_URL = 'http://127.0.0.1:8090'
const TRON_SOLIDITY_NODE_URL = 'http://127.0.0.1:8091'

const TEST_SEED_PHRASE = 'test only example nut use this real life secret phrase must random'

const FUND_TRX_AMOUNT = 1_000_000_000
const FUND_TOKEN_AMOUNT = 1_000_000_000_000
const TOKEN_INITIAL_SUPPLY = 1_000_000_000_000_000

let _setup = null

export async function getSetup () {
  if (_setup) return _setup

  const genesisPrivateKey = _getGenesisPrivateKey()

  const genesisTronWeb = new TronWeb({
    fullNode: TRON_FULL_NODE_URL,
    solidityNode: TRON_SOLIDITY_NODE_URL,
    eventServer: TRON_FULL_NODE_URL,
    privateKey: genesisPrivateKey
  })

  await _waitForNode(genesisTronWeb)

  const tronWebProvider = new TronWeb({
    fullNode: TRON_FULL_NODE_URL,
    solidityNode: TRON_SOLIDITY_NODE_URL,
    eventServer: TRON_FULL_NODE_URL
  })

  const walletManager = new WalletManagerTron(TEST_SEED_PHRASE, { provider: tronWebProvider })
  const testAccount0 = await walletManager.getAccount(0)
  const testAccount1 = await walletManager.getAccount(1)
  const testAccountAddress = await testAccount0.getAddress()
  const testAccount1Address = await testAccount1.getAddress()

  const testTokenAddress = await _deployTestToken(genesisTronWeb)

  await _sendTrx(genesisTronWeb, testAccountAddress, FUND_TRX_AMOUNT)
  await _sendTrx(genesisTronWeb, testAccount1Address, FUND_TRX_AMOUNT)
  await _transferTokens(genesisTronWeb, testTokenAddress, testAccountAddress, FUND_TOKEN_AMOUNT)

  walletManager.dispose()

  _setup = {
    testSeedPhrase: TEST_SEED_PHRASE,
    testAccountAddress,
    testAccount1Address,
    testTokenAddress,
    genesisTronWeb,
    tronWebProvider
  }

  return _setup
}

const QUICKSTART_GENESIS_PRIVATE_KEY = 'da146374a75310b9666e834ee4ad0866d6f4035967bfc76217c5a495fff9f0d0'

function _getGenesisPrivateKey () {
  return QUICKSTART_GENESIS_PRIVATE_KEY
}

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

  throw new Error(`Tron node at ${TRON_FULL_NODE_URL} did not become ready in time.`)
}

async function _deployTestToken (tronWeb) {
  const artifactPath = path.join(PROJECT_ROOT, 'tests', 'artifacts', 'TestToken.json')

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Compiled artifact not found at ${artifactPath}.`)
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

async function _sendTrx (tronWeb, toAddress, amountSun) {
  const tx = await tronWeb.transactionBuilder.sendTrx(toAddress, amountSun, tronWeb.defaultAddress.base58)
  const signedTx = await tronWeb.trx.sign(tx)
  const result = await tronWeb.trx.sendRawTransaction(signedTx)

  if (!result.result) {
    throw new Error('TRX funding transaction was rejected: ' + JSON.stringify(result))
  }

  await _waitForConfirmation(tronWeb, result.txid)
}

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

function _sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
