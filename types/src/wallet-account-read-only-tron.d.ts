export default class WalletAccountReadOnlyTron extends WalletAccountReadOnly {
    /**
     * Creates a new tron read-only wallet account.
     *
     * @param {string} address - The account's address.
     * @param {Omit<TronWalletConfig, 'transferMaxFee'>} [config] - The configuration object.
     */
    constructor(address: string, config?: Omit<TronWalletConfig, "transferMaxFee">);
    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<TronWalletConfig, "transferMaxFee">}
     */
    protected _config: Omit<TronWalletConfig, "transferMaxFee">;
    /**
     * The tron web client.
     *
     * @protected
     * @type {import('tronweb').TronWeb | undefined}
     */
    protected _tronWeb: import("tronweb").TronWeb | undefined;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify (hex-encoded).
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Returns a transaction's receipt.
     *
     * @param {string} hash - The transaction's hash.
     * @returns {Promise<TronTransactionReceipt | null>} The receipt, or null if the transaction has not been included in a block yet.
     */
    getTransactionReceipt(hash: string): Promise<TronTransactionReceipt | null>;
    /**
     * Returns the bandwidth cost of a tron web's transaction.
     *
     * @protected
     * @param {Transaction<TriggerSmartContract>} transaction - The tron web's transaction
     * @returns {Promise<number>} The bandwidth cost.
     */
    protected _getBandwidthCost(transaction: Transaction<TriggerSmartContract>): Promise<number>;
}
export type Transaction = import("tronweb").Transaction;
export type TriggerSmartContract = import("tronweb").TriggerSmartContract;
export type TronTransactionReceipt = import("tronweb").TransactionInfo;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type TronTransaction = {
    /**
     * - The transaction's recipient.
     */
    to: string;
    /**
     * - The amount of tronixs to send to the recipient (in suns).
     */
    value: number | bigint;
};
export type TronWalletConfig = {
    /**
     * - The url of the tron web provider, or an instance of the {@link TronWeb} class.
     */
    provider?: string | import("tronweb").TronWeb;
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
};
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
