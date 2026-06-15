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

import { TronWeb } from 'tronweb'

// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3'
import { secp256k1 } from '@noble/curves/secp256k1'
import { HDKey } from '@scure/bip32'
import * as bip39 from 'bip39'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import {
  getERC20Token,
  createTronWeb,
  normalizeTronPrivateKey,
  currentTronChainId,
  setHinkalTronChainId
} from '@hinkal/common'
import { prepareTronHinkal } from '@hinkal/common/providers/prepareTronHinkal'

import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */
/** @typedef {import('./wallet-account-read-only-tron.js').TronActivationFee} TronActivationFee */

/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */

const BIP_44_TRON_DERIVATION_PATH_PREFIX = "m/44'/195'"
const DEFAULT_FEE_LIMIT_SUN = 15_000_000

function getTronAddress (publicKey) {
  const uncompressedPublicKey = secp256k1.Point.fromHex(publicKey)
    .toBytes(false)
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
   * The uint8 arrays are bound to the wallet account, so any external change will reflect to the internal representation. For this reason,
   * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
   * content, client code should never do so.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._account.privateKey ?? null,
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
    const prefix = Buffer.from(`\x19TRON Signed Message:\n${messageBytes.length}`, 'utf8')
    const messageWithPrefixBytes = Buffer.concat([prefix, messageBytes])
    const hash = keccak_256(messageWithPrefixBytes)

    const signature = secp256k1.sign(hash, this._account.privateKey)
    const signatureWithRecovery = new Uint8Array([...signature.toCompactRawBytes(), 27 + signature.recovery])
    const hex = Buffer.from(signatureWithRecovery).toString('hex')

    return '0x' + hex
  }

  /**
   * Signs a transaction.
   *
   * @param {TronTransaction} tx - The transaction to sign.
   * @returns {Promise<SignedTransaction>} The signed transaction.
   */
  async signTransaction ({ to, value }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to sign transactions.')
    }

    const address = await this.getAddress()

    const transaction = await this._tronWeb.transactionBuilder.sendTrx(to, value, address)

    return await this._signTransaction(transaction)
  }

  /**
   * Sends a transaction.
   *
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult & TronActivationFee>} The transaction's result.
   */
  async sendTransaction ({ to, value }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to send transactions.')
    }

    const address = await this.getAddress()

    const transaction = await this._tronWeb.transactionBuilder.sendTrx(to, value, address)
    const { fee, activationFee } = await this._getSendTrxFee(to, transaction)
    const signedTransaction = await this._signTransaction(transaction)

    const { txid } = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    return { hash: txid, fee, activationFee }
  }

  /**
   * Transfers a TRC-20 token to another address.
   * TRC-20 transfers do not incur an account activation fee.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer ({ token, recipient, amount }) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to transfer tokens.')
    }

    const { fee } = await this.quoteTransfer({ token, recipient, amount })

    if (this._config.transferMaxFee !== undefined && fee >= BigInt(this._config.transferMaxFee)) {
      throw new Error('Exceeded maximum fee cost for transfer operations.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)

    const options = {
      feeLimit: Number(fee) || DEFAULT_FEE_LIMIT_SUN,
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
 * Prepares a Hinkal session funded by this account on the current Tron chain.
 * Builds the signerAdapter bridge between this wallet's HDKey and Hinkal's TronProviderAdapter.
 *
 * @private
 * @returns {Promise<import('@hinkal/common').Hinkal<unknown>>} The initialized Hinkal session.
 */
  async _prepareHinkal () {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web.')
    }
    const privateKey = normalizeTronPrivateKey(Buffer.from(this._account.privateKey).toString('hex'))
    const tronWeb = createTronWeb(currentTronChainId)

    const signerAdapter = {
      on () { return this },
      off () { return this },
      async signTransaction (transaction) {
        return await tronWeb.trx.sign(transaction, privateKey)
      },
      async signMessage (message) {
        return await tronWeb.trx.signMessageV2(message, privateKey)
      }
    }

    return await prepareTronHinkal({ address: await this.getAddress(), signerAdapter })
  }

  /**
 * Validates token support and prepares a Hinkal session for the current Tron chain.
 *
 * @private
 * @param {string} token - The token address to validate.
 * @returns {Promise<{ hinkal: import('@hinkal/common').Hinkal<unknown>, erc20Token: object }>}
 * @throws {Error} If the token is not supported by Hinkal on the current chain.
 */
  async _prepareHinkalForToken (token) {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web.')
    }
    setHinkalTronChainId(currentTronChainId)
    const erc20Token = getERC20Token(token, currentTronChainId)
    if (!erc20Token) {
      throw new Error(`The token ${token} is not supported by Hinkal on chain ${currentTronChainId}.`)
    }
    const hinkal = await this._prepareHinkal()
    return { hinkal, erc20Token }
  }

  /**
 * Sends a TRC-20 token to another address privately through Hinkal.
 *
 * @param {TransferOptions} options - The transfer's options (`amount` in base units).
 * @returns {Promise<{ hash: string }>} The transfer's result.
 * @throws {Error} If the wallet is not connected to tron web.
 * @throws {Error} If the token is not supported by Hinkal on the current chain.
 */
  async privateSend ({ token, recipient, amount }) {
    const { hinkal, erc20Token } = await this._prepareHinkalForToken(token)
    if (!this._tronWeb.isAddress(recipient)) {
      throw new Error('Invalid Tron recipient address.')
    }
    const parsedAmount = BigInt(amount)
    if (parsedAmount <= 0n) {
      throw new Error('Amount must be positive.')
    }
    const hash = await hinkal.depositAndWithdraw(erc20Token, [parsedAmount], [recipient])
    return { hash }
  }

  /**
 * Withdraws this account's stuck Hinkal UTXOs of a token back to its own address.
 *
 * @param {{ token: string }} options - The options (only `token` is used).
 * @returns {Promise<{ hashes: string[] }>} The withdrawal transactions' hashes.
 * @throws {Error} If the wallet is not connected to tron web.
 * @throws {Error} If the token is not supported by Hinkal on the current chain.
 */
  async withdrawStuckUtxos ({ token }) {
    const { hinkal, erc20Token } = await this._prepareHinkalForToken(token)
    const recipient = await this.getAddress()
    const hashes = await hinkal.withdrawStuckUtxos(erc20Token, recipient)
    return { hashes }
  }

  /**
 * Returns this account's stuck Hinkal shielded balances (UTXOs awaiting recovery).
 *
 * @returns {Promise<Array<{ token: string, balance: bigint }>>} The stuck balance per token.
 * @throws {Error} If the wallet is not connected to tron web.
 */
  async stuckUtxoBalances () {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web.')
    }
    setHinkalTronChainId(currentTronChainId)
    const hinkal = await this._prepareHinkal()
    const balances = await hinkal.getStuckShieldedBalances(currentTronChainId)
    return balances.map(({ token, balance }) => ({ token: token.erc20TokenAddress, balance }))
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyTron>} The read-only account.
   */
  async toReadOnlyAccount () {
    if (!this._tronReadOnlyAccount) {
      const address = await this.getAddress()
      this._tronReadOnlyAccount = new WalletAccountReadOnlyTron(address, this._config)
    }

    return this._tronReadOnlyAccount
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
