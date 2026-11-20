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

import { DisposalError, MaximumFeeExceededError, ProviderRequiredError } from '@tetherto/wdk-wallet'

import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js'

import SeedSignerTron, { BIP_44_TRON_DERIVATION_PATH_PREFIX } from './signers/seed-signer-tron.js'
import PrivateKeySignerTron from './signers/private-key-signer-tron.js'

/**
 * @template TSignedTransaction
 * @typedef {import('@tetherto/wdk-wallet').IWalletAccount<TSignedTransaction>} IWalletAccount
 */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').ValueError} ValueError */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */
/** @typedef {import('./wallet-account-read-only-tron.js').TronActivationFee} TronActivationFee */

/** @typedef {import('./signers/signer-tron.js').ISignerTron} ISignerTron */

/** @typedef {import('tronweb').Types.SignedTransaction} TronSignedTransaction */

/**
 * @typedef {Object} ApproveOptions
 * @property {string} token - The address of the token to approve.
 * @property {string} spender - The spender's address.
 * @property {number | bigint} amount - The amount of tokens to approve to the spender.
 */

/**
 * @typedef {Object} SignerOptions
 * @property {boolean} [shouldWipeSignerOnDisposal] - If true, wipes the signer given at construction on calls to the 'dispose' method.
 */

const DEFAULT_ACCOUNT_PATH = "0'/0/0"

const DEFAULT_FEE_LIMIT_SUN = 15_000_000

