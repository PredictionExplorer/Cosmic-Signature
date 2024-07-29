// todo-0 I executed "npm install", which updated "package-lock.json".
// todo-0 After merging this branch, you guys should execute "npm ci".
// todo-0 It will generate a bunch of warnings for certain packages.
// todo-0 Take a look at those.
// todo-0 It appears that none of those packages are included in our "package.json" directly,
// todo-0 so we probably can't eliminate those warnings.
require('hardhat-abi-exporter');
require("@nomiclabs/hardhat-etherscan");
require("hardhat-tracer");
require("@nomicfoundation/hardhat-chai-matchers");
require("./tasks/cosmic-tasks.js");
module.exports = {
	solidity: {
		version: "0.8.26",
		settings: {
			// todo-0 This is "paris" by default, right?
			// todo-0 There were "shanghai" and "cancun" afterwards.
         // todo-0 I'd rather set this to the latest.
         // todo-0 But it's unclear what vesion Arbitrum is compatible with.
         // todo-0 Write a todo to revisit this.
         evmVersion: "cancun",
			optimizer: {
				enabled: true,
				runs: 20000,
			},
			outputSelection: {
				"*": {
					"*": [
						"storageLayout"
					],
				},
			},
			// ToDo-0 This feature is still considered unstable, right?
			// ToDo-0 Are we OK with that?
			// ToDo-0 Besides, Hardhat docs recommends also setting `optimizerSteps: "u"`.
			// ToDo-0 Should we do that?
			// ToDo-0 See https://hardhat.org/hardhat-runner/docs/reference/solidity-support
         // ToDo-0 Write a todo to revisit this.
			viaIR: true,
		},
	},
	mocha: {
		timeout: 600000
	},
	abiExporter: {
		// ToDo-0 Should we add this folder to ".gitignore"?
		// ToDo-0 I see that files in it are of old versions.
		// ToDo-0 Then also don't forget to delete it from the main GitHub repo.
		// ToDo-1 Later make sure it hasn't resurrected there.
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
			url: `http://localhost:8545/`,
			gasMultiplier: 4,
		}
	},
	etherscan: {
		apiKey: process.env.API_KEY,
	}
};
