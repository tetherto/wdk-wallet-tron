/** @implements {IWalletAccount} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron implements IWalletAccount {
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
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Sends a transaction.
     *
     * @param {TronTransaction} tx - The transaction.
     * @returns {Promise<TransactionResult>} The transaction's result.
     */
    sendTransaction(tx: TronTransaction): Promise<TransactionResult>;
    /**
     * Transfers a token to another address.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
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
import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js';
import { HDKey } from '@scure/bip32';
