# @tetherto/wdk-wallet-tron

[![npm version](https://img.shields.io/npm/v/%40tetherto%2Fwdk-wallet-tron?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-wallet-tron)
[![npm downloads](https://img.shields.io/npm/dw/%40tetherto%2Fwdk-wallet-tron?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-wallet-tron)
[![license](https://img.shields.io/npm/l/%40tetherto%2Fwdk-wallet-tron?style=flat-square)](https://github.com/tetherto/wdk-wallet-tron/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.wdk.tether.io-0A66C2?style=flat-square)](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-tron)

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage BIP-44 wallets for the TRON blockchain. This package provides a clean API for creating, managing, and interacting with TRON wallets using BIP-39 seed phrases and TRON-specific derivation paths.

## About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://docs.wdk.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wdk.tether.io](https://docs.wdk.tether.io).

## Installation

```bash
npm install @tetherto/wdk-wallet-tron
```

## Quick Start

```javascript
import WalletManagerTron from '@tetherto/wdk-wallet-tron'

const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const wallet = new WalletManagerTron(seedPhrase, {
  provider: 'https://api.shasta.trongrid.io',
  transferMaxFee: 10_000_000n,
})

const account = await wallet.getAccount(0)
const address = await account.getAddress()
console.log('Address:', address)

wallet.dispose()
```

## Key Capabilities

- **BIP-44 Derivation Paths**: Standard TRON derivation support (`m/44'/195'`)
- **Multi-Account Management**: Derive multiple accounts from a single seed phrase
- **Native TRX Transactions**: Quote and send TRX transfers through a unified wallet API
- **TRC20 Support**: Query balances and transfer TRC20 tokens
- **Message Signing**: Sign messages and verify signatures with TRON accounts
- **Fee Estimation**: Retrieve current network fee rates and quote transaction costs
- **Read-Only Accounts**: Monitor any TRON address without a private key
- **Secure Memory Disposal**: Clear private keys from memory when done

## Compatibility

- **TRON Mainnet**
- **TRON Shasta Testnet**
- **TronWeb-compatible providers** for balance, transaction, and fee queries

## Documentation

| Topic | Description | Link |
|-------|-------------|------|
| Overview | Module overview and feature summary | [Wallet TRON Overview](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-tron) |
| Usage | End-to-end integration walkthrough | [Wallet TRON Usage](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-tron/usage) |
| Configuration | Provider and transfer configuration | [Wallet TRON Configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-tron/configuration) |
| API Reference | Complete class and type reference | [Wallet TRON API Reference](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-tron/api-reference) |

## Examples

| Example | Description |
|---------|-------------|
| [Create Wallet](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/create-wallet.ts) | Initialize a wallet manager and derive TRON accounts from a seed phrase |
| [Manage Accounts](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/manage-accounts.ts) | Work with multiple accounts and custom BIP-44 derivation paths |
| [Check Balances](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/check-balances.ts) | Query native TRX and TRC20 token balances for owned accounts |
| [Read-Only Account](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/read-only-account.ts) | Monitor balances for any TRON address without a private key |
| [Send Transaction](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/send-transaction.ts) | Estimate fees and send native TRX transactions |
| [Token Transfer](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/token-transfer.ts) | Transfer TRC20 tokens and estimate transfer fees |
| [Sign & Verify Message](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/sign-verify-message.ts) | Sign messages and verify signatures |
| [Fee Management](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/fee-management.ts) | Retrieve current network fee rates |
| [Memory Management](https://github.com/tetherto/wdk-examples/blob/main/wallet-tron/memory-management.ts) | Securely dispose wallets and clear private keys from memory |

> For detailed walkthroughs, see the [Usage Guide](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-tron/usage).
> See all runnable examples in the [wdk-examples](https://github.com/tetherto/wdk-examples) repository.

## Community

Join the [WDK Discord](https://discord.gg/arYXDhHB2w) to connect with other developers.

## Support

For support, please [open an issue](https://github.com/tetherto/wdk-wallet-tron/issues) on GitHub or reach out via [email](mailto:wallet-info@tether.io).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
