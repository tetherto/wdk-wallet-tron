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
    derive(path: string): Promise<ISignerTron>;
    /**
     * Signs a transaction, keeping any signatures it already carries.
     *
     * @param {Transaction | SignedTransaction} transaction - The tron web transaction.
     * @returns {Promise<SignedTransaction>} The transaction with this signer's signature appended.
     * @throws {DisposalError} If the signer has been disposed.
     */
    signTransaction(transaction: Transaction | SignedTransaction): Promise<SignedTransaction>;
}
export type DisposalError = import("@tetherto/wdk-wallet").DisposalError;
export type UnsupportedOperationError = import("@tetherto/wdk-wallet").UnsupportedOperationError;
export type ValueError = import("@tetherto/wdk-wallet").ValueError;
export type Transaction = import("tronweb").Types.Transaction;
export type SignedTransaction = import("tronweb").Types.SignedTransaction;
import { ISigner } from '@tetherto/wdk-wallet';
