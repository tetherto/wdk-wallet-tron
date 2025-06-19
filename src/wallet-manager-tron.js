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
import sodium from 'sodium-universal'
import AbstractWalletManager from '@wdk/wallet'
import WalletAccountTron from './wallet-account-tron.js'

const FEE_RATE_NORMAL_MULTIPLIER = 1.1
const FEE_RATE_FAST_MULTIPLIER = 2.0

/** @typedef {import('./wallet-account-tron.js').TronWalletConfig} TronWalletConfig */

export default class WalletManagerTron extends AbstractWalletManager {
  _tronWeb
  _accounts

  /**
   * Creates a new wallet manager for tron blockchains.
   *
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase.
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor (seed, config = {}) {
    super(seed)
    this._accounts = new Set()

    const { provider } = config

    this._tronWeb = new TronWeb({
      fullHost: provider || 'https://api.trongrid.io'
    })
  }

  /**
   * Returns the wallet account at a specific index (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   *
   * @example
   * // Returns the account with derivation path m/44'/195'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index] - The index of the account to get (default: 0).
   * @returns {Promise<WalletAccountTron>} The account.
   */
  async getAccount (index = 0) {
    const account = await this.getAccountByPath(`0'/0/${index}`)
    this._accounts.add(account)
    return account
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/195'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @returns {Promise<WalletAccountTron>} The account.
   */
  async getAccountByPath (path) {
    const account = new WalletAccountTron(this.seed, path, {
      provider: this._tronWeb.fullNode.host
    })
    this._accounts.add(account)
    return account
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<{ normal: number, fast: number }>} The fee rates (in sun).
   */
  async getFeeRates () {
    if (!this._tronWeb.fullNode.host) {
      throw new Error(
        'The wallet must be connected to a provider to get fee rates'
      )
    }

    const chainParameters = await this._tronWeb.trx.getChainParameters()

    // Get fee parameters
    const getTransactionFee = chainParameters.find(
      (param) => param.key === 'getTransactionFee'
    )

    // Base transaction fee
    const baseFee = Number(getTransactionFee.value)

    // Calculate fee rates using multipliers
    const normal = Math.round(baseFee * FEE_RATE_NORMAL_MULTIPLIER)
    const fast = Math.round(baseFee * FEE_RATE_FAST_MULTIPLIER)

    return {
      normal,
      fast
    }
  }

  /**
   * Disposes all the wallet accounts, and erases their private keys from the memory.
   */
  dispose () {
    for (const account of this._accounts) account.dispose()
    this._accounts.clear()

    sodium.sodium_memzero(this.seed)
    this.seed = null
    this._tronWeb = null
  }
}
