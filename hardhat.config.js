// #region

"use strict";

// #endregion
// #region

const nodeFSModule = require("node:fs");
const helpersModule = require("./src/Helpers.js");

// #endregion
// #region

// Disable this when running any Hardhat task against a mainnet.
// Doing so will eliminate the risk of Hardhat Preprocessor bugs breaking things.
// If you forget to, we will throw an error near Comment-202408261.
// Comment-202408155 relates.
// Comment-202410099 relates.
const ENABLE_HARDHAT_PREPROCESSOR = helpersModule.parseBooleanEnvironmentVariable("ENABLE_HARDHAT_PREPROCESSOR", false);

// Comment-202408156 relates.
// [Comment-202408155]
// This is ignored and treated as `false` when `! ENABLE_HARDHAT_PREPROCESSOR`.
// [/Comment-202408155]
const ENABLE_ASSERTS = ENABLE_HARDHAT_PREPROCESSOR && helpersModule.parseBooleanEnvironmentVariable("ENABLE_ASSERTS", false);

// Allowed values:
//    0 = disabled.
//    1 = only preprocess the code for SMTChecker.
//    2 = fully enabled, meaning also run SMTChecker.
// [Comment-202408156]
// When enabling SMTChecker, you typically need to enable asserts as well.
// [/Comment-202408156]
// [Comment-202410099]
// This is ignored and treated as zero when `! ENABLE_HARDHAT_PREPROCESSOR`.
// [/Comment-202410099]
// Comment-202408173 relates.
const ENABLE_SMTCHECKER = ENABLE_HARDHAT_PREPROCESSOR ? helpersModule.parseIntegerEnvironmentVariable("ENABLE_SMTCHECKER", 0) : 0;

// #endregion
// #region

// [Comment-202409011]
// Issue. Hardhat would automatically install solcjs, but solcjs fails to execute SMTChecker.
// It could be a solcjs bug.
// So we must tell Hardhat to use the native solc of the given version.
// Remember to manually install it.
// One option is to install the solc package globally:
//    sudo add-apt-repository ppa:ethereum/ethereum
//    sudo apt install solc
// Another, arguably better option is to use the "solc-select" tool.
// It's documented at https://github.com/crytic/solc-select .
// Install it.
// To switch to a particular solc version, use this command:
//    solc-select use 0.8.27 --always-install
// It's OK if then you switch to a different version. As long as the given version remains installed,
// we should be able to find and use it.
// Note that Hardhat will not necessarily validate solc of what version it's executing,
// so it's your responsibility to correctly configure all the relevant parameters here that reference this comment.
// Remember that depending on how your system upates are configured and how you installed the solc package,
// the package can be updated at any moment, so you might want to disable quiet automatic updates.
// [/Comment-202409011]

// Comment-202409011 applies.
// [ToDo-202409098-1]
// When changing this, remember to revisit the configuration near Comment-202408026 and Comment-202408025.
// [/ToDo-202409098-1]
const solidityVersion = "0.8.27";

// Comment-202409011 applies.
// [Comment-202411136]
// Hardhat docs says that this is used as extra information in the build-info files, but other than that is not important.
// To find out this value, execute:
//    solc --version
// Make sure you are executing the executable pointed at by `solidityCompilerPath`.
// We print it near Comment-202411143.
// [/Comment-202411136]
const solidityCompilerLongVersion = solidityVersion + "+commit.40a35a09.Linux.g++";

// Comment-202409011 applies.
// Comment-202411136 relates.
let solidityCompilerPath = process.env["HOME"] + `/.solc-select/artifacts/solc-${solidityVersion}/solc-${solidityVersion}`;
if( ! nodeFSModule.existsSync(solidityCompilerPath) ) {
	solidityCompilerPath = process.env["HOME"] + "/.local/bin/solc";
	if( ! nodeFSModule.existsSync(solidityCompilerPath) ) {
		solidityCompilerPath = "/usr/bin/solc";
	}
}

// #endregion
// #region

