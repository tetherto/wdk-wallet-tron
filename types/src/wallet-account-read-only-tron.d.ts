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
     * @type {TronWeb | undefined}
     */
    protected _tronWeb: TronWeb | undefined;
    /**
     * Returns the account's tronix balance.
     *
     * @returns {Promise<bigint>} The tronix balance (in suns).
     */
    getBalance(): Promise<bigint>;
    /**
     * Returns the account balance for a specific token.
     *
     * @param {string} tokenAddress - The smart contract address of the token.
     * @returns {Promise<bigint>} The token balance (in base unit).
     */
    getTokenBalance(tokenAddress: string): Promise<bigint>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {TronTransaction} tx - The transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     */
    quoteSendTransaction(tx: TronTransaction): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, "hash">>;
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
export type Transaction<T> = import("tronweb").Transaction<T>;
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
    provider?: string | TronWeb;
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
};
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import TronWeb from 'tronweb'
