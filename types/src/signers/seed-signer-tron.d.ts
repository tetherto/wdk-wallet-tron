/** @typedef {import('./signer-tron.js').ISignerTron} ISignerTron */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('tronweb').Types.Transaction} Transaction */
/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */
/**
 * Absolute BIP-44 prefix for Tron (m/purpose'/coin_type').
 *
 * @internal
 */
export const BIP_44_TRON_DERIVATION_PATH_PREFIX: "m/44'/195'";
/**
 * Signer implementation that derives keys from a BIP-39 seed using a BIP-32 path.
 *
 * Every signer holds exactly one HD node (the Tron BIP-44 coin node "m/44'/195'" by default, ready to
 * derive accounts below it) and owns an independent copy of its key, so disposing one never affects
 * its parent, children or siblings. Intermediate nodes built while deriving (including the master
 * node) are erased as soon as they are no longer needed.
 *
 * @implements {ISignerTron}
 */
export default class SeedSignerTron implements ISignerTron {
    /**
     * Creates a new seed signer.
     *
     * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {string} [path] - An absolute BIP-32 path (default: "m/44'/195'").
     * @throws {ValueError} If the seed phrase is invalid, if the seed is not 16 to 64 bytes, or if the path is not valid.
     */
    constructor(seed: string | Uint8Array, path?: string);
    /**
     * Binds the signer to an HD node.
     *
     * @private
     * @param {HDKey} node - The HD node at the signer's path.
     * @param {string} path - The signer's absolute path.
     */
    private _init;
    /** @private */
    private _node;
    /** @private */
    private _path;
    /** @private */
    private _address;
    /** @private */
    private _disposed;
    /**
     * Whether this signer can derive child signers. Always true: every seed signer holds an
     * HD node and can derive below its own path.
     *
     * @type {true}
     */
    get isDerivable(): true;
    /**
     * The signer's absolute derivation path.
     *
     * @type {string}
     */
    get path(): string;
    /**
     * True if the signer has been disposed.
     *
     * @type {boolean}
     */
    get disposed(): boolean;
    /**
     * The account's key pair. The private key is null once the signer has been disposed.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Derives a child signer relative to this signer's own path (e.g. calling derive("0'/0/1") on
     * a signer at "m/44'/195'" yields a child at "m/44'/195'/0'/0/1"). The child owns an independent
     * copy of its key and can itself derive further.
     *
     * @param {string} relPath - The path to derive, relative to this signer's own path.
     * @returns {Promise<SeedSignerTron>} The derived child signer.
     * @throws {ValueError} If the path is not valid.
     * @throws {DisposalError} If the signer has been disposed.
     */
    derive(relPath: string): Promise<SeedSignerTron>;
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
     * @throws {DisposalError} If the signer has been disposed.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a transaction, keeping any signatures it already carries.
     *
     * @param {Transaction | SignedTransaction} transaction - The tron web transaction.
     * @returns {Promise<SignedTransaction>} The transaction with this signer's signature appended.
     * @throws {DisposalError} If the signer has been disposed.
     */
    signTransaction(transaction: Transaction | SignedTransaction): Promise<SignedTransaction>;
    /**
     * Disposes the signer, securely erasing its private key and chain code from memory.
     */
    dispose(): void;
}
export type ISignerTron = import("./signer-tron.js").ISignerTron;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type Transaction = import("tronweb").Types.Transaction;
export type SignedTransaction = import("tronweb").Types.SignedTransaction;