if (ENABLE_HARDHAT_PREPROCESSOR) {
	console.warn("Warning. Hardhat Preprocessor is enabled. Assuming it's intentional.");

	if (ENABLE_SMTCHECKER <= 0 && ( ! ENABLE_ASSERTS )) {
		// [Comment-202409025/]
		console.warn("Warning. Neither SMTChecker nor asserts are enabled. Assuming it's intentional.");
	}

	if (ENABLE_SMTCHECKER > 0 && ( ! ENABLE_ASSERTS )) {
		console.warn("Warning. SMTChecker is enabled, but asserts are disabled. Is it intentional?");
	}
} else {
	console.warn("Warning. Hardhat Preprocessor is disabled. Assuming it's intentional.");
}

// [Comment-202411143/]
// Comment-202409011 relates.
// Comment-202411136 relates.
console.warn(`Warning. Make sure "${solidityCompilerPath}" version is "${solidityCompilerLongVersion}". Hardhat will not necessarily validate that.`);

// #endregion
// #region //

// // [ToDo-202408311-0]
// // This is how I want imports to look like.
// // But this generates the following compile error:
// //    Error HH209: Redefinition of task verify:get-contract-information failed. Unsupported operation adding mandatory (non optional) param definitions in an overridden task.
// //    For more info go to https://hardhat.org/HH209 or run Hardhat with --show-stack-traces
// // Removing the import of "@nomiclabs/hardhat-etherscan" would fix the error.
// // Do we really need that import here?
// // I prototyped contract deployment and verification, and it worked without explicitly importing that package.
// // ToDo-202408312-0 relates.
// // [/ToDo-202408311-0]
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

// #endregion
// #region

// // todo-0 In a newly generated Hardhat project, this is the only import.
// // todo-0 Why did someone quietly remove this import?
// require("@nomicfoundation/hardhat-toolbox");

const { subtask, } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, } = require("hardhat/builtin-tasks/task-names");

if (ENABLE_HARDHAT_PREPROCESSOR) {
	require("hardhat-preprocessor");
}

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

// Comment-202409255 relates.
require("./tasks/cosmic-tasks.js");

// #endregion
// #region

/** @type boolean | undefined */
let networkIsMainNet = undefined;

/**
@param {import("hardhat/types").HardhatRuntimeEnvironment} hre
*/
function populateNetworkIsMainNetOnce(hre) {
	if(networkIsMainNet != undefined) {
		return;
	}

	// [Comment-202408313]
	// To be safe, checking if the network is a known testnet. Otherwise we will suspect that it could be a mainnet.
	// [/Comment-202408313]
	switch(hre.network.name) {
		case "hardhat":
		case "localhost":
		case "rinkeby":
		case "sepolia":
		case "arbigoerli": {
			networkIsMainNet = false;
			break;
		}

		default: {
			networkIsMainNet = true;
			break;
		}
	}
}

// #endregion
// #region

subtask(
	TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
	async (args, hre, runSuper) => {
		// @ts-ignore 'args' is of type 'unknown'.
		if (args.solcVersion === solidityVersion) {

			return {
				compilerPath: solidityCompilerPath,
				isSolcJs: false,
				version: solidityVersion,

				// Comment-202411136 applies.
				longVersion: solidityCompilerLongVersion,
			};
		}
	
		// This point is supposed to be unreachable.
		
		// @ts-ignore 'args' is of type 'unknown'.
		throw new Error(`Hardhat is trying to use a wrong Solidity compiler version: "${args.solcVersion}".`);

		// // Calling the default implementation.
		// return runSuper();
	}
);

// #endregion
// #region

const solidityLinePreProcessingRegExp = ENABLE_HARDHAT_PREPROCESSOR ? createSolidityLinePreProcessingRegExp() : undefined;

function createSolidityLinePreProcessingRegExp()
{
	const regExpPatternPart1 =
		(ENABLE_ASSERTS ? "enable_asserts" : "disable_asserts") +
		"|" +
		((ENABLE_SMTCHECKER > 0) ? "enable_smtchecker" : "disable_smtchecker");
	const regExpPatternPart2 = `\\/\\/[ \\t]*\\#(?:${regExpPatternPart1})(?: |\\b)`;
	const regExpPattern = `^([ \\t]*)${regExpPatternPart2}(?:[ \\t]*${regExpPatternPart2})*`;
	const regExp = new RegExp(regExpPattern, "s");
	return regExp;
}

