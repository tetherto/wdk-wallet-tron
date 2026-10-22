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

/** @typedef {import('tronweb').TransactionInfo} TronTransactionReceipt */
/** @typedef {import('./src/wallet-account-read-only-tron.js').TronTransactionDetails} TronTransactionDetails */

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet').Finality} Finality */
/** @typedef {import('@tetherto/wdk-wallet').TransactionReceipt} TransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet').WaitForTransactionTarget} WaitForTransactionTarget */
/** @typedef {import('@tetherto/wdk-wallet').WaitForTransactionOptions} WaitForTransactionOptions */

/** @typedef {import('./src/wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./src/wallet-account-read-only-tron.js').TronTrxTransfer} TronTrxTransfer */
/** @typedef {import('./src/wallet-account-read-only-tron.js').TronSmartContractCall} TronSmartContractCall */
/** @typedef {import('./src/wallet-account-read-only-tron.js').Transaction} Transaction */
/** @typedef {import('./src/wallet-account-read-only-tron.js').ContractFunctionParameter} ContractFunctionParameter */
/** @typedef {import('./src/wallet-account-read-only-tron.js').TriggerSmartContractOptions} TriggerSmartContractOptions */
/** @typedef {import('./src/wallet-account-read-only-tron.js').EstimateEnergyCostValue} EstimateEnergyCostValue */
/** @typedef {import('./src/wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */
/** @typedef {import('./src/wallet-account-read-only-tron.js').TronActivationFee} TronActivationFee */
/** @typedef {import('./src/wallet-account-tron.js').TronSignedTransaction} TronSignedTransaction */
/** @typedef {import('./src/wallet-account-tron.js').SignerOptions} SignerOptions */

export { default } from './src/wallet-manager-tron.js'

export { default as WalletAccountReadOnlyTron } from './src/wallet-account-read-only-tron.js'

export { default as WalletAccountTron } from './src/wallet-account-tron.js'

export {
  DisposalError,
  InvalidSignerError,
  NoSuchElementError,
  UnsupportedOperationError,
  ValueError
} from '@tetherto/wdk-wallet'

export { ISigner } from '@tetherto/wdk-wallet'
