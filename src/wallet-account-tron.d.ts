/** @implements {IWalletAccount} */
export default class WalletAccountTron implements IWalletAccount {
    /**
     * Creates a new tron wallet account.
     *
     * @param {string | Uint8Array} seed - The bip-39 mnemonic.
     * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
     * @param {TronWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, path: string, config?: TronWalletConfig);
    /**
     * The tron wallet configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    protected _config: TronWalletConfig;
    /**
     * The tron web client.
     *
     * @protected
     * @type {TronWeb}
     */
    protected _tronWeb: TronWeb;
    /** @private */
    private _path;
    /** @private */
    private _privateKeyBuffer;
    /** @private */
    private _hmacOutputBuffer;
    /** @private */
    private _derivationDataBuffer;
    /** @private */
    private _signingKey;
    /**
     * The derivation path's index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
     *
     * @type {string}
     */
    get path(): string;
    /**
     * The account's key pair.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Returns the account's address.
     *
     * @returns {Promise<string>} The account's address.
     */
    getAddress(): Promise<string>;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Returns the account's native token balance.
     *
     * @returns {Promise<number>} The native token balance.
     */
    getBalance(): Promise<number>;
    /**
     * Returns the account balance for a specific token.
     * Uses low-level contract interaction to ensure compatibility with all TRC20 tokens.
     *
     * @param {string} tokenAddress - The smart contract address of the token.
     * @returns {Promise<number>} The token balance.
     * @throws {Error} If the contract interaction fails or returns invalid data.
     */
    getTokenBalance(tokenAddress: string): Promise<number>;
    /**
     * Sends a transaction.
     * @param {TronTransaction} tx - The transaction.
     * @returns {Promise<TransactionResult>} The send transaction's result.
     */
    sendTransaction({ to, value }: TronTransaction): Promise<TransactionResult>;
    /**
     * Quotes a transaction.
     *
     * @param {TronTransaction} tx - The transaction to quote.
     * @returns {Promise<Omit<TransactionResult, "hash">>} The transaction's quotes.
     */
    quoteSendTransaction({ to, value }: TronTransaction): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Transfers a token to another address.
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
     */
    transfer(options: TransferOptions): Promise<TransferResult>;
    /**
     * Quotes the costs of a transfer operation.
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, "hash">>} The transfer's quotes.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, "hash">>;
    /**
     * Disposes the wallet account, and erases the private key from the memory.
     */
    dispose(): void;
    _signTransaction(transaction: any): Promise<any>;
    /**
     * Checks if the wallet is connected to a provider.
     * @private
     */
    private _checkProviderConnection;
    /**
     * Calculates transaction cost based on bandwidth consumption.
     * @private
     * @param {string} rawDataHex - The raw transaction data in hex format
     * @returns {Promise<number>} The transaction cost in sun (1 TRX = 1,000,000 sun)
     */
    private _calculateTransactionCost;
}
export type IWalletAccount = any;
export type KeyPair = import("@wdk/wallet").KeyPair;
export type TransactionResult = import("@wdk/wallet").TransactionResult;
export type TransferOptions = import("@wdk/wallet").TransferOptions;
export type TransferResult = import("@wdk/wallet").TransferResult;
export type TronTransaction = {
    /**
     * - The transaction's recipient.
     */
    to: string;
    /**
     * - The amount of sun to send to the recipient (1 TRX = 1,000,000 sun).
     */
    value: number;
};
export type TronWalletConfig = {
    /**
     * - The rpc url of the provider.
     */
    provider?: string;
};
