/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('./wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */
/** @implements {IWalletAccount} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron implements IWalletAccount {
    /**
     * Legacy factory — creates an account from a BIP-39 seed and a relative derivation path.
     *
     * @param {string|Uint8Array} seed
     * @param {string} path - Relative path, e.g. "0'/0/0"
     * @param {TronWalletConfig} [config]
     * @returns {WalletAccountTron}
     */
    static fromSeed(seed: string | Uint8Array, path: string, config?: TronWalletConfig): WalletAccountTron;
    /**
     * Creates a new TRON wallet account using a child signer.
     *
     * @param {import('./signers/interface.js').ISignerTron} signer - A child signer (not root).
     * @param {TronWalletConfig} [config]
     */
    constructor(signer: any, config?: TronWalletConfig);
    /** @protected */
    protected _config: import("./wallet-account-read-only-tron.js").TronWalletConfig;
    /** @private */
    private _signer;
    _isActive: boolean;
    get isActive(): boolean;
    /**
     * The derivation path index of this account.
     * @type {number}
     */
    get index(): number;
    /**
     * The full BIP-44 derivation path.
     * @type {string}
     */
    get path(): string;
    /**
     * The account's key pair.
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Signs a message using the TRON personal sign format.
     *
     * @param {string} message
     * @returns {Promise<string>} 0x-prefixed hex signature
     */
    sign(message: string): Promise<string>;
    /**
     * Sends a TRX transaction.
     *
     * @param {TronTransaction} tx
     * @returns {Promise<TransactionResult>}
     */
    sendTransaction({ to, value }: TronTransaction): Promise<TransactionResult>;
    /**
     * Transfers a TRC-20 token.
     *
     * @param {TransferOptions} options
     * @returns {Promise<TransferResult>}
     */
    transfer({ token, recipient, amount }: TransferOptions): Promise<TransferResult>;
    /**
     * Returns a read-only copy of this account.
     * @returns {Promise<WalletAccountReadOnlyTron>}
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyTron>;
    /**
     * Disposes the account and clears private key from memory.
     */
    dispose(): void;
    /** @private */
    private _buildSignedTransaction;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type TronTransaction = import("./wallet-account-read-only-tron.js").TronTransaction;
export type TronWalletConfig = import("./wallet-account-read-only-tron.js").TronWalletConfig;
import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js';
