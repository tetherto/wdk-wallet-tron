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

import TronWeb from 'tronweb'
import { getBytesCopy } from 'ethers'
import sodium from 'sodium-universal'
import { keccak_256 as keccak256 } from '@noble/hashes/sha3'
import { CustomSigningKey } from './signer/custom-signing-key.js'
import { derivePrivateKeyBuffer } from './signer/utils.js'

import * as bip39 from 'bip39'

/** @typedef {import('tronweb').Types.TransactionInfo} TronTransactionReceipt */

/** @typedef {import('@wdk/wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@wdk/wallet').KeyPair} KeyPair */
/** @typedef {import('@wdk/wallet').TransactionResult} TransactionResult */
/** @typedef {import('@wdk/wallet').TransferOptions} TransferOptions */
/** @typedef {import('@wdk/wallet').TransferResult} TransferResult */

/**
 * @typedef {Object} TronTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number} value - The amount of sun to send to the recipient (1 TRX = 1,000,000 sun).
 */

/**
 * @typedef {Object} TronWalletConfig
 * @property {string} [provider] - The rpc url of the provider.
 */

const BIP_44_TRON_DERIVATION_PATH_PREFIX = "m/44'/195'"
const BANDWIDTH_PRICE = 1000

/** @implements {IWalletAccount} */
export default class WalletAccountTron {
  /**
   * Creates a new tron wallet account.
   *
   * @param {string | Uint8Array} seed - The bip-39 mnemonic.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config = {}) {
    /**
     * The tron wallet configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    this._config = config

    /**
     * The tron web client.
     *
     * @protected
     * @type {TronWeb}
     */
    this._tronWeb = new TronWeb({
      fullHost: this._config.provider
    })

    /** @private */
    this._path = `${BIP_44_TRON_DERIVATION_PATH_PREFIX}/${path}`
    /** @private */
    this._privateKeyBuffer = new Uint8Array(32)
    /** @private */
    this._hmacOutputBuffer = new Uint8Array(64)
    /** @private */
    this._derivationDataBuffer = new Uint8Array(37)

    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    derivePrivateKeyBuffer(
      seed,
      this._privateKeyBuffer,
      this._hmacOutputBuffer,
      this._derivationDataBuffer,
      this._path
    )

    /** @private */
    this._signingKey = new CustomSigningKey(this._privateKeyBuffer)
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index () {
    return parseInt(this._path.split('/').pop())
  }

  /**
   * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._privateKeyBuffer,
      publicKey: getBytesCopy(this._signingKey.publicKey)
    }
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    const pubKey = this._signingKey.publicKey
    const pubKeyNoPrefix = pubKey.slice(1)
    const hash = keccak256(pubKeyNoPrefix)
    const tronAddress = hash.slice(12)
    const tronAddressHex = '41' + Buffer.from(tronAddress).toString('hex')
    return this._tronWeb.address.fromHex(tronAddressHex)
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    const messageBytes =
      typeof message === 'string' ? new TextEncoder().encode(message) : message

    const prefix = new TextEncoder().encode(
      '\x19TRON Signed Message:\n' + messageBytes.length
    )
    const prefixedMessage = new Uint8Array(prefix.length + messageBytes.length)
    prefixedMessage.set(prefix)
    prefixedMessage.set(messageBytes, prefix.length)

    const messageHash = keccak256(prefixedMessage)

    const signature = this._signingKey.sign(messageHash)

    return signature
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    try {
      await this._tronWeb.trx.verifyMessageV2(message, signature)
      return true
    } catch (_) {
      return false
    }
  }

  /**
   * Returns the account's native token balance.
   *
   * @returns {Promise<number>} The native token balance.
   */
  async getBalance () {
    const balance = await this._tronWeb.trx.getBalance(await this.getAddress())
    return Number(balance)
  }

  /**
   * Returns the account balance for a specific token.
   * Uses low-level contract interaction to ensure compatibility with all TRC20 tokens.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<number>} The token balance.
   * @throws {Error} If the contract interaction fails or returns invalid data.
   */
  async getTokenBalance (tokenAddress) {
    const contract = await this._tronWeb.contract().at(tokenAddress)
    if (!contract) {
      throw new Error(`Failed to load contract at address ${tokenAddress}`)
    }

    const address = await this.getAddress()
    const hexAddress = this._tronWeb.address.toHex(address)

    const result =
      await this._tronWeb.transactionBuilder.triggerConstantContract(
        tokenAddress,
        'balanceOf(address)',
        {},
        [
          {
            type: 'address',
            value: hexAddress
          }
        ],
        address
      )

    if (!result || !result.constant_result || !result.constant_result[0]) {
      throw new Error('Invalid response format from contract')
    }

    const balance = this._tronWeb.toBigNumber(
      '0x' + result.constant_result[0]
    )
    return Number(balance.toString())
  }

  /**
   * Sends a transaction.
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The send transaction's result.
   */
  async sendTransaction ({ to, value }) {
    const from = await this.getAddress()
    const transaction = await this._tronWeb.transactionBuilder.sendTrx(
      to,
      value,
      from
    )

    const fee = await this._calculateBandwidthCost(
      transaction.raw_data_hex
    )

    const signedTransaction = await this._signTransaction(transaction)
    const sendResponse = await this._tronWeb.trx.sendRawTransaction(
      signedTransaction
    )

    if (!sendResponse || !sendResponse.result) {
      throw new Error(
        sendResponse
          ? sendResponse.code || JSON.stringify(sendResponse)
          : 'Empty response from network'
      )
    }

    return { hash: sendResponse.txid, fee }
  }

