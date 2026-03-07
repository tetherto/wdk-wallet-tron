/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */
/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
export default class WalletManagerTron extends WalletManager {
    /** @protected @type {bigint} */
    protected static _FEE_RATE_NORMAL_MULTIPLIER: bigint;
    /** @protected @type {bigint} */
    protected static _FEE_RATE_FAST_MULTIPLIER: bigint;
    /**
     * Creates a new TRON wallet manager.
     *
     * @param {import('./signers/interface.js').ISignerTron} signer - Root signer.
     * @param {TronWalletConfig} [config]
     */
    constructor(signer: any, config?: TronWalletConfig);
    /** @protected @type {import('tronweb').TronWeb|undefined} */
    protected _tronWeb: import("tronweb").TronWeb | undefined;
    /**
     * Returns the wallet account at a specific index.
     *
     * @example
     * // Returns the account at m/44'/195'/0'/0/1
     * const account = await wallet.getAccount(1)
     *
     * @param {number} [index=0]
     * @param {string} [signerName='default']
     * @returns {Promise<WalletAccountTron>}
     */
    getAccount(index?: number, signerName?: string): Promise<WalletAccountTron>;
    /**
     * Returns the wallet account at a specific BIP-44 derivation path.
     *
     * @example
     * // Returns the account at m/44'/195'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1")
     *
     * @param {string} path - Relative path, e.g. "0'/0/0"
     * @param {string} [signerName='default']
     * @returns {Promise<WalletAccountTron>}
     */
    getAccountByPath(path: string, signerName?: string): Promise<WalletAccountTron>;
}
export type TronWalletConfig = import("./wallet-account-read-only-tron.js").TronWalletConfig;
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountTron from './wallet-account-tron.js';
