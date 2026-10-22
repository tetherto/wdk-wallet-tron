/** @implements {IWalletAccount<TronSignedTransaction>} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron implements IWalletAccount<TronSignedTransaction> {
    /**
     * Creates a new tron wallet account from a raw private key. The account owns the signer it creates
     * and wipes it on {@link dispose}.
     *
     * @param {string | Uint8Array} privateKey - The raw private key (hex string with or without 0x, or 32 bytes).
     * @param {TronWalletConfig} [config] - The configuration object.
     * @returns {WalletAccountTron} The wallet account.
     * @throws {ValueError} If the private key is not valid.
     */
    static fromPrivateKey(privateKey: string | Uint8Array, config?: TronWalletConfig): WalletAccountTron;
    /**
     * Creates a new tron wallet account from a signer.
     *
     * @overload
     * @param {ISignerTron} signer - The tron signer, derived to an account path.
     * @param {TronWalletConfig & SignerOptions} [config] - The configuration object.
     * @throws {ValueError} If a derivation path is given along with the signer.
     */
    constructor(signer: ISignerTron, config?: TronWalletConfig & SignerOptions);
    /**
     * Creates a new tron wallet account from a seed.
     *
     * @overload
     * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {string} path - The BIP-44 derivation path, relative to "m/44'/195'" (e.g. "0'/0/0").
     * @param {TronWalletConfig} [config] - The configuration object.
     * @throws {ValueError} If the seed phrase or the path is not valid.
     */
    constructor(seed: string | Uint8Array, path: string, config?: TronWalletConfig);
    /**
     * Creates the first tron wallet account (m/44'/195'/0'/0/0) from a seed.
     *
     * @overload
     * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {TronWalletConfig} [config] - The configuration object.
     * @throws {ValueError} If the seed phrase is not valid.
     */
    constructor(seed: string | Uint8Array, config?: TronWalletConfig);
    /**
     * The tron wallet account configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    protected _config: TronWalletConfig;
    /**
     * The tron signer.
     *
     * @private
     * @type {ISignerTron}
     */
    private _signer;
    /**
     * If true, disposes the signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    protected _shouldWipeSignerOnDisposal: boolean;
    /** @private */
    private _disposed;
    /**
     * True if the wallet account has been disposed.
     *
     * @type {boolean}
     */
    get disposed(): boolean;
    /**
     * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)),
     * or null for an account backed by a non-HD signer.
     *
     * @type {string | null}
     */
    get path(): string | null;
    /**
     * The account's key pair.
     *
     * The uint8 arrays are the signer's own, so any external change will reflect to the signer's internal representation. For this reason,
     * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
     * content, client code should never do so.
     *
     * Null if the account's signer does not expose key material.
     *
     * @type {KeyPair | null}
     */
    get keyPair(): KeyPair | null;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     * @throws {DisposalError} If the wallet account has been disposed.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a transaction.
     *
     * @param {TronTransaction} tx - The transaction to sign.
     * @returns {Promise<TronSignedTransaction>} The signed transaction.
     * @throws {DisposalError} If the wallet account has been disposed.
     * @throws {Error} If the transaction's cost exceeds the maximum transaction fee option.
     */
    signTransaction(tx: TronTransaction): Promise<TronSignedTransaction>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {TronTransaction | TronSignedTransaction} tx - The transaction, or a signed transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
     */
    quoteSendTransaction(tx: TronTransaction | TronSignedTransaction): Promise<Omit<TransactionResult, "hash"> & TronActivationFee>;
    /**
     * Sends a transaction.
     *
     * @param {TronTransaction | TronSignedTransaction} tx - The transaction, or a signed transaction.
     * @returns {Promise<TransactionResult & TronActivationFee>} The transaction's result.
     * @throws {DisposalError} If the wallet account has been disposed.
     * @throws {Error} If the transaction's cost exceeds the maximum transaction fee option.
     */
    sendTransaction(tx: TronTransaction | TronSignedTransaction): Promise<TransactionResult & TronActivationFee>;
    /** @private */
    private _assertTransactionOwner;
    /** @private */
    private _isConsistentTransaction;
    /**
     * Transfers a TRC-20 token to another address.
     * TRC-20 transfers do not incur an account activation fee.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
     * @throws {DisposalError} If the wallet account has been disposed.
     * @throws {Error} If the transfer's cost exceeds the maximum transfer fee option.
     */
    transfer(options: TransferOptions): Promise<TransferResult>;
    /**
     * Approves a specific amount of a TRC-20 token to a spender.
     *
     * @param {ApproveOptions} options - The approve options.
     * @returns {Promise<TransactionResult & TronActivationFee>} The transaction's result.
     * @throws {DisposalError} If the wallet account has been disposed.
     * @throws {Error} If the transaction's cost exceeds the maximum transaction fee option.
     */
    approve(options: ApproveOptions): Promise<TransactionResult & TronActivationFee>;
    /**
     * Returns a read-only copy of the account.
     *
     * @returns {Promise<WalletAccountReadOnlyTron>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyTron>;
    /**
     * Disposes the wallet account. The signer given at construction, and its private key, is wiped only if the
     * account owns it (see {@link SignerOptions}); a caller-owned signer is left for the caller to dispose.
     */
    dispose(): void;
    /** @private */
    private _signTransaction;
}
export type IWalletAccount<TSignedTransaction> = import("@tetherto/wdk-wallet").IWalletAccount<TSignedTransaction>;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type TronTransaction = import("./wallet-account-read-only-tron.js").TronTransaction;
export type TronWalletConfig = import("./wallet-account-read-only-tron.js").TronWalletConfig;
export type TronActivationFee = import("./wallet-account-read-only-tron.js").TronActivationFee;
export type ISignerTron = import("./signers/signer-tron.js").ISignerTron;
export type TronSignedTransaction = import("tronweb").Types.SignedTransaction;
export type Transaction = import("tronweb").Types.Transaction;
export type ApproveOptions = {
    /**
     * - The address of the token to approve.
     */
    token: string;
    /**
     * - The spender's address.
     */
    spender: string;
    /**
     * - The amount of tokens to approve to the spender.
     */
    amount: number | bigint;
};
export type SignerOptions = {
    /**
     * - If true, wipes the signer given at construction on calls to the 'dispose' method.
     */
    shouldWipeSignerOnDisposal?: boolean;
};
import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js';
