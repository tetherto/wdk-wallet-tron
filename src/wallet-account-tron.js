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
import { IWalletAccount } from '@wdk/wallet'
import { keccak_256 as keccak256 } from '@noble/hashes/sha3'
import { CustomSigningKey } from './signer/custom-signing-key.js'
import { derivePrivateKeyBuffer } from './signer/utils.js'

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
 * @property {string} [rpcUrl] - The rpc url of the provider.
 */

const BIP_44_TRON_DERIVATION_PATH_PREFIX = "m/44'/195'"

/** @implements {IWalletAccount} */
export default class WalletAccountTron extends IWalletAccount {
  _signingKey
  _path
  _tronWeb
  _privateKeyBuffer
  _hmacOutputBuffer
  _derivationDataBuffer
  _config

  /**
   * Creates a new tron wallet account.
   *
   * @param {string | Uint8Array} seed - The bip-39 mnemonic.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config = {}) {
    super(seed)
    this._config = config
    const { rpcUrl } = this._config

    this._tronWeb = new TronWeb({
      fullHost: rpcUrl || 'https://api.trongrid.io'
    })

    const fullPath = `${BIP_44_TRON_DERIVATION_PATH_PREFIX}/${path}`
    this._path = fullPath

    // Generate buffers for HD wallet derivation
    this._privateKeyBuffer = new Uint8Array(32)
    this._hmacOutputBuffer = new Uint8Array(64)
    this._derivationDataBuffer = new Uint8Array(37)

    derivePrivateKeyBuffer(
      seed,
      this._privateKeyBuffer,
      this._hmacOutputBuffer,
      this._derivationDataBuffer,
      fullPath
    )

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
   * The account's address.
   *
   * @type {string}
   */
  get address () {
    const pubKey = this._signingKey.publicKey
    // Remove the prefix byte (0x04) from uncompressed public key
    const pubKeyNoPrefix = pubKey.slice(1)
    // Compute keccak-256 hash
    const hash = keccak256(pubKeyNoPrefix)
    // Take last 20 bytes
    const tronAddress = hash.slice(12)
    // Convert to hex with Tron prefix (41)
    const tronAddressHex = '41' + Buffer.from(tronAddress).toString('hex')
    // Convert to base58
    return this._tronWeb.address.fromHex(tronAddressHex)
  }

  /**
   * Checks if the wallet is connected to a provider.
   * @private
   */
  _checkProviderConnection () {
    if (!this._tronWeb.fullNode.host) {
      throw new Error(
        'The wallet must be connected to a provider to perform this operation'
      )
    }
  }

