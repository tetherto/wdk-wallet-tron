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
import { secp256k1 } from '@noble/curves/secp256k1'
import { HDKey } from '@scure/bip32'
import * as bip39 from 'bip39'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */

const BIP_44_TRON_DERIVATION_PATH_PREFIX = "m/44'/195'"

function getTronAddress (publicKey) {
  const uncompressedPublicKey = secp256k1.Point.fromHex(publicKey)
    .toRawBytes(false)
    .slice(1)

  const publicKeyHash = keccak_256(uncompressedPublicKey)
  const addressBytes = publicKeyHash.slice(12)
  const addressHex = '41' + Buffer.from(addressBytes).toString('hex')

  const address = TronWeb.address.fromHex(addressHex)

  return address
}

/** @implements {IWalletAccount} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron {
  /**
   * Creates a new tron wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config = { }) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    path = BIP_44_TRON_DERIVATION_PATH_PREFIX + '/' + path

    const account = HDKey.fromMasterSeed(seed).derive(path)

    const address = getTronAddress(account.publicKey)

    super(address, config)

    /**
     * The tron wallet account configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    this._config = config

    /** @private */
    this._path = path

    /**
     * The account's hd key.
     *
     * @protected
     * @type {HDKey}
     */
    this._account = account
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
    const messageBytes = Buffer.from(message, 'utf8')
    const signatureBytes = Buffer.from(signature, 'hex')

    const messageHash = keccak_256(messageBytes)

    const isValid = this._account.verify(messageHash, signatureBytes)

    return isValid
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
    const fee = await this._getBandwidthCost(transaction)
    const signedTransaction = await this._signTransaction(transaction)

    const { txid } = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    return { hash: txid, fee: BigInt(fee) }
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

    if (this._config.transferMaxFee !== undefined && fee >= this._config.transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operations.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)

    const options = {
      feeLimit: Number(fee),
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
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyTron>} The read-only account.
   */
  async toReadOnlyAccount () {
    const address = await this.getAddress()

    const readOnlyAccount = new WalletAccountReadOnlyTron(address, this._config)

    return readOnlyAccount
  }

  /**
   * Disposes the wallet account, erasing the private key from the memory.
   */
  dispose () {
    sodium_memzero(this._account.privKeyBytes)

    this._account.privKeyBytes = undefined

    this._account.privKey = undefined
  }

  /** @private */
  async _signTransaction (transaction) {
    const transactionBytes = Buffer.from(transaction.txID, 'hex')

    const signature = secp256k1.sign(transactionBytes, this._account.privateKey, { lowS: true })

    const r = signature.r.toString(16).padStart(64, '0')
    const s = signature.s.toString(16).padStart(64, '0')
    const v = signature.recovery.toString(16).padStart(2, '0')

    const serializedSignature = r + s + v

    return {
      ...transaction,
      signature: [serializedSignature]
    }
  }
}
