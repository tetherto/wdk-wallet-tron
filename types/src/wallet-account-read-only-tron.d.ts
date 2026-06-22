export default class WalletAccountReadOnlyTron extends WalletAccountReadOnly {
    /**
     * Creates a new tron read-only wallet account.
     *
     * @param {string} address - The account's address.
     * @param {Omit<TronWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} [config] - The configuration object.
     */
    constructor(address: string, config?: Omit<TronWalletConfig, "transferMaxFee" | "transactionMaxFee">);
    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<TronWalletConfig, "transferMaxFee" | "transactionMaxFee">}
     */
    protected _config: Omit<TronWalletConfig, "transferMaxFee" | "transactionMaxFee">;
    /**
     * The tron web client.
     *
     * @protected
     * @type {TronWeb | undefined}
     */
    protected _tronWeb: TronWeb | undefined;
    /**
     * Returns whether a transaction is a builder call.
     *
     * @protected
     * @param {TronTransaction} tx - The transaction.
     * @returns {boolean} True if the transaction is a builder call.
     */
    protected static _isBuilderCall(tx: TronTransaction): boolean;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify (hex-encoded).
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
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
     * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
     */
    quoteSendTransaction(tx: TronTransaction): Promise<Omit<TransactionResult, "hash"> & TronActivationFee>;
    /**
     * Builds an unsigned tron web transaction from a native tronix transfer
     * (`{ to, value }`) or a transaction builder call (`{ method, args }`).
     *
     * @protected
     * @param {TronTransaction} tx - The transaction.
     * @returns {Promise<Transaction>} The unsigned tron web transaction.
     */
    protected _buildTransaction(tx: TronTransaction): Promise<Transaction>;
    /**
     * Quotes the fee of an already-built tron web transaction. The fee is derived from
     * the transaction's contract type, so this works for every kind of transaction:
     * - bandwidth: applies to every transaction (derived from its serialized size);
     * - energy: only smart contract execution (`TriggerSmartContract`) consumes it;
     * - activation: only native value transfers to a not-yet-activated recipient.
     *
     * @protected
     * @param {Transaction} transaction - The unsigned tron web transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
     */
    protected _quoteTransaction(transaction: Transaction): Promise<Omit<TransactionResult, "hash"> & TronActivationFee>;
    /**
     * Returns whether a transaction is a native value transfer to a not-yet-activated
     * recipient account (which incurs the account activation fee).
     *
     * @protected
     * @param {string} [type] - The transaction's contract type.
     * @param {{ to_address?: string }} value - The transaction's contract parameter value.
     * @returns {Promise<boolean>} True if the transfer activates a new account.
     */
    protected _isActivatingTransfer(type?: string, value?: {
        to_address?: string;
    }): Promise<boolean>;
    /**
     * Estimates the energy cost of a smart contract call by re-simulating it from the
     * built transaction's raw call data.
     *
     * @protected
     * @param {{ contract_address: string, data: string, owner_address: string, call_value?: number }} value - The `TriggerSmartContract` parameter value.
     * @returns {Promise<bigint>} The energy cost in SUN.
     */
    protected _estimateEnergyCost(value: {
        contract_address: string;
        data: string;
        owner_address: string;
        call_value?: number;
    }): Promise<bigint>;
    /**
     * Computes the energy fee (in SUN) needed beyond the account's available staked energy.
     *
     * @protected
     * @param {number} energyUsed - The energy consumed by the call.
     * @param {AccountResourceMessage} resources - The sender's resource snapshot.
     * @param {number} energyPrice - The energy price (in SUN).
     * @returns {bigint} The energy cost in SUN.
     */
    protected _netEnergyCost(energyUsed: number, resources: AccountResourceMessage, energyPrice: number): bigint;
    /**
     * Quotes the costs of TRC-20 transfer operation.
     * TRC-20 transfers do not incur an account activation fee.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, "hash">>;
    /**
     * Estimates the energy and bandwidth fee of a smart contract call from a
     * constant contract simulation result.
     *
     * @protected
     * @param {Object} simulation - The result of a `triggerConstantContract` call.
     * @param {Transaction} simulation.transaction - The simulated transaction.
     * @param {number} [simulation.energy_used] - The estimated energy consumption.
     * @returns {Promise<bigint>} The estimated fee in SUN.
     */
    protected _estimateContractFee({ transaction, energy_used: energyUsed }: {
        transaction: Transaction;
        energy_used?: number;
    }): Promise<bigint>;
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
     * @param {Transaction} transaction - The tron web's transaction.
     * @param {TronBandwidthCostOptions} [options] - Bandwidth calculation options.
     * @returns {Promise<bigint>} The bandwidth cost in SUN.
     */
    protected _getBandwidthCost(transaction: Transaction, options?: TronBandwidthCostOptions): Promise<bigint>;
    /**
     * Initializes the tron web provider with optional failover support.
     *
     * @param {Omit<TronWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The read-only wallet account configuration.
     * @returns {TronWeb | undefined} The initialized tron web provider.
     */
    static initializeProvider(config: Omit<TronWalletConfig, "transferMaxFee" | "transactionMaxFee">): TronWeb | undefined;
}
export type Transaction = import("tronweb").Types.Transaction;
export type TronTransactionReceipt = import("tronweb").Types.TransactionInfo;
export type AccountResourceMessage = import("tronweb").Types.AccountResourceMessage;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type TronTrxTransfer = {
    /**
     * - The transaction's recipient.
     */
    to: string;
    /**
     * - The amount of tronixs to send to the recipient (in suns).
     */
    value: number | bigint;
};
/**
 * A `tronWeb.transactionBuilder` call, used for smart contract calls and system
 * contracts (e.g. staking, voting).
 *
 * The available `method` names and the positional `args` each one expects are listed in the
 * tron web transaction builder API reference:
 * {@link https://tronweb.network/docu/docs/API%20List/transactionBuilder/}.
 */