/** @implements {IWalletAccount<TronSignedTransaction>} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron {
  /**
   * Creates a new tron wallet account from a signer.
   *
   * @overload
   * @param {ISignerTron} signer - The tron signer, derived to an account path.
   * @param {TronWalletConfig & SignerOptions} [config] - The configuration object.
   */

  /**
   * Creates a new tron wallet account from a seed.
   *
   * @overload
   * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {string} path - The BIP-44 derivation path, relative to "m/44'/195'" (e.g. "0'/0/0").
   * @param {TronWalletConfig} [config] - The configuration object.
   * @throws {ValueError} If the seed or the path is not valid.
   * @see https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
   */

  /**
   * Creates the first tron wallet account (m/44'/195'/0'/0/0) from a seed.
   *
   * @overload
   * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {TronWalletConfig} [config] - The configuration object.
   * @throws {ValueError} If the seed is not a valid seed or BIP-39 seed phrase.
   * @see https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
   */
  constructor (seedOrSigner, pathOrConfig = {}, config = {}) {
    const isSeed = typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array
    const hasPath = typeof pathOrConfig === 'string'
    const [signer, configuration] = isSeed
      ? [
          new SeedSignerTron(seedOrSigner, `${BIP_44_TRON_DERIVATION_PATH_PREFIX}/${hasPath ? pathOrConfig : DEFAULT_ACCOUNT_PATH}`),
          hasPath ? config : pathOrConfig
        ]
      : [seedOrSigner, pathOrConfig]

    try {
      super(undefined, configuration)
    } catch (error) {
      if (isSeed) signer.dispose()

      throw error
    }

    /**
     * The tron wallet account configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    this._config = configuration

    /** @private */
    this._signer = signer

    /**
     * If true, disposes the signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    this._shouldWipeSignerOnDisposal = isSeed || Boolean(configuration.shouldWipeSignerOnDisposal)

    /** @private */
    this._disposed = false

    /** @private */
    this._tronReadOnlyAccount = undefined
  }

  /**
   * Creates a new tron wallet account from a raw private key. The account owns the signer it creates
   * and wipes it on {@link dispose}.
   *
   * @param {string | Uint8Array} privateKey - The raw private key (hex string with or without 0x, or 32 bytes).
   * @param {TronWalletConfig} [config] - The configuration object.
   * @returns {WalletAccountTron} The wallet account.
   * @throws {ValueError} If the private key is not valid.
   */
  static fromPrivateKey (privateKey, config = {}) {
    const signer = new PrivateKeySignerTron(privateKey)

    try {
      return new WalletAccountTron(signer, { ...config, shouldWipeSignerOnDisposal: true })
    } catch (error) {
      signer.dispose()

      throw error
    }
  }

  /**
   * True if the wallet account has been disposed.
   *
   * @type {boolean}
   */
  get disposed () {
    return this._disposed
  }

  /**
   * The derivation path of this account (see BIP-44),
   * or null for an account backed by a non-HD signer.
   *
   * @type {string | null}
   * @see https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
   */
  get path () {
    return this._signer.path
  }

  /**
   * The account's key pair.
   *
   * The uint8 arrays are the signer's own, so any external change will reflect to the signer's internal representation. For this reason,
   * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
   * content, client code should never do so.
   *
   * Null if the account's signer does not expose key material.
   *
   * @type {KeyPair | null}
   */
  get keyPair () {
    return this._signer.keyPair
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    return await this._signer.getAddress()
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   * @throws {DisposalError} If the wallet account has been disposed.
   */
  async sign (message) {
    this._guardDisposed()

    return await this._signer.sign(message)
  }

  /**
   * Signs a transaction.
   *
   * @param {TronTransaction} tx - The transaction to sign.
   * @returns {Promise<TronSignedTransaction>} The signed transaction.
   * @throws {DisposalError} If the wallet account has been disposed.
   * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the maximum transaction fee option.
   * @throws {ProviderRequiredError} If the wallet is not connected to tron web.
   */
  async signTransaction (tx) {
    this._guardDisposed()

    if (!this._tronWeb) {
      throw new ProviderRequiredError('The wallet must be connected to tron web to sign transactions.')
    }

    const transaction = await this._buildOwnTransaction(tx)

    if (this._config.transactionMaxFee !== undefined) {
      const { fee } = await this._quoteTransaction(transaction)

      this._assertFeeWithinLimit(fee, this._config.transactionMaxFee, 'Exceeded maximum fee cost for transaction operation.')
    }

    return await this._signTransaction(transaction)
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {TronTransaction | TronSignedTransaction} tx - The transaction, or a signed transaction.
   * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
   */
  async quoteSendTransaction (tx) {
    return await super.quoteSendTransaction(tx)
  }

  /**
   * Sends a transaction.
   *
   * @param {TronTransaction | TronSignedTransaction} tx - The transaction, or a signed transaction.
   * @returns {Promise<TransactionResult & TronActivationFee>} The transaction's result.
   * @throws {DisposalError} If the wallet account has been disposed.
   * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the maximum transaction fee option.
   * @throws {ProviderRequiredError} If the wallet is not connected to tron web.
   */
  async sendTransaction (tx) {
    this._guardDisposed()

    if (!this._tronWeb) {
      throw new ProviderRequiredError('The wallet must be connected to tron web to send transactions.')
    }

    const signedTransaction = tx.signature
      ? tx
      : await this._signTransaction(await this._buildOwnTransaction(tx))

    const { fee, activationFee } = await this.quoteSendTransaction(signedTransaction)

    this._assertFeeWithinLimit(fee, this._config.transactionMaxFee, 'Exceeded maximum fee cost for transaction operation.')

    const { txid } = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    return { hash: txid, fee, activationFee }
  }

  /**
   * Transfers a TRC-20 token to another address.
   * TRC-20 transfers do not incur an account activation fee.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   * @throws {DisposalError} If the wallet account has been disposed.
   * @throws {MaximumFeeExceededError} If the transfer's cost exceeds the maximum transfer fee option.
   * @throws {TransferError} If the account's token balance is below the transfer amount.
   * @throws {ProviderRequiredError} If the wallet is not connected to tron web.
   */
  async transfer ({ token, recipient, amount }) {
    this._guardDisposed()

    if (!this._tronWeb) {
      throw new ProviderRequiredError('The wallet must be connected to tron web to transfer tokens.')
    }

    const { fee } = await this.quoteTransfer({ token, recipient, amount })

    this._assertFeeWithinLimit(fee, this._config.transferMaxFee, 'Exceeded maximum fee cost for transfer operations.')

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)

    const options = {
      feeLimit: Number(fee) || DEFAULT_FEE_LIMIT_SUN,
      callValue: 0,
      txLocal: true
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
   * Approves a specific amount of a TRC-20 token to a spender.
   *
   * @param {ApproveOptions} options - The approve options.
   * @returns {Promise<TransactionResult & TronActivationFee>} The transaction's result.
   * @throws {DisposalError} If the wallet account has been disposed.
   * @throws {MaximumFeeExceededError} If the transaction's cost exceeds the maximum transaction fee option.
   * @throws {ProviderRequiredError} If the wallet is not connected to tron web.
   */
  async approve (options) {
    this._guardDisposed()

    if (!this._tronWeb) {
      throw new ProviderRequiredError('The wallet must be connected to tron web to approve funds.')
    }

    const { token, spender, amount } = options

    return await this.sendTransaction({
      contractAddress: token,
      functionSelector: 'approve(address,uint256)',
      parameters: [
        { type: 'address', value: this._tronWeb.address.toHex(spender) },
        { type: 'uint256', value: BigInt(amount).toString() }
      ]
    })
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyTron>} The read-only account.
   */
  async toReadOnlyAccount () {
    if (!this._tronReadOnlyAccount) {
      const address = await this.getAddress()
      this._tronReadOnlyAccount = new WalletAccountReadOnlyTron(address, { ...this._config, provider: this._tronWeb })
    }

    return this._tronReadOnlyAccount
  }

  /**
   * Disposes the wallet account. The signer's private key is erased only if the account owns the signer (created from a
   * seed or private key, or with `shouldWipeSignerOnDisposal`); otherwise a signer you supplied is left untouched.
   * Calling it again has no effect.
   */
  dispose () {
    if (this._disposed) {
      return
    }

    if (this._shouldWipeSignerOnDisposal) {
      this._signer.dispose()
    }

    this._disposed = true
  }

  /** @private */
  _guardDisposed () {
    if (this.disposed) {
      throw new DisposalError('The wallet account has been disposed.')
    }
  }

  /** @private */
  async _assertTransactionOwner (transaction, isPrebuilt = false) {
    if (isPrebuilt && !this._isConsistentTransaction(transaction)) {
      throw new Error('The transaction id does not match its raw data.')
    }

    const address = await this.getAddress()
    const ownerHex = this._tronWeb.address.toHex(address).toLowerCase()

    const txOwner = transaction.raw_data?.contract?.[0]?.parameter?.value?.owner_address

    if (txOwner?.toLowerCase() !== ownerHex) {
      throw new Error('The transaction owner does not match the wallet account address.')
    }
  }

  /** @private */
  _isConsistentTransaction (transaction) {
    try {
      return this._tronWeb.utils.transaction.txCheck(transaction)
    } catch {
      return false
    }
  }

  /** @private */
  async _signTransaction (transaction) {
    return await this._signer.signTransaction(transaction)
  }

  /** @private */
  async _buildOwnTransaction (tx) {
    const isPrebuilt = WalletAccountReadOnlyTron._isPrebuiltTransaction(tx)

    const transaction = await this._buildTransaction(tx)

    await this._assertTransactionOwner(transaction, isPrebuilt)

    return transaction
  }

  /** @private */
  _assertFeeWithinLimit (fee, maxFee, message) {
    if (maxFee !== undefined && BigInt(fee) > BigInt(maxFee)) {
      throw new MaximumFeeExceededError(message)
    }
  }
}
