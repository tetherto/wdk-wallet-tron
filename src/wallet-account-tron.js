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

// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3'
import { hexToBytes } from '@noble/hashes/utils'

import { secp256k1 } from '@noble/curves/secp256k1'

import { HDKey } from '@scure/bip32'

import * as bip39 from 'bip39'

import { sodium_memzero } from 'sodium-universal'

/** @typedef {import('tronweb').TransactionInfo} TronTransactionReceipt */

/** @typedef {import('@wdk/wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@wdk/wallet').KeyPair} KeyPair */
/** @typedef {import('@wdk/wallet').TransactionResult} TransactionResult */
/** @typedef {import('@wdk/wallet').TransferOptions} TransferOptions */
/** @typedef {import('@wdk/wallet').TransferResult} TransferResult */

/**
 * @typedef {Object} TronTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number} value - The amount of tronixs to send to the recipient (in suns).
 */

/**
 * @typedef {Object} TronWalletConfig
 * @property {string | TronWeb} [provider] - The url of the tron web provider, or an instance of the {@link TronWeb} class.
 */

const BIP_44_TRON_DERIVATION_PATH_PREFIX = "m/44'/195'"

const BANDWIDTH_PRICE = 1_000

/** @implements {IWalletAccount} */
export default class WalletAccountTron {
  /**
   * Creates a new tron wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config = {}) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    /** @private */
    this._path = BIP_44_TRON_DERIVATION_PATH_PREFIX + '/' + path

    /**
     * The tron wallet account configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    this._config = config

    /**
     * The account.
     *
     * @protected
     * @type {HDKey}
     */
    this._account = HDKey.fromMasterSeed(seed).derive(this._path)

    const { provider } = config

    if (provider) {
      /**
       * The tron web client.
       *
       * @protected
       * @type {TronWeb | undefined}
       */
      this._tronWeb = typeof provider === 'string'
        ? new TronWeb({ fullHost: provider })
        : provider
    }
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index () {
    return +this._path.split('/').pop()
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
      privateKey: this._account.privateKey,
      publicKey: this._account.publicKey
    }
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    const uncompressedPublicKey = secp256k1.Point.fromHex(this._account.publicKey)
      .toRawBytes(false)
      .slice(1)

    const publicKeyHash = keccak_256(uncompressedPublicKey)
    const addressBytes = publicKeyHash.slice(12)
    const addressHex = '41' + Buffer.from(addressBytes).toString('hex')

    const address = TronWeb.address.fromHex(addressHex)

    return address
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    const messageBytes = Buffer.from(message, 'utf8')
    const messageHash = keccak_256(messageBytes)
    const signatureBytes = this._account.sign(messageHash)

    const signature = Buffer.from(signatureBytes).toString('hex')

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
    const messageBytes = Buffer.from(message, 'utf8'),
          signatureBytes = Buffer.from(signature, 'hex')

    const messageHash = keccak_256(messageBytes)
    
    const isValid = this._account.verify(messageHash, signatureBytes)

