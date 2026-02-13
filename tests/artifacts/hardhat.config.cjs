require('@layerzerolabs/hardhat-deploy')
require('@layerzerolabs/hardhat-tron')

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [{ version: '0.8.20' }]
  },
  tronSolc: {
    enable: true,
    filter: [],
    compilers: [{ version: '0.8.20' }]
  },
  networks: {
    tron: {
      url: 'http://127.0.0.1:8090/jsonrpc',
      accounts: [],
      tron: true
    }
  }
}