  /**
   * Calculates transaction cost based on bandwidth consumption.
   * @private
   * @param {string} rawDataHex - The raw transaction data in hex format
   * @returns {Promise<number>} The transaction cost in sun (1 TRX = 1,000,000 sun)
   */
  async _calculateTransactionCost (rawDataHex) {
    const from = await this.getAddress()
    const resources = await this._tronWeb.trx.getAccountResources(from)
    const txSizeBytes = rawDataHex.length / 2
    const freeBandwidth = Number(resources.freeNetRemaining) || 0
    const bandwidthConsumption = txSizeBytes * 2
    const missingBandwidth = Math.max(bandwidthConsumption - freeBandwidth, 0)
    return missingBandwidth * 1_000 // 1 TRX per 1000 bandwidth units
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The account's address.
   */
  async getAddress () {
    return this.address
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

    // Create TIP-191 prefix
    const prefix = new TextEncoder().encode(
      '\x19TRON Signed Message:\n' + messageBytes.length
    )
    const prefixedMessage = new Uint8Array(prefix.length + messageBytes.length)
    prefixedMessage.set(prefix)
    prefixedMessage.set(messageBytes, prefix.length)

    // Hash the prefixed message
    const messageHash = keccak256(prefixedMessage)

    const signature = this._signingKey.sign(messageHash)

    return signature
  }

  /**
   * Signs a typed data message.
   *
   * @param {string} Permit712MessageDomain - The domain of the message.
   * @param {string} Permit712MessageTypes - The types of the message.
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async signTypedData (Permit712MessageDomain, Permit712MessageTypes, message) {
    const messageDigest = this._tronWeb.utils._TypedDataEncoder.hash(
      Permit712MessageDomain,
      Permit712MessageTypes,
      message
    )
    return this._signingKey.sign(messageDigest.slice(2))
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
   * Sends a transaction.
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The send transaction's result.
   */
  async sendTransaction (tx) {
    this._checkProviderConnection()

    try {
      const { to, value } = tx
      const from = await this.getAddress()

      // Create the transaction
      const transaction = await this._tronWeb.transactionBuilder.sendTrx(
        to,
        value,
        from
      )

      // Calculate fee before sending
      const fee = await this._calculateTransactionCost(
        transaction.raw_data_hex
      )

      // Sign using our custom wallet's signTransaction method
      const signedTransaction = await this._signTransaction(transaction)

      // Broadcast the transaction
      const result = await this._tronWeb.trx.sendRawTransaction(
        signedTransaction
      )

      if (!result || !result.result) {
        throw new Error(
          result
            ? result.code || JSON.stringify(result)
            : 'Empty response from network'
        )
      }

      return { hash: result.txid, fee }
    } catch (error) {
      throw new Error(
        `Failed to send transaction: ${error.message || JSON.stringify(error)}`
      )
    }
  }

  /**
   * Quotes a transaction.
   *
   * @param {TronTransaction} tx - The transaction to quote.
   * @returns {Promise<Omit<TransactionResult, "hash">>} The transaction's quotes.
   */
  async quoteSendTransaction (tx) {
    this._checkProviderConnection()

    const { to, value } = tx
    const from = await this.getAddress()

    const transaction = await this._tronWeb.transactionBuilder.sendTrx(
      to,
      value,
      from
    )

    const fee = await this._calculateTransactionCost(transaction.raw_data_hex)
    return { hash: null, fee }
  }

  /**
   * Transfers a token to another address.
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer (options) {
    this._checkProviderConnection()

    const { recipient, token, amount } = options
    const from = await this.getAddress()
    const hexFrom = this._tronWeb.address.toHex(from)
    const hexRecipient = this._tronWeb.address.toHex(recipient)

    // Estimate fee before sending
    const { fee } = await this.quoteTransfer(options)

    // Build the unsigned transaction
    const parameter = [
      { type: 'address', value: hexRecipient },
      { type: 'uint256', value: amount }
    ]
    const txResult =
      await this._tronWeb.transactionBuilder.triggerSmartContract(
        token,
        'transfer(address,uint256)',
        { feeLimit: 1000000000, callValue: 0 },
        parameter,
        hexFrom
      )
    const unsignedTx = txResult.transaction

    // Sign the transaction
    const signature = await this._signingKey.sign(unsignedTx.txID)
    unsignedTx.signature = [signature]

    // Broadcast the transaction
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
   * Quotes the costs of a transfer operation.
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, "hash">>} The transfer's quotes.
   */
  async quoteTransfer (options) {
    this._checkProviderConnection()

    const { recipient, token, amount } = options
    const from = await this.getAddress()
    const parameter = [
      { type: 'address', value: recipient },
      { type: 'uint256', value: amount }
    ]

    const transaction =
      await this._tronWeb.transactionBuilder.triggerSmartContract(
        token,
        'transfer(address,uint256)',
        { feeLimit: 1000000000, callValue: 0 },
        parameter,
        from
      )

    const fee = await this._calculateTransactionCost(
      transaction.transaction.raw_data_hex
    )

    return { hash: null, fee }
  }

  /**
   * Returns the account's native token balance.
   *
   * @returns {Promise<number>} The native token balance.
   */
  async getBalance () {
    this._checkProviderConnection()

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
    this._checkProviderConnection()

    try {
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

      if (result && result.constant_result && result.constant_result[0]) {
        const balance = this._tronWeb.toBigNumber(
          '0x' + result.constant_result[0]
        )
        return Number(balance.toString())
      }

      throw new Error('Invalid response format from contract')
    } catch (error) {
      throw new Error(`Failed to get token balance: ${error.message}`)
    }
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
}
