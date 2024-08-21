// require("@nomicfoundation/hardhat-toolbox");
require('hardhat-abi-exporter');
require("@nomiclabs/hardhat-etherscan");
require("@nomicfoundation/hardhat-ethers");
require("hardhat-tracer");
require("hardhat-docgen");
require("@nomicfoundation/hardhat-chai-matchers");
require('@openzeppelin/hardhat-upgrades');
require("./tasks/cosmic-tasks.js");
module.exports = {
	solidity: {
		// When changing this, remember to revisit Comment-202408026 and Comment-202408025.
		version: "0.8.26",

		settings: {
			// [Comment-202408026]
			// By default, this is "paris".
			// See https://hardhat.org/hardhat-runner/docs/config
			// But we want this to be the latest with which Arbitrum is compatible.
			// [/Comment-202408026]
			evmVersion: "cancun",

			// Comment-202408025 applies.
			optimizer: {
				enabled: true,
				details: {
				},
				runs: 20000,
			},

			outputSelection: {
				"*": {
					"*": [
						"storageLayout"
					],
				},
			},

			// [Comment-202408025]
			// See https://hardhat.org/hardhat-runner/docs/reference/solidity-support
			// [/Comment-202408025]
			// This is expected to be the default for Solidity 0.8.27.
			viaIR: true,
		},
	},
	mocha: {
		timeout: 600000
	},
	abiExporter: {
		// [Comment-202408024]
		// This folder name exists in multiple places.
		// [/Comment-202408024]
		path: './abi',

		clear: true,
		flat: true,
		only: [
			'CharityWallet',
			'CosmicDao',
			'CosmicGameProxy',
			'CosmicSignature',
			'CosmicToken',
			'RaffleWallet',
			'RandomWalkNFT',
		],
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
			url: `http://localhost:8545/`,
			gasMultiplier: 4,
		}
	},
	etherscan: {
		apiKey: process.env.API_KEY,
	}
};
