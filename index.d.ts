export { default } from "./src/wallet-manager-tron.js";
export { default as WalletAccountTron } from "./src/wallet-account-tron.js";
export type TronWalletConfig = import("./src/wallet-manager-tron.js").TronWalletConfig;
export type KeyPair = import("./src/wallet-account-tron.js").KeyPair;
export type TronTransaction = import("./src/wallet-account-tron.js").TronTransaction;
