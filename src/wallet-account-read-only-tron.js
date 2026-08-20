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

import { WalletAccountReadOnly, NoSuchElementError, ValueError } from '@tetherto/wdk-wallet'

import FailoverProvider from '@tetherto/wdk-failover-provider'

import { TronWeb, Trx } from 'tronweb'

/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.AccountResourceMessage} AccountResourceMessage */
/** @typedef {import('tronweb').Types.TransactionInfo} TronTransactionReceipt */
/** @typedef {import('tronweb').Types.TriggerSmartContractOptions} TriggerSmartContractOptions */
/** @typedef {import('tronweb').Types.ContractFunctionParameter} ContractFunctionParameter */

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet').TransactionReceipt} TransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet').WaitForTransactionOptions} WaitForTransactionOptions */

/**
 * The tron-specific fields added to a normalized transaction receipt.
 *
 * @typedef {Object} TronTransactionDetails
 * @property {number | null} confirmations - The confirmation depth (null when the solidified block can't be resolved).
 * @property {TronTransactionReceipt | null} receipt - The native tron receipt, or null while the transaction is pending or dropped.
 */

/**
 * A native tronix (TRX) transfer.
 *
 * @typedef {Object} TronTrxTransfer
 * @property {string} to - The transaction's recipient.
 * @property {number | bigint} value - The amount of tronixs to send to the recipient (in suns).
 */

/**
 * A smart contract call.
 *
 * @typedef {Object} TronSmartContractCall
 * @property {string} contractAddress - The address of the smart contract to call.
 * @property {string} functionSelector - The function selector to invoke (e.g. 'transfer(address,uint256)').
 * @property {ContractFunctionParameter[]} [parameters] - The parameters to pass to the function (default: []).
 * @property {TriggerSmartContractOptions} [options] - The trigger options (e.g. `feeLimit`, `callValue`).
 */

/**
 * A transaction the wallet can send. One of:
 * - a native tronix transfer ({@link TronTrxTransfer});
 * - a smart contract call ({@link TronSmartContractCall});
 * - a pre-built tron web transaction.
 *
 * @typedef {TronTrxTransfer | TronSmartContractCall | Transaction} TronTransaction
 */

/**
 * @typedef {Object} TronWalletConfig
 * @property {string | TronWeb | Array<string | TronWeb>} [provider] - The url of the tron web provider, or an instance of the {@link TronWeb} class. It's also possible to provide a list of urls or {@link TronWeb} instances instead. In such case, connection errors will cause the wallet to automatically fallback on the next provider in the list. When passing {@link TronWeb} instances, the first one becomes the wallet's primary client; the others contribute only their `fullNode` / `solidityNode` / `eventServer` to the failover pool.
 * @property {number} [retries] - If set and if 'provider' is a list of urls or {@link TronWeb} instances, the number of additional retry attempts after the initial call fails. Total attempts = `1 + retries`. For example, `retries: 3` with 4 providers will try each provider once before throwing. If `retries` exceeds the number of providers, the failover will loop back and retry already-failed providers in round-robin order. Default: 3.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for sendTransaction and signTransaction operations.
 */

/**
 * @typedef {Object} TronActivationFee
 * @property {bigint} activationFee - The portion of the fee used for account activation.
 */

/**
 * @typedef {Object} TronBandwidthCostOptions
 * @property {boolean} [isActivation] - Whether the transaction activates a new recipient account.
 * @property {AccountResourceMessage} [resources] - Resource snapshot returned by `getAccountResources` for the sender.
 */

/**
 * The `TriggerSmartContract` parameter value used to estimate a smart contract call's energy cost.
 *
 * @typedef {Object} EstimateEnergyCostValue
 * @property {string} contract_address - The smart contract address (hex).
 * @property {string} data - The encoded call data.
 * @property {string} owner_address - The caller's address (hex).
 * @property {number} [call_value] - The amount of tronixs (in suns) sent along with the call.
 */

