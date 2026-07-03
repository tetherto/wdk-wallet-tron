/** @implements {IWalletAccount} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron implements IWalletAccount<SignedTransaction> {
    /**
     * Creates a new tron wallet account.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
     * @param {TronWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, path: string, config?: TronWalletConfig);
    /** @private */
    private _path;
    /**
     * The tron wallet account configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    protected _config: TronWalletConfig;
    /**
     * The account's hd key.
     *
     * @protected
     * @type {HDKey}
     */
    protected _account: HDKey;
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
     * The uint8 arrays are bound to the wallet account, so any external change will reflect to the internal representation. For this reason,
     * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
     * content, client code should never do so.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a transaction.
     *
     * @param {TronTransaction} tx - The transaction to sign.
     * @returns {Promise<SignedTransaction>} The signed transaction.
     * @throws {Error} If the transaction's cost exceeds the maximum transaction fee option.
     */
    signTransaction({ to, value }: TronTransaction): Promise<SignedTransaction>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {TronTransaction | SignedTransaction} tx - The transaction, or a signed transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'> & TronActivationFee>} The transaction's quotes.
     */
    quoteSendTransaction(tx: TronTransaction | SignedTransaction): Promise<Omit<TransactionResult, "hash"> & TronActivationFee>;
    /**
     * Sends a transaction.
     *
     * @param {TronTransaction | SignedTransaction} tx - The transaction, or a signed transaction.
     * @returns {Promise<TransactionResult & TronActivationFee>} The transaction's result.
     * @throws {Error} If the transaction's cost exceeds the maximum transaction fee option.
     */
    sendTransaction(tx: TronTransaction | SignedTransaction): Promise<TransactionResult & TronActivationFee>;
    /**
     * Transfers a TRC-20 token to another address.
     * TRC-20 transfers do not incur an account activation fee.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
     * @throws {Error} If the transfer's cost exceeds the maximum transfer fee option.
     */
    transfer(options: TransferOptions): Promise<TransferResult>;
    /**
     * Returns a read-only copy of the account.
     *
     * @returns {Promise<WalletAccountReadOnlyTron>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyTron>;
    /**
     * Disposes the wallet account, erasing the private key from the memory.
     */
    dispose(): void;
    /** @private */
    private _signTransaction;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type TronTransaction = import("./wallet-account-read-only-tron.js").TronTransaction;
export type TronWalletConfig = import("./wallet-account-read-only-tron.js").TronWalletConfig;
export type TronActivationFee = import("./wallet-account-read-only-tron.js").TronActivationFee;
export type SignedTransaction = import("tronweb").Types.SignedTransaction;
import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js';
import { HDKey } from '@scure/bip32';
