/** @typedef {import('./wallet-account-tron.js').TronWalletConfig} TronWalletConfig */
export default class WalletManagerTron {
    /**
     * Creates a new wallet manager for tron blockchains.
     *
     * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase.
     * @param {TronWalletConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, config?: TronWalletConfig);
    /**
     * A map between derivation paths and wallet accounts. It contains all the wallet accounts that have been accessed through the {@link getAccount} and {@link getAccountByPath} methods.
     *
     * @protected
     * @type {{ [path: string]: WalletAccountTron }}
     */
    protected _accounts: {
        [path: string]: WalletAccountTron;
    };
    /**
     * The tron wallet configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    protected _config: TronWalletConfig;
    /** @private */
    private _tronWeb;
    /**
     * Returns the wallet account at a specific index (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
     *
     * @example
     * // Returns the account with derivation path m/44'/195'/0'/0/1
     * const account = await wallet.getAccount(1);
     * @param {number} [index] - The index of the account to get (default: 0).
     * @returns {Promise<WalletAccountTron>} The account.
     */
    getAccount(index?: number): Promise<WalletAccountTron>;
    /**
     * Returns the wallet account at a specific BIP-44 derivation path.
     *
     * @example
     * // Returns the account with derivation path m/44'/195'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @returns {Promise<WalletAccountTron>} The account.
     */
    getAccountByPath(path: string): Promise<WalletAccountTron>;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<{ normal: number, fast: number }>} The fee rates (in sun).
     */
    getFeeRates(): Promise<{
        normal: number;
        fast: number;
    }>;
    /**
     * Disposes all the wallet accounts, and erases their private keys from the memory.
     */
    dispose(): void;
}
export type TronWalletConfig = import("./wallet-account-tron.js").TronWalletConfig;
import WalletAccountTron from './wallet-account-tron.js';
