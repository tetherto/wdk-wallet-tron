/**
 * Signer backed by a single raw secp256k1 private key (non-HD).
 *
 * Does not support HD derivation. Signs messages and transactions directly with the key.
 *
 * @implements {ISignerTron}
 */
export default class PrivateKeySignerTron implements ISignerTron {
    /**
     * Creates a new private key signer.
     *
     * The supplied key is copied: the signer keeps its own internal copy alive until {@link dispose}
     * zeroes it, and never wipes the supplied key, whose disposal remains the caller's responsibility.
     *
     * @param {string | Uint8Array} privateKey - The private key's hex string (with or without 0x) or bytes (32 bytes).
     * @throws {ValueError} If the key is not a valid secp256k1 private key.
     */
    constructor(privateKey: string | Uint8Array);
    /**
     * Raw secp256k1 private key bytes (32 bytes), owned by the signer.
     *
     * @private
     * @type {Uint8Array | undefined}
     */
    private _rawPrivateKey;
    /**
     * Compressed secp256k1 public key bytes (33 bytes).
     *
     * @private
     * @type {Uint8Array}
     */
    private _rawPublicKey;
    /** @private */
    private _address;
    /** @private */
    private _disposed;
    /**
     * Whether this signer can derive child signers.
     *
     * @type {false}
     */
    get isDerivable(): false;
    /**
     * The derivation path. Always null for private-key signers.
     *
     * @type {null}
     */
    get path(): null;
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
     * Derives a child signer using a relative path.
     *
     * @param {string} path - The relative derivation path.
     * @returns {Promise<never>} The derived signer.
     * @throws {UnsupportedOperationError} If the signer does not support account derivation.
     */
    derive(path: string): Promise<never>;
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
     * Disposes the signer, securely erasing its internal copy of the private key from memory.
     */
    dispose(): void;
}
export type ISignerTron = import("./signer-tron.js").ISignerTron;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type Transaction = import("tronweb").Types.Transaction;
export type SignedTransaction = import("tronweb").Types.SignedTransaction;
