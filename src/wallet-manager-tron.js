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

import WalletManager from '@tetherto/wdk-wallet'
import { TronWeb } from 'tronweb'
import WalletAccountTron from './wallet-account-tron.js'

/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

export default class WalletManagerTron extends WalletManager {
  /** @protected @type {bigint} */
  static _FEE_RATE_NORMAL_MULTIPLIER = 110n

  /** @protected @type {bigint} */
  static _FEE_RATE_FAST_MULTIPLIER = 200n

  /**
   * Creates a new TRON wallet manager.
   *
   * @param {import('./signers/interface.js').ISignerTron} signer - Root signer.
   * @param {TronWalletConfig} [config]
   */
  constructor (signer, config = {}) {
    super(signer, config)

    /** @protected @type {TronWalletConfig} */
    this._config = config

    const { provider } = config

    if (provider) {
      /** @protected @type {import('tronweb').TronWeb|undefined} */
      this._tronWeb = typeof provider === 'string'
        ? new TronWeb({ fullHost: provider })
        : provider
    }
  }

  /**
   * Returns the wallet account at a specific index.
   *
   * @example
   * // Returns the account at m/44'/195'/0'/0/1
   * const account = await wallet.getAccount(1)
   *
   * @param {number} [index=0]
   * @param {string} [signerName='default']
   * @returns {Promise<WalletAccountTron>}
   */
  async getAccount (index = 0, signerName = 'default') {
    return this.getAccountByPath(`0'/0/${index}`, signerName)
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account at m/44'/195'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1")
   *
   * @param {string} path - Relative path, e.g. "0'/0/0"
   * @param {string} [signerName='default']
   * @returns {Promise<WalletAccountTron>}
   */
  async getAccountByPath (path, signerName = 'default') {
    const key = `${signerName}:${path}`

    if (this._accounts.get(key)) {
      return this._accounts.get(key)
    }

    const signer = this._signers.get(signerName)
    if (!signer) {
      throw new Error(`Signer ${signerName} not found.`)
    }

    const child = signer.derive(path)
    const account = new WalletAccountTron(child, this._config)

    this._accounts.set(key, account)
    return account
  }

  /**
   * Returns the current fee rates in suns.
   *
   * @returns {Promise<FeeRates>}
   */
  async getFeeRates () {
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to get fee rates.')
    }

    const chainParameters = await this._tronWeb.trx.getChainParameters()
    const getTransactionFee = chainParameters.find(({ key }) => key === 'getTransactionFee')
    const fee = BigInt(getTransactionFee.value)

    return {
      normal: fee * WalletManagerTron._FEE_RATE_NORMAL_MULTIPLIER / 100n,
      fast: fee * WalletManagerTron._FEE_RATE_FAST_MULTIPLIER / 100n
    }
  }
}