const BANDWIDTH_PRICE = 1_000n
const ACCOUNT_ACTIVATION_FEE_SUN = 1_000_000n
const ACCOUNT_ACTIVATION_BANDWIDTH_COST = 100_000n
const DEFAULT_FEE_LIMIT_SUN = 15_000_000
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
   * @param {Omit<TronWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} [config] - The configuration object.
   */
  constructor (address, config = {}) {
    super(address)

    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<TronWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>}
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
   * Returns whether a transaction is an already-built tron web transaction
   * (as returned by `tronWeb.transactionBuilder.*`).
   *
   * @protected
   * @param {TronTransaction} tx - The transaction.
   * @returns {boolean} True if the transaction is a pre-built tron web transaction.
   */
  static _isPrebuiltTransaction (tx) {
    return !!tx.txID
  }

  /**
   * Returns whether a transaction is a smart contract call descriptor.
   *
   * @protected
   * @param {TronTransaction} tx - The transaction.
   * @returns {boolean} True if the transaction is a smart contract call.
   */
  static _isSmartContractCall (tx) {
    return !!tx.functionSelector
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
   * Returns the remaining amount of a TRC-20 token that a spender is allowed to spend
   * on behalf of the account.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @param {string} spender - The spender's address.
   * @returns {Promise<bigint>} The allowance (in base unit).
   */
  async getAllowance (tokenAddress, spender) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to retrieve allowances.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)
    const spenderHex = this._tronWeb.address.toHex(spender)
    const parameters = [{ type: 'address', value: addressHex }, { type: 'address', value: spenderHex }]

    const result = await this._tronWeb.transactionBuilder
      .triggerConstantContract(tokenAddress, 'allowance(address,address)', {}, parameters, addressHex)

    return BigInt('0x' + result.constant_result[0])
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
   */
  async quoteSendTransaction (tx) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to quote transactions.')
    }

    const transaction = await this._buildTransaction(tx)

    return await this._quoteTransaction(transaction)
  }

  /**
   * Builds an unsigned tron web transaction from the given transaction.
   *
   * @protected
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<Transaction>} The unsigned tron web transaction.
   * @throws {Error} If the transaction is invalid.
   */
  async _buildTransaction (tx) {
    if (WalletAccountReadOnlyTron._isPrebuiltTransaction(tx)) {
      return tx
    }

    if (WalletAccountReadOnlyTron._isSmartContractCall(tx)) {
      const { contractAddress, functionSelector, parameters = [], options = {} } = tx
      const address = await this.getAddress()
      const addressHex = this._tronWeb.address.toHex(address)

      const { transaction } = await this._tronWeb.transactionBuilder
        .triggerSmartContract(contractAddress, functionSelector, { feeLimit: DEFAULT_FEE_LIMIT_SUN, ...options }, parameters, addressHex)

      return transaction
    }

    const { to, value } = tx

    if (to && value) {
      const address = await this.getAddress()

      return await this._tronWeb.transactionBuilder.sendTrx(to, value, address)
    }

    throw new Error('Invalid transaction.')
  }

  /**
   * Quotes the fee of an already-built tron web transaction. The fee is derived from
   * the transaction's contract type, so this works for every kind of transaction:
   * - bandwidth: applies to every transaction (derived from its serialized size);
   * - energy: only smart contract execution (`TriggerSmartContract`) consumes it;
   * - activation: only native value transfers to a not-yet-activated recipient.
   *
   * @protected
   * @param {Transaction} transaction - The unsigned tron web transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
   */
  async _quoteTransaction (transaction) {
    const contract = transaction.raw_data?.contract?.[0]
    const type = contract?.type
    const value = contract?.parameter?.value ?? {}

    const isActivation = await this._isActivatingTransfer(type, value)
    const activationFee = isActivation ? ACCOUNT_ACTIVATION_FEE_SUN : 0n

    const energyCost = type === 'TriggerSmartContract'
      ? await this._estimateEnergyCost(value)
      : 0n

    const bandwidthCost = await this._getBandwidthCost(transaction, { isActivation })

    return {
      fee: bandwidthCost + energyCost + activationFee,
      activationFee
    }
  }

  /**
   * Returns whether a transaction is a native value transfer to a not-yet-activated
   * recipient account (which incurs the account activation fee).
   *
   * @protected
   * @param {string | undefined} type - The transaction's contract type.
   * @param {{ to_address?: string }} value - The transaction's contract parameter value.
   * @returns {Promise<boolean>} True if the transfer activates a new account.
   */
  async _isActivatingTransfer (type, { to_address: toAddress }) {
    if (type !== 'TransferContract' && type !== 'TransferAssetContract') {
      return false
    }

    if (!toAddress) {
      return false
    }

    const recipientAccount = await this._tronWeb.trx.getAccount(toAddress)

    return Object.keys(recipientAccount).length === 0
  }

  /**
   * Estimates the energy cost of a smart contract call by re-simulating it from the
   * built transaction's raw call data.
   *
   * @protected
   * @param {EstimateEnergyCostValue} value - The `TriggerSmartContract` parameter value.
   * @returns {Promise<bigint>} The energy cost in SUN.
   */
  async _estimateEnergyCost ({ contract_address: contractAddress, data, owner_address: ownerAddress, call_value: callValue = 0 }) {
    const { energy_used: energyUsed } = await this._tronWeb.transactionBuilder
      .triggerConstantContract(contractAddress, '', { input: data, callValue }, [], ownerAddress)

    const [chainParameters, resources] = await Promise.all([
      this._tronWeb.trx.getChainParameters(),
      this._tronWeb.trx.getAccountResources(await this.getAddress())
    ])

    const { value: energyPrice } = chainParameters.find(({ key }) => key === 'getEnergyFee')

    return this._netEnergyCost(energyUsed, energyPrice, resources)
  }

  /**
   * Computes the energy fee (in SUN) needed beyond the account's available staked energy.
   *
   * @protected
   * @param {number} energyUsed - The energy consumed by the call.
   * @param {number} energyPrice - The energy price (in SUN).
   * @param {AccountResourceMessage} resources - The sender's resource snapshot.
   * @returns {bigint} The energy cost in SUN.
   */
  _netEnergyCost (energyUsed, energyPrice, resources) {
    const availableEnergy = BigInt(resources.EnergyLimit || 0) - BigInt(resources.EnergyUsed || 0)

    // We ignore contract-level sponsorship (consume_user_resource_percent) as it depends
    // on real-time factors, ensuring our fee estimate remains the safest.
    const energyNeeded = BigInt(energyUsed || 0n) - availableEnergy

    return energyNeeded > 0n ? energyNeeded * BigInt(energyPrice) : 0n
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

    return {
      fee: await this._estimateContractFee(simulation)
    }
  }

  /**
   * Estimates the energy and bandwidth fee of a smart contract call from a
   * constant contract simulation result.
   *
   * @protected
   * @param {Object} simulation - The result of a `triggerConstantContract` call.
   * @param {Transaction} simulation.transaction - The simulated transaction.
   * @param {number} [simulation.energy_used] - The estimated energy consumption.
   * @returns {Promise<bigint>} The estimated fee in SUN.
   */
  async _estimateContractFee ({ transaction, energy_used: energyUsed }) {
    const address = await this.getAddress()

    const [chainParameters, resources] = await Promise.all([
      this._tronWeb.trx.getChainParameters(),
      this._tronWeb.trx.getAccountResources(address)
    ])

    const { value: energyPrice } = chainParameters.find(({ key }) => key === 'getEnergyFee')

    const totalEnergyCost = this._netEnergyCost(energyUsed, energyPrice, resources)

    const bandwidthCost = await this._getBandwidthCost(transaction, { isActivation: false, resources })

    return totalEnergyCost + bandwidthCost
  }

  /**
   * Returns a transaction's receipt.
   *
   * @deprecated Use {@link getTransaction} instead, which returns a normalized, finality-based receipt. The raw tron receipt remains available on its `receipt` property.
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
   * Returns a normalized, finality-based receipt for a transaction.
   *
   * A transaction included in a block is `confirmed`; once its block has been
   * solidified (irreversible) it becomes `final`.
   *
   * @param {string} hash - The transaction's hash.
   * @returns {Promise<TransactionReceipt & TronTransactionDetails>} The normalized receipt.
   * @throws {ValueError} If the hash is not a valid transaction id.
   * @throws {NoSuchElementError} If no transaction has been found for the given hash.
   */
  async getTransaction (hash) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to fetch transactions.')
    }

    if (typeof hash !== 'string' || !/^(0x)?[0-9a-fA-F]{64}$/.test(hash.trim())) {
      throw new ValueError(`Invalid transaction id: '${hash}'.`)
    }

    const txid = hash.trim()

    const receipt = await this._tronWeb.trx.getUnconfirmedTransactionInfo(txid)

    if (!receipt || Object.keys(receipt).length === 0) {
      throw new NoSuchElementError(`No transaction found for '${txid}'.`)
    }

    const blockNumber = receipt.blockNumber ?? null

    if (blockNumber === null) {
      return {
        hash: txid,
        finality: 'pending',
        confirmations: null,
        receipt: null
      }
    }

    const solidifiedBlock = await this._getSolidifiedBlockNumber()

    const confirmations = solidifiedBlock !== null
      ? Math.max(0, solidifiedBlock - blockNumber + 1)
      : null

    const isFinal = solidifiedBlock !== null && blockNumber <= solidifiedBlock

    return {
      hash: txid,
      finality: isFinal ? 'final' : 'confirmed',
      success: this._isTransactionSuccessful(receipt),
      block: blockNumber,
      fee: receipt.fee != null ? BigInt(receipt.fee) : undefined,
      confirmations,
      receipt
    }
  }

  /**
   * Blocks until a transaction reaches a terminal state (the requested finality target or `dropped`), or times out.
   *
   * @param {string} hash - The transaction's hash.
   * @param {WaitForTransactionOptions} [options] - The wait options.
   * @returns {Promise<TransactionReceipt & TronTransactionDetails>} The terminal receipt: the finality target reached (inspect `success` to tell success from revert), or `dropped`.
   * @throws {TimeoutError} If the target is not reached before the timeout.
   */
  async waitForTransaction (hash, options = {}) {
    return await super.waitForTransaction(hash, options)
  }

  /**
   * Returns whether a committed transaction executed successfully.
   *
   * @protected
   * @param {TronTransactionReceipt} receipt - The native tron receipt.
   * @returns {boolean} The execution result.
   */
  _isTransactionSuccessful (receipt) {
    if (receipt.result === 'FAILED') {
      return false
    }

    const contractResult = receipt.receipt?.result

    return contractResult == null || contractResult === 'SUCCESS'
  }

  /**
   * Returns the number of the latest solidified (irreversible) block, or null when it can't be resolved.
   *
   * @protected
   * @returns {Promise<number | null>} The solidified block number, or null.
   */
  async _getSolidifiedBlockNumber () {
    try {
      const block = await this._tronWeb.trx.getConfirmedCurrentBlock()
      return block?.block_header?.raw_data?.number ?? null
    } catch (error) {
      return null
    }
  }

  /**
   * Overrides the base default to allow for slower tron inclusion and solidification.
   *
   * @type {number}
   */
  get defaultWaitTimeout () {
    return 90000
  }

  /**
   * Returns the bandwidth cost of a tron web's transaction.
   *
   * @protected
   * @param {Transaction} transaction - The tron web's transaction.
   * @param {TronBandwidthCostOptions} [options] - Bandwidth calculation options.
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
   * @param {Omit<TronWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The read-only wallet account configuration.
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
