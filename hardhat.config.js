// // todo-0 This is how I want imports to look like.
// // todo-0 But this generates the following compile error:
// // todo-0    Error HH209: Redefinition of task verify:get-contract-information failed. Unsupported operation adding mandatory (non optional) param definitions in an overridden task.
// // todo-0    For more info go to https://hardhat.org/HH209 or run Hardhat with --show-stack-traces
// // todo-0 Removing the import of "@nomiclabs/hardhat-etherscan" would fix the error.
// // todo-0 Do we really need that import here?
// // todo-0 I prototyped contract deployment and verification, and it worked without explicitly importing that package.
// require("@nomicfoundation/hardhat-toolbox");
// // require("@nomicfoundation/hardhat-ethers");
// // require("@nomicfoundation/hardhat-chai-matchers");
// require("hardhat-abi-exporter");
// require("hardhat-docgen");
// require("@openzeppelin/hardhat-upgrades");
// require("hardhat-tracer");
// require("@nomiclabs/hardhat-solhint");
// require("@nomiclabs/hardhat-etherscan");
// require("./tasks/cosmic-tasks.js");

//---

// // todo-0 In a newly generated Hardhat project, this is the only import. Why did someone remove this import?
// require("@nomicfoundation/hardhat-toolbox");

require("hardhat-abi-exporter");
require("@nomiclabs/hardhat-etherscan");

// todo-0 "@nomicfoundation/hardhat-toolbox" imports this.
// todo-0 So if you decide to import "@nomicfoundation/hardhat-toolbox", this import would be redundant.
require("@nomicfoundation/hardhat-ethers");

require("hardhat-tracer");
require("hardhat-docgen");

// todo-0 "@nomicfoundation/hardhat-toolbox" imports this.
// todo-0 So if you decide to import "@nomicfoundation/hardhat-toolbox", this import would be redundant.
require("@nomicfoundation/hardhat-chai-matchers");

require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-solhint");
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
				// details: {
				// 	yulDetails: {
				// 		// Hardhat docs at https://hardhat.org/hardhat-runner/docs/reference/solidity-support recommends this setting.
				// 		// Issue. But it appears to increase contract binary size.
				// 		// todo-1 To be revisited.
				// 		optimizerSteps: "u",
				// 	},
				// },
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
			'CosmicDAO',
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
	},
};
