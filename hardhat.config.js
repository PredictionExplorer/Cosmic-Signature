require('hardhat-abi-exporter');
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-tracer");
require("./tasks/cosmic-tasks.js");
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 20000,
      },
      outputSelection: {
          "*":{
              "*":[
                   "storageLayout"
              ],
         },
	  },
    },
  },
  mocha: {
    timeout: 600000
  },
  abiExporter: {
    path: './abi',
    clear: true,
    flat: true,
    only: ['CharityWalle', 'CosmicDao', 'CosmicGame', 'CosmicSignature', 'CosmicToken', 'RaffleWallet', 'RandomWalkNFT'],
    spacing: 2,
    pretty: true,
  },
  networks: {
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161`,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbigoerli: {
      url: `https://goerli-rollup.arbitrum.io/rpc`,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrum: {
      url: `https://arb1.arbitrum.io/rpc`,
      accounts: process.env.MAINNET_PRIVATE_KEY !== undefined ? [process.env.MAINNET_PRIVATE_KEY] : [],
    },
	sepolia: {
		url: `http://170.187.142.12:22545/`,
		accounts: process.env.SEPOLIA_PRIVATE_KEY !== undefined ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
		gasMultiplier: 2,
    },
	localhost: {
		url : `http://localhost:8545/`,
		gasMultiplier: 4,
	}
  },
  etherscan: {
    apiKey: process.env.API_KEY,
  }
};
