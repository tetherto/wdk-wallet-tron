/**
 * Tron-specific signer interface.
 *
 * Extends the base ISigner contract with TRON signing capabilities.
 * No signTypedData — TRON has no EIP-712 equivalent.
 *
 * @interface
 */
export class ISignerTron {
    /** @type {boolean} */
    get isActive(): boolean;
    /** @type {boolean} */
    get isRoot(): boolean;
    /** @type {number|undefined} */
    get index(): number | undefined;
    /** @type {string|undefined} */
    get path(): string | undefined;
    /** @type {string|undefined} */
    get address(): string | undefined;
    /**
     * @type {{ privateKey: Uint8Array|null, publicKey: Uint8Array|null }}
     */
    get keyPair(): {
        privateKey: Uint8Array | null;
        publicKey: Uint8Array | null;
    };
    /**
     * Derive a child signer from a relative BIP-44 path (e.g. "0'/0/0").
     * @param {string} relPath
     * @returns {ISignerTron}
     */
    derive(relPath: string): ISignerTron;
    /** @returns {Promise<string>} */
    getAddress(): Promise<string>;
    /**
     * Sign a plain text message using the TRON personal sign prefix.
     * @param {string} message
     * @returns {Promise<string>} hex signature with 0x prefix
     */
    sign(message: string): Promise<string>;
    /**
     * Sign a raw TRON transaction by its txID (hex string).
     * @param {string} txID - The transaction ID hex string (32 bytes).
     * @returns {Promise<string>} compact hex signature (r+s+v, no 0x prefix)
     */
    signTransaction(txID: string): Promise<string>;
    /** Clear secret material from memory. */
    dispose(): void;
}
/**
 * BIP-44 seed-based signer for the TRON network.
 *
 * Two modes:
 *  - Root: `new SeedSignerTron(seed)` — holds master HDKey, derive() only.
 *  - Child: `new SeedSignerTron(null, { root, path })` — holds derived HDKey, can sign.
 *
 * @implements {import('./interface.js').ISignerTron}
 */
export default class SeedSignerTron implements import {
    /**
     * @param {string|Uint8Array|null} seed - BIP-39 mnemonic or seed bytes. Pass null when providing opts.root.
     * @param {{ root?: HDKey, path?: string }} [opts]
     */
    constructor(seed: string | Uint8Array | null, opts?: {
        root?: HDKey;
        path?: string;
    });
    _isActive: boolean;
    _isRoot: boolean;
    _root: HDKey;
    _account: HDKey;
    _address: string;
    _path: string;
    get isActive(): boolean;
    get isRoot(): boolean;
    get index(): number;
    get path(): string;
    get address(): string;
    get keyPair(): {
        privateKey: Uint8Array<ArrayBufferLike>;
        publicKey: Uint8Array<ArrayBufferLike>;
    };
    /**
     * Derive a child signer using a relative path (e.g. "0'/0/0").
     * @param {string} relPath
     * @returns {SeedSignerTron}
     */
    derive(relPath: string): SeedSignerTron;
    /** @returns {Promise<string>} */
    getAddress(): Promise<string>;
    /**
     * Signs a message using the TRON personal sign prefix.
     * @param {string} message
     * @returns {Promise<string>} 0x-prefixed hex signature (65 bytes)
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a raw TRON transaction by its txID.
     * @param {string} txID - Transaction ID as a hex string (64 hex chars = 32 bytes).
     * @returns {Promise<string>} compact hex signature r+s+v (65 bytes, no 0x prefix)
     */
    signTransaction(txID: string): Promise<string>;
    /** Clears private key material from memory. */
    dispose(): void;
}
import { HDKey } from '@scure/bip32';
