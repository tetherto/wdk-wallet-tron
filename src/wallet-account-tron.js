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

import SeedSignerTron from './signers/seed-signer-tron.js'
import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */

/** @implements {IWalletAccount} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron {
  /**
   * Creates a new TRON wallet account using a child signer.
   *
   * @param {import('./signers/interface.js').ISignerTron} signer - A child signer (not root).
   * @param {TronWalletConfig} [config]
   */
  constructor (signer, config = {}) {
    if (!signer) {
      throw new Error('A signer is required.')
    }
    if (signer.isRoot) {
      throw new Error('The signer is the root signer. Call derive() to create a child signer.')
    }

    super(signer.address, config)

    /** @protected */
    this._config = config
    /** @private */
    this._signer = signer
    this._isActive = true
  }

  get isActive () { return this._isActive }

  /**
   * The derivation path index of this account.
   * @type {number}
   */
  get index () { return this._signer.index }

  /**
   * The full BIP-44 derivation path.
   * @type {string}
   */
  get path () { return this._signer.path }

  /**
   * The account's key pair.
   * @type {KeyPair}
   */
  get keyPair () { return this._signer.keyPair }

  /**
   * Legacy factory — creates an account from a BIP-39 seed and a relative derivation path.
   *
   * @param {string|Uint8Array} seed
   * @param {string} path - Relative path, e.g. "0'/0/0"
   * @param {TronWalletConfig} [config]
   * @returns {WalletAccountTron}
   */
  static fromSeed (seed, path, config = {}) {
    const root = new SeedSignerTron(seed)
    const child = root.derive(path)
    return new WalletAccountTron(child, config)
  }

  /**
   * Signs a message using the TRON personal sign format.
   *
   * @param {string} message
   * @returns {Promise<string>} 0x-prefixed hex signature
   */
  async sign (message) {
    return this._signer.sign(message)
  }

  /**
   * Sends a TRX transaction.
   *
   * @param {TronTransaction} tx
   * @returns {Promise<TransactionResult>}
   */
  async sendTransaction ({ to, value }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to send transactions.')
    }

    const address = await this.getAddress()
    const transaction = await this._tronWeb.transactionBuilder.sendTrx(to, value, address)
    const fee = await this._getBandwidthCost(transaction)
    const signedTransaction = await this._buildSignedTransaction(transaction)
    const broadcastResult = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    if (!broadcastResult.result) {
      throw new Error(`Transaction broadcast failed: ${broadcastResult.code} - ${broadcastResult.message}`)
    }

    return { hash: signedTransaction.txID, fee: BigInt(fee) }
  }

  /**
   * Transfers a TRC-20 token.
   *
   * @param {TransferOptions} options
   * @returns {Promise<TransferResult>}
   */
  async transfer ({ token, recipient, amount }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to transfer tokens.')
    }

    const { fee } = await this.quoteTransfer({ token, recipient, amount })

    if (this._config.transferMaxFee !== undefined && fee >= this._config.transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operations.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)

    const options = { feeLimit: Number(fee), callValue: 0 }
    const parameters = [
      { type: 'address', value: this._tronWeb.address.toHex(recipient) },
      { type: 'uint256', value: amount }
    ]

    const { transaction } = await this._tronWeb.transactionBuilder
      .triggerSmartContract(token, 'transfer(address,uint256)', options, parameters, addressHex)

    const signedTransaction = await this._buildSignedTransaction(transaction)
    const broadcastResult = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    if (!broadcastResult.result) {
      throw new Error(`Transaction broadcast failed: ${broadcastResult.code} - ${broadcastResult.message}`)
    }

    return { hash: signedTransaction.txID, fee }
  }

  /**
   * Returns a read-only copy of this account.
   * @returns {Promise<WalletAccountReadOnlyTron>}
   */
  async toReadOnlyAccount () {
    const address = await this.getAddress()
    return new WalletAccountReadOnlyTron(address, this._config)
  }

  /**
   * Disposes the account and clears private key from memory.
   */
  dispose () {
    this._signer.dispose()
    this._isActive = false
  }

  /** @private */
  async _buildSignedTransaction (transaction) {
    const signature = await this._signer.signTransaction(transaction.txID)
    return { ...transaction, signature: [signature] }
  }
}