// #endregion
// #region

/**
@param {import("hardhat/types").HardhatRuntimeEnvironment} hre
@param {string} line
*/
function preProcessSolidityLine(hre, line) {
	populateNetworkIsMainNetOnce(hre);

	if (networkIsMainNet) {
		// [Comment-202408261/]
		throw new Error("The network is a mainnet, but you forgot to disable Hardhat Preprocessor.");
	}

	// @ts-ignore No overload matches this call.
	line = line.replace(solidityLinePreProcessingRegExp, "$1");

	return line;
}

// #endregion
// #region

/** @type import("hardhat/config").HardhatUserConfig */
const hardhatUserConfig = {
	solidity: {
		version: solidityVersion,

		settings: {
			// [Comment-202408026]
			// By default, this is "paris".
			// See https://hardhat.org/hardhat-runner/docs/config
			// But we want this to be the latest with which Arbitrum is compatible.
			// [/Comment-202408026]
			evmVersion: "cancun",

			// [Comment-202408025]
			// See https://hardhat.org/hardhat-runner/docs/reference/solidity-support
			// [/Comment-202408025]
			// Is this going to become `true` by default in a future Solidity version?
			// As of the 0.8.27, this is `false` by default.
			viaIR: true,

			// Comment-202408025 applies.
			optimizer: {
				enabled: true,

				// details: {
				// 	yulDetails: {
				// 		// Hardhat docs at https://hardhat.org/hardhat-runner/docs/reference/solidity-support says that
				// 		// this setting makes Hardhat work as well as possible.
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
						"storageLayout",
						// "ir",
						// "irOptimized",
					],
				},
			},
		},
	},

	// "hardhat-preprocessor" package configuration.
	preprocess: {
		eachLine:
			(hre) =>
			(
				{
					// In case the preprocessor is disabled, it doesn't matter whether this object exists or changed.
					// In that case, Hardhat will recompile only modified contracts, which is the normal behavior of Hardhat.
					// Further comments apply if the preprocesor is enabled.
					// Regardless if this object exists or changed, Hardhat will unconditionally execute the preprocesor.
					// As a result, the logic that can lead to an error being thrown near Comment-202408261 is guaranteed to run.
					// If this object doesn't exist or if it changed, Hardhat will recompile all contracts.
					// Otherwise, if the preprocessor generats a different output, Hardhat will recompile the changed contracts.
					settings:
					{
						enableAsserts: ENABLE_ASSERTS,
						enableSMTChecker: ENABLE_SMTCHECKER > 0,
					},

					// // This undocumented parameter appears to make it possible to specify what files to preprocess.
					// // It appears to be unnecessary to configure this.
					// // Comment-202408173 relates.
					// files: "???",

					transform: (line) => { return preProcessSolidityLine(hre, line); },
				}
			),
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
			'PrizesWallet',
			'RandomWalkNFT',
		],

		spacing: 2,
		pretty: true,
	},

	// When you make changes to the networks, remember to refactor the logic near Comment-202408313.
	networks: {
		hardhat :{
			allowUnlimitedContractSize: true
		},
		localhost: {
			url: `http://localhost:8545/`,
			gasMultiplier: 4,
		},
		rinkeby: {
			url: `https://rinkeby.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161`,
			accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
		},
		sepolia: {
			url: `http://170.187.142.12:22545/`,
			accounts: process.env.SEPOLIA_PRIVATE_KEY !== undefined ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
			gasMultiplier: 2,
		},
		arbigoerli: {
			url: `https://goerli-rollup.arbitrum.io/rpc`,
			accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
		},
		arbitrum: {
			url: `https://arb1.arbitrum.io/rpc`,
			accounts: process.env.MAINNET_PRIVATE_KEY !== undefined ? [process.env.MAINNET_PRIVATE_KEY] : [],
		},
	},

	etherscan: {
		apiKey: process.env.API_KEY,
	},

	mocha: {
		timeout: 10 * 60 * 1000,
	},
};