  /**
   * Quotes a transaction.
   *
   * @param {TronTransaction} tx - The transaction to quote.
   * @returns {Promise<Omit<TransactionResult, "hash">>} The transaction's quotes.
   */
  async quoteSendTransaction ({ to, value }) {
    const from = await this.getAddress()

    const transaction = await this._tronWeb.transactionBuilder.sendTrx(
      to,
      value,
      from
    )

    const fee = await this._calculateBandwidthCost(transaction.raw_data_hex)

    return { fee }
  }

  /**
   * Transfers a token to another address.
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer (options) {
    const { recipient, token, amount } = options
    const from = await this.getAddress()
    const hexFrom = this._tronWeb.address.toHex(from)
    const hexRecipient = this._tronWeb.address.toHex(recipient)
    const { fee } = await this.quoteTransfer(options)

    // eslint-disable-next-line
    if (this._config.transferMaxFee != undefined && fee >= this._config.transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operations.')
    }

    const parameters = [
      { type: 'address', value: hexRecipient },
      { type: 'uint256', value: amount }
    ]
    const txResult =
      await this._tronWeb.transactionBuilder.triggerSmartContract(
        token,
        'transfer(address,uint256)',
        { feeLimit: this._config.transferMaxFee, callValue: 0 },
        parameters,
        hexFrom
      )

    const unsignedTx = txResult.transaction
    const signature = await this._signingKey.sign(unsignedTx.txID)
    unsignedTx.signature = [signature]

    const result = await this._tronWeb.trx.sendRawTransaction(unsignedTx)

    if (!result || !result.result) {
      throw new Error(
        result
          ? result.code || JSON.stringify(result)
          : 'Empty response from network'
      )
    }

    return { hash: result.txid, fee }
  }

  /**
   * Quotes the costs of a token transfer operation.
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, "hash">>} The transfer's quotes.
   */
  async quoteTransfer (options) {
    const { recipient, token, amount } = options
    const from = await this.getAddress()
    const functionSelector = 'transfer(address,uint256)'
    const parameter = [
      { type: 'address', value: this._tronWeb.address.toHex(recipient) },
      { type: 'uint256', value: amount }
    ]

    const simulationResult = await this._tronWeb.transactionBuilder.triggerConstantContract(
      token,
      functionSelector,
      {},
      parameter,
      from
    )

    // eslint-disable-next-line
    const energy_required = simulationResult.energy_used

    // eslint-disable-next-line
    if (energy_required === undefined) {
      throw new Error('Could not estimate energy. The transaction may fail.')
    }

    const chainParams = await this._tronWeb.trx.getChainParameters()
    const energyPrice = chainParams.find(param => param.key === 'getEnergyFee').value
    const resources = await this._tronWeb.trx.getAccountResources(from)
    const availableEnergy = (resources.EnergyLimit || 0) - (resources.EnergyUsed || 0)

    let energyCostInSun = 0

    // eslint-disable-next-line
    if (availableEnergy < energy_required) {
      // eslint-disable-next-line
      energyCostInSun = Math.ceil(energy_required * energyPrice)
    }

    // eslint-disable-next-line
    const bandwidthCostInSun = await this._calculateBandwidthCost(simulationResult.transaction.raw_data_hex)

    const fee = energyCostInSun + bandwidthCostInSun

    return { fee }
  }

  /**
   * Returns a transaction's receipt.
   *
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<TronTransactionReceipt | null>} The receipt, or null if the transaction has not been included in a block yet.
   */
  async getTransactionReceipt (hash) {
    const receipt = await this._tronWeb.trx.getTransactionInfo(hash)

    if (!receipt || Object.keys(receipt).length === 0) {
      return null
    }

    return receipt
  }

  /**
     * Disposes the wallet account, and erases the private key from the memory.
     */
  dispose () {
    sodium.sodium_memzero(this._privateKeyBuffer)
    sodium.sodium_memzero(this._hmacOutputBuffer)
    sodium.sodium_memzero(this._derivationDataBuffer)

    this._privateKeyBuffer = null
    this._hmacOutputBuffer = null
    this._derivationDataBuffer = null
    this._signingKey = null
    this._tronWeb = null
  }

  async _signTransaction (transaction) {
    if (transaction.raw_data) {
      // This is a regular TRX transfer
      const signature = await this._signingKey.sign(transaction.txID)
      transaction.signature = [signature]
      return transaction
    }

    // This is a smart contract call
    const rawTx = await this._tronWeb.transactionBuilder.triggerSmartContract(
      transaction.to,
      transaction.functionSelector,
      transaction.options,
      transaction.parameters,
      transaction.issuerAddress
    )

    const signature = await this._signingKey.sign(rawTx)
    transaction.signature = [signature]
    return transaction
  }

  /**
   * Calculates transaction cost based on bandwidth consumption.
   * @protected
   * @param {string} rawDataHex - The raw transaction data in hex format
   * @returns {Promise<number>} The transaction cost in sun (1 TRX = 1,000,000 sun)
   */
  async _calculateBandwidthCost (rawDataHex) {
    const from = await this.getAddress()
    const resources = await this._tronWeb.trx.getAccountResources(from)
    const txSizeBytes = rawDataHex.length / 2
    const requiredBandwidth = txSizeBytes * 2
    const freeBandwidthLeft = (resources.freeNetLimit || 0) - (resources.freeNetUsed || 0)
    const frozenBandwidthLeft = (resources.NetLimit || 0) - (resources.NetUsed || 0)
    const totalAvailableBandwidth = freeBandwidthLeft + frozenBandwidthLeft
    const missingBandwidth = Math.max(0, requiredBandwidth - totalAvailableBandwidth)

    if (missingBandwidth === 0) {
      return 0
    }

    return Math.ceil(requiredBandwidth * BANDWIDTH_PRICE)
  }
}