    return isValid
  }

  /**
   * Returns the account's tronix balance.
   *
   * @returns {Promise<number>} The tronix balance (in suns).
   */
  async getBalance () {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to retrieve balances.')
    }

    const address = await this.getAddress()

    const balance = await this._tronWeb.trx.getBalance(address)

    return Number(balance)
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<number>} The token balance (in base unit).
   */
  async getTokenBalance (tokenAddress) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to retrieve token balances.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)
    const parameters = [{ type: 'address', value: addressHex }]

    const result = await this._tronWeb.transactionBuilder
      .triggerConstantContract(tokenAddress, 'balanceOf(address)', {}, parameters, addressHex)

    const balance = this._tronWeb.toBigNumber('0x' + result.constant_result[0])

    return Number(balance)
  }

  /**
   * Sends a transaction.
   *
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction ({ to, value }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to send transactions.')
    }

    const address = await this.getAddress()

    const transaction = await this._tronWeb.transactionBuilder.sendTrx(to, value, address)
    const fee = await this._getBandwidthCost(transaction.raw_data_hex)
    const signedTransaction = await this._signTransaction(transaction)

    const { txid } = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    return { hash: txid, fee }
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @see {@link sendTransaction}
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction ({ to, value }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to quote transactions.')
    }

    const address = await this.getAddress()

    const transaction = await this._tronWeb.transactionBuilder.sendTrx(to, value, address)
    const fee = await this._getBandwidthCost(transaction.raw_data_hex)

    return { fee }
  }

  /**
   * Transfers a token to another address.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer ({ token, recipient, amount }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to transfer tokens.')
    }

    const { fee } = await this.quoteTransfer({ token, recipient, amount })

    // eslint-disable-next-line eqeqeq
    if (this._config.transferMaxFee != undefined && fee >= this._config.transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operations.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)

    const options = {
      feeLimit: this._config.transferMaxFee,
      callValue: 0
    }

    const parameters = [
      { type: 'address', value: this._tronWeb.address.toHex(recipient) },
      { type: 'uint256', value: amount }
    ]

    const { transaction } = await this._tronWeb.transactionBuilder
      .triggerSmartContract(token, 'transfer(address,uint256)', options, parameters, addressHex)

    const signedTransaction = await this._signTransaction(transaction)

    const { txid } = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    return { hash: txid, fee }
  }

  /**
   * Quotes the costs of transfer operation.
   *
   * @see {@link transfer}
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer ({ token, recipient, amount }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to quote transfer operations.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)

    const parameters = [
      { type: 'address', value: this._tronWeb.address.toHex(recipient) },
      { type: 'uint256', value: amount }
    ]

    // eslint-disable-next-line camelcase
    const { transaction, energy_used } = await this._tronWeb.transactionBuilder
      .triggerConstantContract(token, 'transfer(address,uint256)', {}, parameters, addressHex)

    const chainParameters = await this._tronWeb.trx.getChainParameters()
    const { value } = chainParameters.find(({ key }) => key === 'getEnergyFee')

    const resources = await this._tronWeb.trx.getAccountResources(address)
    const availableEnergy = (resources.EnergyLimit || 0) - (resources.EnergyUsed || 0)

    // eslint-disable-next-line camelcase
    const energyCost = availableEnergy < energy_used ? Math.ceil(energy_used * value) : 0

    const bandwidthCost = await this._getBandwidthCost(transaction.raw_data_hex)

    const fee = energyCost + bandwidthCost

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

    return receipt
  }

  /**
   * Disposes the wallet account, erasing the private key from the memory.
   */
  dispose () {
    sodium_memzero(this._keyPair.privateKey)

    this._keyPair.privateKey = undefined
  }

  /** @private */
  async _signTransaction (transaction) {
    const transactionBytes = Buffer.from(transaction.txID, 'hex')
    const transactionHash = keccak_256(transactionBytes)
    const signatureBytes = this._account.sign(transactionHash)

    const signature = Buffer.from(signatureBytes).toString('hex')

    return {
      ...transaction,
      signature: [signature]
    }
  }

  /** @private */
  async _getBandwidthCost (rawDataHex) {
    const address = await this.getAddress()

    const resources = await this._tronWeb.trx.getAccountResources(address)

    const freeBandwidthLeft = (resources.freeNetLimit || 0) - (resources.freeNetUsed || 0)
    const frozenBandwidthLeft = (resources.NetLimit || 0) - (resources.NetUsed || 0)
    const totalAvailableBandwidth = freeBandwidthLeft + frozenBandwidthLeft
    const missingBandwidth = rawDataHex.length - totalAvailableBandwidth

    if (missingBandwidth <= 0) {
      return 0
    }

    const bandwitdth = Math.ceil(rawDataHex.length * BANDWIDTH_PRICE)

    return bandwitdth
  }
}
