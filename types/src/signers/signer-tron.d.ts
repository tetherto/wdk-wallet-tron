/** @typedef {import('@tetherto/wdk-wallet').DisposalError} DisposalError */
/** @typedef {import('@tetherto/wdk-wallet').UnsupportedOperationError} UnsupportedOperationError */
/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */
/** @typedef {import('tronweb/utils').TypedDataDomain} TypedDataDomain */
/** @typedef {import('tronweb/utils').TypedDataField} TypedDataField */
/**
 * Interface for Tron signers.
 *
 * @interface
 */
export interface ISignerTron extends ISigner {
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
     * Signs a transaction.
     *
     * @param {Transaction} unsignedTx - The unsigned tron web transaction.
     * @returns {Promise<SignedTransaction>} The signed transaction.
     * @throws {ValueError} If the transaction id is not a 32-byte hex string.
     * @throws {DisposalError} If the signer has been disposed.
     */
    signTransaction(unsignedTx: Transaction): Promise<SignedTransaction>;
    /**
     * Signs typed data according to TIP-712.
     *
     * @param {TypedData} typedData - The typed data to sign.
     * @returns {Promise<string>} The signature, as a 0x-prefixed 65-byte hex string (r ‖ s ‖ v, with v in {27, 28}).
     * @throws {DisposalError} If the signer has been disposed.
     */
    signTypedData(typedData: TypedData): Promise<string>;
}
export type DisposalError = import("@tetherto/wdk-wallet").DisposalError;
export type UnsupportedOperationError = import("@tetherto/wdk-wallet").UnsupportedOperationError;
export type Transaction = import("tronweb").Types.Transaction;
export type SignedTransaction = import("tronweb").Types.SignedTransaction;
export type TypedDataDomain = import("tronweb/utils").TypedDataDomain;
export type TypedDataField = import("tronweb/utils").TypedDataField;
export type TypedData = {
    /**
     * - The domain separator. Its verifying contract, if any, is a base58 tron address.
     */
    domain: TypedDataDomain;
    /**
     * - The type definitions.
     */
    types: Record<string, TypedDataField[]>;
    /**
     * - The message data. Its address fields are base58 tron addresses.
     */
    message: Record<string, unknown>;
};
import { ISigner } from '@tetherto/wdk-wallet';
