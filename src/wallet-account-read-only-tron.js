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

import FailoverProvider from '@tetherto/wdk-failover-provider'

import { TronWeb, Trx } from 'tronweb'

/** @typedef {import('tronweb').Types.Transaction} Transaction */
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
 * @property {string | TronWeb | Array<string | TronWeb>} [provider] - The url of the tron web provider, or an instance of the {@link TronWeb} class. It's also possible to provide a list of urls or {@link TronWeb} instances instead. In such case, connection errors will cause the wallet to automatically fallback on the next provider in the list. When passing {@link TronWeb} instances, the first one becomes the wallet's primary client; the others contribute only their `fullNode` / `solidityNode` / `eventServer` to the failover pool.
 * @property {number} [retries] - If set and if 'provider' is a list of urls or {@link TronWeb} instances, the number of additional retry attempts after the initial call fails. Total attempts = `1 + retries`. For example, `retries: 3` with 4 providers will try each provider once before throwing. If `retries` exceeds the number of providers, the failover will loop back and retry already-failed providers in round-robin order. Default: 3.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 */

/**
 * @typedef {Object} TronActivationFee
 * @property {bigint} activationFee - The portion of the fee used for account activation.
 */

const BANDWIDTH_PRICE = 1_000n
const ACCOUNT_ACTIVATION_FEE_SUN = 1_000_000n
const ACCOUNT_ACTIVATION_BANDWIDTH_COST = 100_000n
/**
 * The length of an ECDSA signature in bytes.
 */
const SIGNATURE_LENGTH_IN_BYTES = 65
/**
 * A fixed overhead added by the TRON protocol to account for the transaction result
 * (MAX_RESULT_SIZE_IN_TX). Defined as 64 bytes.
 */
const TRANSACTION_RESULT_OVERHEAD_IN_BYTES = 64
/**
 * The approximate Protobuf overhead for the transaction envelope.
 * We use a generous value of 15 bytes to ensure we favor overestimation
 * (which is safer for fee limits) rather than underestimation.
 */
const PROTOBUF_OVERHEAD_IN_BYTES = 15

export default class WalletAccountReadOnlyTron extends WalletAccountReadOnly {
  /**
   * Creates a new tron read-only wallet account.
   *
   * @param {string} address - The account's address.
   * @param {Omit<TronWalletConfig, 'transferMaxFee'>} [config] - The configuration object.
   */
  constructor (address, config = {}) {
    super(address)

    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<TronWalletConfig, "transferMaxFee">}
     */
    this._config = config

    /**
     * The tron web client.
     *
     * @protected
     * @type {TronWeb | undefined}
     */
    this._tronWeb = WalletAccountReadOnlyTron.initializeProvider(config)
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
   * TRC-20 transfers do not incur an account activation fee.
   *
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

    const [chainParameters, resources] = await Promise.all([
      this._tronWeb.trx.getChainParameters(),
      this._tronWeb.trx.getAccountResources(address)
    ])

    const { value: energyPrice } = chainParameters.find(({ key }) => key === 'getEnergyFee')

    const availableEnergy = BigInt(resources.EnergyLimit || 0) - BigInt(resources.EnergyUsed || 0)

    // We ignore contract-level sponsorship (consume_user_resource_percent) as it depends
    // on real-time factors, ensuring our fee estimate remains the safest.
    const energyNeeded = BigInt(energyUsed || 0n) - availableEnergy
    const totalEnergyCost = energyNeeded > 0n ? energyNeeded * BigInt(energyPrice) : 0n

    const bandwidthCost = await this._getBandwidthCost(transaction, { isActivation: false, resources })

    return {
      fee: totalEnergyCost + bandwidthCost
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
   * @param {Transaction} transaction - The tron web's transaction.
   * @param {Object} [options] - The transaction's options.
   * @returns {Promise<bigint>} The bandwidth cost in SUN.
   */
  async _getBandwidthCost (transaction, { isActivation, resources: cachedResources } = {}) {
    const rawDataHex = transaction.raw_data_hex
    // Each hex character represents half a byte. We add the signature length (65 bytes),
    // the transaction result overhead (64 bytes), and the Protobuf overhead for the transaction envelope.
    const txSizeInBytes = BigInt(Math.ceil(rawDataHex.length / 2) + SIGNATURE_LENGTH_IN_BYTES + TRANSACTION_RESULT_OVERHEAD_IN_BYTES + PROTOBUF_OVERHEAD_IN_BYTES)

    const address = await this.getAddress()
    const resources = cachedResources ?? await this._tronWeb.trx.getAccountResources(address)

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

  /**
   * Initializes the tron web provider with optional failover support.
   *
   * @param {Omit<TronWalletConfig, 'transferMaxFee'>} config - The read-only wallet account configuration.
   * @returns {TronWeb | undefined} The initialized tron web provider.
   */
  static initializeProvider (config) {
    const { provider, retries = 3 } = config

    let tronWeb

    if (Array.isArray(provider)) {
      if (!provider.length) {
        throw new Error("The 'provider' option cannot be set to an empty list.")
      }

      const fullNodeFailover = new FailoverProvider({ retries })
      const solidityNodeFailover = new FailoverProvider({ retries })
      const eventServerFailover = new FailoverProvider({ retries })

      const clients = provider.map((entry) => {
        if (typeof entry === 'string') {
          return new TronWeb({ fullHost: entry })
        }

        if (!tronWeb) tronWeb = entry
        return entry
      })

      for (const client of clients) {
        fullNodeFailover.addProvider(client.fullNode)
        solidityNodeFailover.addProvider(client.solidityNode)
        eventServerFailover.addProvider(client.eventServer)
      }

      const fullNode = fullNodeFailover.initialize()
      const solidityNode = solidityNodeFailover.initialize()
      const eventServer = eventServerFailover.initialize()

      if (!tronWeb) return new TronWeb({ fullNode, solidityNode, eventServer })

      tronWeb.setFullNode(fullNode)
      tronWeb.setSolidityNode(solidityNode)
      tronWeb.setEventServer(eventServer)

      return tronWeb
    }

    return typeof provider === 'string'
      ? new TronWeb({ fullHost: provider })
      : provider
  }
}