export type TronBuilderCall = {
    /**
     * - The `tronWeb.transactionBuilder` method to invoke (e.g. 'triggerSmartContract', 'freezeBalanceV2').
     */
    method: string;
    /**
     * - The positional arguments for the method (default: []).
     */
    args?: Array<unknown>;
};
export type TronTransaction = TronTrxTransfer | TronBuilderCall;
export type TronWalletConfig = {
    /**
     * - The url of the tron web provider, or an instance of the {@link TronWeb} class. It's also possible to provide a list of urls or {@link TronWeb} instances instead. In such case, connection errors will cause the wallet to automatically fallback on the next provider in the list. When passing {@link TronWeb} instances, the first one becomes the wallet's primary client; the others contribute only their `fullNode` / `solidityNode` / `eventServer` to the failover pool.
     */
    provider?: string | TronWeb | Array<string | TronWeb>;
    /**
     * - If set and if 'provider' is a list of urls or {@link TronWeb} instances, the number of additional retry attempts after the initial call fails. Total attempts = `1 + retries`. For example, `retries: 3` with 4 providers will try each provider once before throwing. If `retries` exceeds the number of providers, the failover will loop back and retry already-failed providers in round-robin order. Default: 3.
     */
    retries?: number;
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
    /**
     * - The maximum fee amount for sendTransaction and signTransaction operations.
     */
    transactionMaxFee?: number | bigint;
};
export type TronActivationFee = {
    /**
     * - The portion of the fee used for account activation.
     */
    activationFee: bigint;
};
export type TronBandwidthCostOptions = {
    /**
     * - Whether the transaction activates a new recipient account.
     */
    isActivation?: boolean;
    /**
     * - Resource snapshot returned by `getAccountResources` for the sender.
     */
    resources?: AccountResourceMessage;
};
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { TronWeb } from 'tronweb';
