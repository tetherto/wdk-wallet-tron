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

import { WalletAccountReadOnly } from '@tetherto/wdk-wallet'

import { TronWeb, Trx } from 'tronweb'

/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.TriggerSmartContract} TriggerSmartContract */
/** @typedef {import('tronweb').Types.TransactionInfo} TronTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/**
 * @typedef {Object} TronTransaction
 * @property {string} to - The transaction's recipient.
 * @property {number | bigint} value - The amount of tronixs to send to the recipient (in suns).
 */

/**
 * @typedef {Object} TronWalletConfig
 * @property {string | TronWeb} [provider] - The url of the tron web provider, or an instance of the {@link TronWeb} class.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 */

/**
 * @typedef {Object} TronActivationFee
 * @property {bigint} activationFee - The portion of the fee used for account activation.
 */

const BANDWIDTH_PRICE = 1_000n
const ACCOUNT_ACTIVATION_FEE_SUN = 1_000_000n
const ACCOUNT_ACTIVATION_FEE_ENERGY = 25_000n
const ACCOUNT_ACTIVATION_BANDWIDTH_COST = 100_000n
const SIGNATURE_LENGTH_IN_BYTES = 65

export default class WalletAccountReadOnlyTron extends WalletAccountReadOnly {
  /**
   * Creates a new tron read-only wallet account.
   *
   * @param {string} address - The account's address.
   * @param {Omit<TronWalletConfig, 'transferMaxFee'>} [config] - The configuration object.
   */
  constructor (address, config = { }) {
    super(address)

    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<TronWalletConfig, "transferMaxFee">}
     */
    this._config = config

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
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify (hex-encoded).
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const address = await this.getAddress()

    const recoveredAddress = Trx.verifyMessageV2(message, signature)

    return address === recoveredAddress
  }

  /**
   * Returns the account's tronix balance.
   *
   * @returns {Promise<bigint>} The tronix balance (in suns).
   */
  async getBalance () {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to retrieve balances.')
    }

    const address = await this.getAddress()

    const balance = await this._tronWeb.trx.getBalance(address)

    return BigInt(balance)
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<bigint>} The token balance (in base unit).
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

    return BigInt(balance)
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
   */
  async quoteSendTransaction ({ to, value }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to quote transactions.')
    }

    const address = await this.getAddress()

    const transaction = await this._tronWeb.transactionBuilder.sendTrx(to, value, address)

    return await this._getSendTrxFee(to, transaction)
  }

  /**
   * Quotes the costs of TRC-20 transfer operation.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'> & TronActivationFee>} The transfer's quotes.
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
    let simulation
    try {
      simulation = await this._tronWeb.transactionBuilder
        .triggerConstantContract(token, 'transfer(address,uint256)', {}, parameters, addressHex)
    } catch (error) {
      if (error.message?.includes('REVERT')) {
        const balance = await this.getTokenBalance(token)
        if (balance < BigInt(amount)) {
          throw new Error('Insufficient token balance for the transfer.')
        }
      }

      throw error
    }

    const { transaction, energy_used: energyUsed } = simulation

    const recipientAccount = await this._tronWeb.trx.getAccount(recipient)
    const isActivation = Object.keys(recipientAccount).length === 0

    const chainParameters = await this._tronWeb.trx.getChainParameters()
    const { value: energyPrice } = chainParameters.find(({ key }) => key === 'getEnergyFee')

    const resources = await this._tronWeb.trx.getAccountResources(address)
    const availableEnergy = BigInt(resources.EnergyLimit || 0) - BigInt(resources.EnergyUsed || 0)

    const energyNeeded = BigInt(energyUsed) - availableEnergy
    const baseEnergyCost = energyNeeded > 0n ? energyNeeded * BigInt(energyPrice) : 0n

    const totalEnergyNeeded = isActivation
      ? BigInt(energyUsed) + ACCOUNT_ACTIVATION_FEE_ENERGY - availableEnergy
      : energyNeeded
    const totalEnergyCost = totalEnergyNeeded > 0n ? totalEnergyNeeded * BigInt(energyPrice) : 0n

    const bandwidthCost = await this._getBandwidthCost(transaction, { isActivation: false })

    return {
      fee: totalEnergyCost + bandwidthCost,
      activationFee: totalEnergyCost - baseEnergyCost
    }
  }

  /**
   * Returns the fee of a send transaction operation.
   *
   * @protected
   * @param {string} to - The recipient's address.
   * @param {Transaction} transaction - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's fee in SUN.
   */
  async _getSendTrxFee (to, transaction) {
    const recipientAccount = await this._tronWeb.trx.getAccount(to)
    const isActivation = Object.keys(recipientAccount).length === 0
    const activationFee = isActivation
      ? ACCOUNT_ACTIVATION_FEE_SUN
      : 0n

    const bandwidthCost = await this._getBandwidthCost(transaction, { isActivation })

    return {
      fee: bandwidthCost + activationFee,
      activationFee
    }
  }

  /**
   * Returns a transaction's receipt.
   *
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<TronTransactionReceipt | null>} The receipt, or null if the transaction has not been included in a block yet.
   */
  async getTransactionReceipt (hash) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to fetch transaction receipts.')
    }

    const receipt = await this._tronWeb.trx.getTransactionInfo(hash)

    if (!receipt || Object.keys(receipt).length === 0) {
      return null
    }

    return receipt
  }

  /**
   * Returns the bandwidth cost of a tron web's transaction.
   *
   * @protected
   * @param {Transaction<TriggerSmartContract>} transaction - The tron web's transaction.
   * @param {Object} [options] - The transaction's options.
   * @returns {Promise<bigint>} The bandwidth cost in SUN.
   */
  async _getBandwidthCost (transaction, { isActivation } = {}) {
    const rawDataHex = transaction.raw_data_hex
    // Each hex character represents half a byte. We add the signature length (65 bytes)
    // plus approximately 5 bytes of Protobuf overhead for the transaction envelope.
    const txSizeInBytes = BigInt(Math.ceil(rawDataHex.length / 2) + SIGNATURE_LENGTH_IN_BYTES + 5)

    const address = await this.getAddress()
    const resources = await this._tronWeb.trx.getAccountResources(address)

    const freeBandwidthLeft = BigInt(resources.freeNetLimit || 0) - BigInt(resources.freeNetUsed || 0)
    const frozenBandwidthLeft = BigInt(resources.NetLimit || 0) - BigInt(resources.NetUsed || 0)

    if (frozenBandwidthLeft >= txSizeInBytes) {
      return 0n
    }

    if (isActivation) {
      return ACCOUNT_ACTIVATION_BANDWIDTH_COST
    }

    if (freeBandwidthLeft >= txSizeInBytes) {
      return 0n
    }

    return txSizeInBytes * BANDWIDTH_PRICE
  }
}
