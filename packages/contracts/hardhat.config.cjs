require("@nomicfoundation/hardhat-toolbox-viem");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    arcTestnet: {
      url: process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io",
      chainId: 5042002,
      gasPrice: 25000000000, // 25 Gwei (above 20 Gwei minimum floor)
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    arcMainnet: {
      url: process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io",
      chainId: 5042,
      gasPrice: 25000000000,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
