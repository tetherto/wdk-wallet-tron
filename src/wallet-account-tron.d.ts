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
    _signingKey: any;
    _path: string;
    _tronWeb: any;
    _privateKeyBuffer: Uint8Array<ArrayBuffer>;
    _hmacOutputBuffer: Uint8Array<ArrayBuffer>;
    _derivationDataBuffer: Uint8Array<ArrayBuffer>;
    _config: TronWalletConfig;
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
     * The account's address.
     *
     * @type {string}
     */
    get address(): string;
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
     * Signs a typed data message.
     *
     * @param {string} Permit712MessageDomain - The domain of the message.
     * @param {string} Permit712MessageTypes - The types of the message.
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    signTypedData(Permit712MessageDomain: string, Permit712MessageTypes: string, message: string): Promise<string>;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Sends a transaction.
     * @param {TronTransaction} tx - The transaction.
     * @returns {Promise<TransactionResult>} The send transaction's result.
     */
    sendTransaction(tx: TronTransaction): Promise<TransactionResult>;
    /**
     * Quotes a transaction.
     *
     * @param {TronTransaction} tx - The transaction to quote.
     * @returns {Promise<Omit<TransactionResult, "hash">>} The transaction's quotes.
     */
    quoteSendTransaction(tx: TronTransaction): Promise<Omit<TransactionResult, "hash">>;
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
    _signTransaction(transaction: any): Promise<any>;
    /**
     * Disposes the wallet account, and erases the private key from the memory.
     */
    dispose(): void;
}
export type IWalletAccount = any;
export type KeyPair = any;
export type TransactionResult = any;
export type TransferOptions = any;
export type TransferResult = any;
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