// #endregion
// #region

if (ENABLE_SMTCHECKER >= 2) {
	// See https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description
	// On that page, find: modelChecker
	// @ts-ignore Property is possibly undefined. Property doesn't exist.
	hardhatUserConfig.solidity.settings.modelChecker = {
		// [Comment-202409013]
		// If you don't list any contracts here, all contracts under the "contracts" folder tree, except abstract ones, will be analyzed.
		// [Comment-202408173]
		// Issue. The preprocessor always preprocesses all Solidity sources, regardless of what you select here, if anything.
		// [/Comment-202408173]
		// [Comment-202409012]
		// Issue. Previously compiled contracts that don't need a recompile won't be analyzed.
		// Therefore remember to force-compile them.
		// [/Comment-202409012]
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#verified-contracts
		// [/Comment-202409013]
		contracts: {
			// "contracts/production/CharityWallet.sol": ["CharityWallet"],
			// "contracts/production/CosmicDAO.sol": ["CosmicDAO"],
			// "contracts/production/CosmicGame.sol": ["CosmicGame"],
			// "contracts/production/CosmicSignature.sol": ["CosmicSignature"],
			// "contracts/production/CosmicToken.sol": ["CosmicToken"],
			// "contracts/production/MarketingWallet.sol": ["MarketingWallet"],
			// "contracts/production/PrizesWallet.sol": ["PrizesWallet"],
			// "contracts/production/RandomWalkNFT.sol": ["RandomWalkNFT"],
			"contracts/production/StakingWalletCosmicSignatureNft.sol": ["StakingWalletCosmicSignatureNft"],
			"contracts/production/StakingWalletRandomWalkNft.sol": ["StakingWalletRandomWalkNft"],
		},

		// // It appears to be unnecessary to configure this.
		// // See https://docs.soliditylang.org/en/latest/smtchecker.html#division-and-modulo-with-slack-variables
		// divModNoSlacks: ...

		// It appears to be documented that by default, all model checking engines will run, which is probably the best option.
		// Issue. Actually, without this being configured explicitly, no engines appear to run.
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#model-checking-engines
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#bounded-model-checker-bmc
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#constrained-horn-clauses-chc
		engine: "all",

		// When we make an external call like `Contract1(address1).function1()`, SMTChecker will, by default, expect that
		// we are calling into potentially malicious code.
		// This parameter results in SMTChecker assuming that we are calling our own known contract.
		// This implies that for this to work correct we must cast an address to a specific contract, rather than to its interface.
		// A problem is that we make a lot of low level calls, like `call` or `delegatecall`, but SMTChecker doesn't recognize those.
		// So it would be beneficial at least in the mode in which SMTChecker is enabled to make high level calls.
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#trusted-external-calls
		extCalls: "trusted",

		// By default, these won't be reported.
		// todo-0 Do we really need these?
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#reported-inferred-inductive-invariants
		invariants: ["contract", "reentrancy",],

		// // We probably rarely need this.
		// // See https://docs.soliditylang.org/en/latest/smtchecker.html#proved-targets
		// showProvedSafe: true,

		// See https://docs.soliditylang.org/en/latest/smtchecker.html#unproved-targets
		showUnproved: true,

		// See https://docs.soliditylang.org/en/latest/smtchecker.html#unsupported-language-features
		showUnsupported: true,

		// // It appears to be unnecessary to configure this.
		// // See https://docs.soliditylang.org/en/latest/smtchecker.html#smt-and-horn-solvers
		// solvers: ["z3"],

		// By default, SMTChecker won't discover integer overflow and underflow.
		// To enable discovering those, list them explicitly, together with whatever others.
		// todo-0 Do we really need to discover them?
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#verification-targets
		targets: [
			"assert",
			"underflow",
			"overflow",
			"divByZero",
			"constantCondition",
			"popEmptyArray",
			"outOfBounds",
			"balance",
			//"default",
		],

		// Milliseconds.
		timeout: 20 * 60 * 60 * 1000,
	};
}

// #endregion
// #region

module.exports = hardhatUserConfig;

// #endregion
