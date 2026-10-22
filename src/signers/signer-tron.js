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

import { ISigner, NotImplementedError } from '@tetherto/wdk-wallet'

/** @typedef {import('@tetherto/wdk-wallet').DisposalError} DisposalError */
/** @typedef {import('@tetherto/wdk-wallet').UnsupportedOperationError} UnsupportedOperationError */
/** @typedef {import('@tetherto/wdk-wallet').ValueError} ValueError */

/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */

/**
 * Interface for Tron signers, extending the base `ISigner` from `@tetherto/wdk-wallet`.
 *
 * @interface
 */
export class ISignerTron extends ISigner {
  /**
   * Derive a child signer using a relative path (e.g., "0'/0/0").
   *
   * @param {string} path - The relative derivation path.
   * @returns {Promise<ISignerTron>} The derived signer.
   * @throws {UnsupportedOperationError} If the signer does not support account derivation.
   * @throws {ValueError} If the path is not valid.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async derive (path) {
    throw new NotImplementedError('derive(path)')
  }

  /**
   * Signs a transaction, keeping any signatures it already carries.
   *
   * @param {Transaction | SignedTransaction} transaction - The tron web transaction.
   * @returns {Promise<SignedTransaction>} The transaction with this signer's signature appended.
   * @throws {DisposalError} If the signer has been disposed.
   */
  async signTransaction (transaction) {
    throw new NotImplementedError('signTransaction(transaction)')
  }
}
