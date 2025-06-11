export default class WalletAccountTron {
  /**
   * Creates a new tron wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor(
    seed: string | Uint8Array,
    path: string,
    config?: TronWalletConfig
  );

  /**
   * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   * @type {string}
   */
  get path(): string;

  /**
   * The derivation path's index of this account.
   * @type {number}
   */
  get index(): number;

  /**
   * The account's key pair.
   * @type {KeyPair}
   */
  get keyPair(): KeyPair;

  /**
   * Returns the account's address.
   * @returns {Promise<string>} The account's address.
   */
  getAddress(): Promise<string>;

  /**
   * Signs a message.
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  sign(message: string): Promise<string>;

  /**
   * Verifies a message's signature.
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  verify(message: string, signature: string): Promise<boolean>;

  /**
   * Sends a transaction.
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<TronTransactionResult>} The send transaction's result.
   */
  sendTransaction(tx: TronTransaction): Promise<TronTransactionResult>;

  /**
   * Quotes the costs of a send transaction operation.
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<Omit<TronTransactionResult, "hash">>} The send transaction's quotes.
   */
  quoteSendTransaction(
    tx: TronTransaction
  ): Promise<Omit<TronTransactionResult, "hash">>;

  /**
   * Transfers a token to another address.
   * @param {TronTransferOptions} options - The transfer's options.
   * @returns {Promise<TronTransferResult>} The transfer's result.
   */
  transfer(options: TronTransferOptions): Promise<TronTransferResult>;

  /**
   * Quotes the costs of a transfer operation.
   * @param {TronTransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TronTransferResult, "hash">>} The transfer's quotes.
   */
  quoteTransfer(
    options: TronTransferOptions
  ): Promise<Omit<TronTransferResult, "hash">>;

  /**
   * Returns the account's native token balance.
   * @returns {Promise<number>} The native token balance.
   */
  getBalance(): Promise<number>;

  /**
   * Returns the balance of the account for a specific token.
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<number>} The token balance.
   */
  getTokenBalance(tokenAddress: string): Promise<number>;

  /**
   * Disposes the wallet account, and erases the private key from the memory.
   */
  dispose(): void;

  #private;
}

export type KeyPair = {
  /** The public key. */
  publicKey: Uint8Array;
  /** The private key. */
  privateKey: Uint8Array;
};

export type TronTransaction = {
  /** The transaction's recipient. */
  to: string;
  /** The amount of TRX to send to the recipient (in sun). */
  value: number;
  /** The transaction's data in hex format. */
  data?: string;
};

export type TronTransactionResult = {
  /** The transaction's hash. */
  hash: string;
  /** The bandwidth cost in sun (1 TRX = 1,000,000 sun). */
  fee: number;
};

export type TronWalletConfig = {
  /** The rpc url of the provider. */
  rpcUrl?: string;
};

export type TronTransferOptions = {
  /** The address of the token to transfer. */
  token: string;
  /** The address of the recipient. */
  recipient: string;
  /** The amount of tokens to transfer to the recipient (in base units). */
  amount: number;
};

export type TronTransferResult = {
  /** The hash of the transfer operation. */
  hash: string;
  /** The bandwidth cost in sun (1 TRX = 1,000,000 sun). */
  fee: number;
};
