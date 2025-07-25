// #region

"use strict";

// #endregion
// #region

const nodeFsModule = require("node:fs");
const helpersModule = require("./src/Helpers.js");

// #endregion
// #region

// Disable Hardhat Preprocessor by not setting or setting to "false" this environment variable
// when running any Hardhat task against a mainnet.
// It's to eliminate the risk of Hardhat Preprocessor bugs breaking things.
// If you forget to, we will throw an error near Comment-202408261.
// Comment-202408155 relates.
// Comment-202410099 relates.
const ENABLE_HARDHAT_PREPROCESSOR = helpersModule.parseBooleanEnvironmentVariable("ENABLE_HARDHAT_PREPROCESSOR", false);

// [Comment-202408155]
// This environment variable is ignored and assumed to be `false` when `! ENABLE_HARDHAT_PREPROCESSOR`.
// [/Comment-202408155]
// Comment-202408156 relates and/or applies.
const ENABLE_ASSERTS = ENABLE_HARDHAT_PREPROCESSOR && helpersModule.parseBooleanEnvironmentVariable("ENABLE_ASSERTS", false);

// Allowed values:
//    0 = disabled.
//    1 = only preprocess the code for SMTChecker.
//    2 = fully enabled, meaning also run SMTChecker.
// [Comment-202410099]
// This environment variable is ignored and assumed to be zero when `! ENABLE_HARDHAT_PREPROCESSOR`.
// [/Comment-202410099]
// [Comment-202408156]
// When enabling SMTChecker, you typically need to enable asserts as well.
// [/Comment-202408156]
const ENABLE_SMTCHECKER = ENABLE_HARDHAT_PREPROCESSOR ? helpersModule.parseIntegerEnvironmentVariable("ENABLE_SMTCHECKER", 0) : 0;

// #endregion
// #region

// [Comment-202503272]
// The use of different folders prevents a recompile of some Solidity sources
// when using a different combination of environment variables.
// [/Comment-202503272]
// [Comment-202503302]
// A similar folder name exists in multiple places.
// [/Comment-202503302]
const solidityCompilationCacheSubFolderName = ENABLE_HARDHAT_PREPROCESSOR ? ("debug-" + ENABLE_ASSERTS.toString() + "-" + (ENABLE_SMTCHECKER > 0).toString()) : "production";

// #endregion
// #region

// [Comment-202409011]
// Issue. Hardhat would automatically install solcjs, but solcjs terminates with an error when SMTChecker is enabled.
// It could be a solcjs bug.
// So we must tell Hardhat to use the native solc of the given version.
// Remember to manually install it.
// One option is to install the solc package globally:
//    sudo add-apt-repository ppa:ethereum/ethereum
//    sudo apt install solc
// Another, arguably better option is to use the "solc-select" tool.
// It's documented at https://github.com/crytic/solc-select .
// After you install it, to switch to a particular solc version, use this command:
//    solc-select use 0.8.29 --always-install
// It's OK if afterwards you switch to a different version. As long as the given version remains installed, we will find and use it.
//
// Update 1. It turns out that just like solcjs, solc installed with solc-select also fails when SMTChecker is enabled.
// So you must install solc globally.
// You can still use solc installed with solc-select when you don't need SMTChecker.
//
// Update 2. On the cosmic2 server, even the globally installed solc didn't work.
// Installing the z3 package fixed that:
//    sudo apt install z3
// Now even solc installed with solc-select works. So it's actually unnecessary to install solc globally.
// todo-3 Test if solcjs works too.
//
// Note that Hardhat will not necessarily validate solc of what version it's executing,
// so it's your responsibility to correctly configure all the relevant parameters that reference this comment.
// Note that if your system is configured to install updates automatically and you installed the solc package globally,
// the package can be updated at any moment, so you might want to disable quiet automatic updates.
// [/Comment-202409011]

// Comment-202409011 applies.
// [ToDo-202409098-1]
// When changing this, remember to revisit the configuration near Comment-202411136, Comment-202408026, Comment-202408025.
// [/ToDo-202409098-1]
const solidityVersion = "0.8.29";

// Comment-202409011 applies.
// [Comment-202411136]
// Hardhat docs says that this is used as extra information in the build-info files, but other than that is not important.
// To find out this value, execute:
//    solc --version
// Make sure you are executing the executable pointed at by `solidityCompilerPath`.
// We print it near Comment-202411143.
// [/Comment-202411136]
const solidityCompilerLongVersion = solidityVersion + "+commit.ab55807c.Linux.g++";

// Comment-202409011 applies.
// Comment-202411136 relates.
let solidityCompilerPath;
const solidityCompilerPathGlobal = "/usr/bin/solc";
// if (ENABLE_SMTCHECKER < 2) {
	solidityCompilerPath = process.env["HOME"] + `/.solc-select/artifacts/solc-${solidityVersion}/solc-${solidityVersion}`;
	if ( ! nodeFsModule.existsSync(solidityCompilerPath) ) {
		solidityCompilerPath = process.env["HOME"] + "/.local/bin/solc";
		if ( ! nodeFsModule.existsSync(solidityCompilerPath) ) {
			solidityCompilerPath = solidityCompilerPathGlobal;
		}
	}
// } else {
// 	solidityCompilerPath = solidityCompilerPathGlobal;
// }

// #endregion
// #region

if (ENABLE_HARDHAT_PREPROCESSOR) {
	console.warn("Warning. Hardhat Preprocessor is enabled. Assuming it's intentional.");
	if (ENABLE_SMTCHECKER <= 0 && ( ! ENABLE_ASSERTS )) {
		// [Comment-202409025/]
		console.warn("Warning. Neither the preprocessing for SMTChecker nor asserts are enabled. Assuming it's intentional.");
	}
	if (ENABLE_SMTCHECKER > 0 && ( ! ENABLE_ASSERTS )) {
		console.warn("Warning. The preprocessing for SMTChecker is enabled, but asserts are disabled. Is it intentional?");
	}
	if (ENABLE_SMTCHECKER >= 2) {
		console.log("SMTChecker execution is enabled.");
	}
} else {
	console.warn("Warning. Hardhat Preprocessor is disabled. Assuming it's intentional.");
}

// [Comment-202411143/]
// Comment-202409011 relates.
// Comment-202411136 relates.
console.warn(`Warning. Make sure "${solidityCompilerPath}" version is "${solidityCompilerLongVersion}". Hardhat will not necessarily validate that.`);

// #endregion
// #region

// This imports a bunch of other packages. Don't import them here.
require("@nomicfoundation/hardhat-toolbox");

if (ENABLE_HARDHAT_PREPROCESSOR) {
	require("hardhat-preprocessor");
}
require("hardhat-abi-exporter");
require("hardhat-docgen");
require("@nomiclabs/hardhat-solhint");
require("hardhat-tracer");

// // [ToDo-202412098-1]
// // Use "@nomicfoundation/hardhat-verify" instead.
// // "@nomicfoundation/hardhat-toolbox" imports it, so it could be unnecessary to explicitly import it.
// // Maybe comment about that where we import "@nomicfoundation/hardhat-toolbox".
// // ToDo-202412097-1 relates.
// // [/ToDo-202412098-1]
// require("@nomiclabs/hardhat-etherscan");

const { subtask, } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, } = require("hardhat/builtin-tasks/task-names");
require("@openzeppelin/hardhat-upgrades");

// Comment-202409255 relates.
require("./tasks/cosmic-signature-tasks.js");

// #endregion
// #region

/** @type boolean | undefined */
let networkIsMainNet = undefined;

/**
@param {import("hardhat/types").HardhatRuntimeEnvironment} hre
*/
function populateNetworkIsMainNetOnce(hre) {
	if (networkIsMainNet != undefined) {
		return;
	}

	// [Comment-202408313]
	// To be safe, checking if the network is a known testnet. Otherwise we will suspect that it could be a mainnet.
	// [/Comment-202408313]
	switch (hre.network.name) {
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
		if (args.solcVersion == solidityVersion) {
			return {
				compilerPath: solidityCompilerPath,
				isSolcJs: false,
				version: solidityVersion,

				// Comment-202411136 applies.
				longVersion: solidityCompilerLongVersion,
			};
		}
	
		// This point is supposed to be unreachable.
		
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
		throw new Error("The network appears to be a mainnet, but you forgot to disable Hardhat Preprocessor.");
	}

	line = line.replace(solidityLinePreProcessingRegExp, "$1");
	return line;
}

// #endregion
// #region

/** @type import("hardhat/config").HardhatUserConfig */
const hardhatUserConfig = {
	// #region

	paths: {
		// Comment-202503272 relates.
		cache: "./cache/" + solidityCompilationCacheSubFolderName,
		artifacts: "./artifacts/" + solidityCompilationCacheSubFolderName,
	},

	// #endregion
	// #region

	solidity: {
		version: solidityVersion,
		settings: {
			// [Comment-202408026]
			// By default, this is "paris".
			// See https://hardhat.org/hardhat-runner/docs/config#default-evm-version
			// But we want this to be the latest with which Arbitrum is compatible.
			// todo-1 Revisit this.
			// [/Comment-202408026]
			evmVersion: "cancun",

			// [Comment-202408025]
			// See https://hardhat.org/hardhat-runner/docs/reference/solidity-support
			// [/Comment-202408025]
			// Is this going to become `true` by default in a future Solidity version?
			// As of the 0.8.29, this is `false` by default.
			viaIR: true,

			// Comment-202408025 applies.
			optimizer: {
				enabled: true,
				
				// // Issue. A big value here causes excessive inlining, which results in the game contract size
				// // exceeding the max allowed limit, especially when modifiers are used.
				// // I have observed that when I decorated a method with the `nonReentrant` modifier,
				// // the contract bytecode size has increased by about 2200 bytes.
				// // Converting modifiers into methods helps and therefore should be preferred, but in some cases it doesn't help that much.
				// // So let's not configure this.
				// runs: 20_000,

				// details: {
				// 	yulDetails: {
				// 		// Hardhat docs at https://hardhat.org/hardhat-runner/docs/reference/solidity-support says that
				// 		// this setting makes Hardhat work as well as possible.
				// 		// Issue. But it appears to increase contract binary size and, possibly, gas use.
				// 		// So we probably don't need this.
				// 		// Although it could make sense to enable this if Hardhat Preprocessor is enabled.
				// 		optimizerSteps: "u",
				// 	},
				// },
			},

			outputSelection: {
				"*": {
					"*": [
						"storageLayout",
						// "ir",
						// "irOptimized",
						// "bytecode",
					],
				},
			},
		},
	},

	// #endregion
	// #region

	// "hardhat-preprocessor" package configuration.
	preprocess: {
		eachLine:
			(hre) => (
				{
					// In case Hardhat Preprocessor is disabled, it doesn't matter whether this object exists or changed.
					// In that case, Hardhat will recompile only the modified contracts, which is the normal behavior of Hardhat.
					// Further comments apply if the preprocesor is enabled.
					// Regardless if this object exists or changed, Hardhat will unconditionally execute the preprocesor.
					// As a result, the logic that can lead to an error being thrown near Comment-202408261 is guaranteed to run.
					// If this object doesn't exist or if it changed, Hardhat will recompile all contracts.
					// Otherwise, if the preprocessor generats a different output, Hardhat will recompile only the modified contracts.
					// Note that this configuration is not designed to address the issue described in Comment-202409012.
					settings: {
						// // We don't need these variables here for 2 separate reasons, each of which is sufficient:
						// //    1. We need to recompile only changed preprocessor output.
						// //    2. We use a different `solidityCompilationCacheSubFolderName` for each combination of these variables.
						// //       Comment-202503272 relates.
						// enableAsserts: ENABLE_ASSERTS,
						// enableSmtChecker: ENABLE_SMTCHECKER > 0,
					},

					// // This undocumented parameter appears to make it possible to specify what files to preprocess.
					// // It appears to be unnecessary to configure this.
					// // Comment-202408173 relates.
					// files: "???",

					transform: (line) => { return preProcessSolidityLine(hre, line); },
				}
			),
	},

	// #endregion
	// #region

	abiExporter: {
		// [Comment-202408024]
		// This folder name exists in multiple places.
		// [/Comment-202408024]
		path: "./abi",

		// runOnCompile: true,
		clear: true,
		flat: true,

		// Issue. This list is incomplete.
		only: [
			"CosmicSignatureToken",
			"RandomWalkNFT",
			"CosmicSignatureNft",
			"PrizesWallet",
			"CharityWallet",
			"CosmicSignatureDao",
			// "CosmicSignatureGameProxy",
		],

		spacing: 2,
		pretty: true,
	},

	// #endregion
	// #region

	// todo-1 When you make changes to the networks, remember to refactor the logic near Comment-202408313.
	// todo-0 If I add add Arbitrum Sepolia do the above.
	// todo-0 Add it and then search for any sepolia
	networks: {
		hardhat: {
			// Comment-202501193 relates and/or applies.
			initialDate:
				// "2002-01-01",
				"2025-01-01",

			// // Comment-202501193 relates and/or applies.
			// allowBlocksWithSameTimestamp: true,

			allowUnlimitedContractSize: true,

			// [Comment-202507272]
			// Providing a particular value, rather than "auto", increases testing speed.
			// Although it's also possible to provide a particular `gasLimit` when calling a contract method.
			// By default, this is taken from `blockGasLimit`.
			// Issue. The docs says that by default this is "auto", but it doesn't appear to be the case, particularly for Hardhat Network.
			// Comment-202507252 relates.
			// [/Comment-202507272]
			gas: 30_000_000,

			// [Comment-202507252]
			// When automining is disabled, a bigger value allows to mine many transactions per block with a single "evm_mine".
			// But for things to work, the `gas` parameter probably must be a fraction of this.
			// Comment-202507272 relates.
			// [/Comment-202507252]
			blockGasLimit: 30_000_000 * 10_000,

			// initialBaseFeePerGas: 1e9,

			// [Comment-202501193]
			// This configures to deterministically mine a block when we submit a transaction request
			// to execute a non-`view` contract method.
			// Block timestamp increment is always 1 second and is not configurable (see more on this in the issue 3).
			// Issue 1. So we cannot easily test adjacent blocks with equal timestamps.
			// 
			// Issue 2.  Hardhat advances the next block timestamp to at least the current system time.
			// As a result, if `loadFixture` was already called, after it's called again, the next block timestamp can leap by many seconds,
			// so if we need to use the last block timestamp immediately after calling `loadFixture`,
			// we typically must mine a dummy block beforehand.
			// 
			// Issue 3. Even if the last block timestamp is ahead of the current system time,
			// the next block timestamp will be increased by the number of times the system time reached the beginning of a second
			// since the last block was mined.
			// Calling the "evm_increaseTime" JSON RPC method will add the passed value to the above value.
			// Additionally, the next block timestamp will be forced to be bigger than the last one by at least 1,
			// although that functionality can be disabled by the `allowBlocksWithSameTimestamp` parameter.
			// So to increase the chance of deterministic behavior when the current system time is approaching the beginning of a second,
			// we must wait until the next second and then subtract 1 or more from the value we are to pass to "evm_increaseTime".
			//
			// Note that the `initialDate` parameter does not change this behavior. It only changes the initial timestamp,
			// but system time passage still drives timestamp increses.
			// Although a constant `initialDate` makes it possible to replay a test driven by random numbers
			// if we start it with the same random number seed.
			// [/Comment-202501193]
			mining: {
				// // This is `true` by default, which is what we need.
				// auto: false,

				// // This is 0 by default, which is what we need.
				// interval: 1_000,
				// interval: 999_999_999,

				mempool: {
					order: "fifo"
				},
			},
		},
		localhost: {
			url: "http://localhost:8545/",
			// gasMultiplier: 4,
		},
		rinkeby: {
			url: "https://rinkeby.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
			accounts: (process.env.PRIVATE_KEY != undefined) ? [process.env.PRIVATE_KEY] : [],
		},
		sepolia: {
			url: "http://170.187.142.12:22545/",
			accounts: (process.env.SEPOLIA_PRIVATE_KEY != undefined) ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
			// gasMultiplier: 2,
		},
		arbigoerli: {
			url: "https://goerli-rollup.arbitrum.io/rpc",
			accounts: (process.env.PRIVATE_KEY != undefined) ? [process.env.PRIVATE_KEY] : [],
		},
		arbitrumOne: {
			url: "https://arb1.arbitrum.io/rpc",
			accounts: (process.env.MAINNET_PRIVATE_KEY != undefined) ? [process.env.MAINNET_PRIVATE_KEY] : [],
		},
	},

	// #endregion
	// #region

	// [ToDo-202412097-1]
	// Use the "@nomicfoundation/hardhat-verify" plugin.
	// See https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify
	// Uncomment one or both of these settings.
	// Sourcify could be a better option than EtherScan.
	// Write and cross-ref comments here and where we will import "@nomicfoundation/hardhat-verify".
	// Actually "@nomicfoundation/hardhat-toolbox" already imports it.
	// ToDo-202412098-1 relates.
	// [/ToDo-202412097-1]
	// etherscan: {
	// 	apiKey: process.env.API_KEY,
	// },
	// sourcify: {
	// 	enabled: true
	// },

	// #endregion
	// #region
	
	mocha: {
		parallel: true,
		timeout: 2 * 60 * 60 * 1000,
	},

	// #endregion
};

// #endregion
// #region

if (ENABLE_SMTCHECKER >= 2) {
	// See https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description
	// On that page, find: modelChecker
	hardhatUserConfig.solidity.settings.modelChecker = {
		// [Comment-202409013]
		// If you don't list any contracts here, all contracts under the "contracts" folder tree, except abstract ones, will be analyzed.
		// [Comment-202408173]
		// Hardhat preprocessor always preprocesses all Solidity sources, regardless of what you list here, if anything.
		// [/Comment-202408173]
		// [Comment-202409012]
		// Issue. Previously compiled contracts that don't need a recompile won't be analyzed.
		// Therefore we must force-compile them.
		// [/Comment-202409012]
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#verified-contracts
		// [/Comment-202409013]
		contracts: {
			// "contracts/production/CosmicSignatureToken.sol": ["CosmicSignatureToken"],
			// "contracts/production/RandomWalkNFT.sol": ["RandomWalkNFT"],
			// "contracts/production/CosmicSignatureNft.sol": ["CosmicSignatureNft"],
			// "contracts/production/DonatedTokenHolder.sol": ["DonatedTokenHolder"],
			// "contracts/production/PrizesWallet.sol": ["PrizesWallet"],
			// "contracts/production/StakingWalletRandomWalkNft.sol": ["StakingWalletRandomWalkNft"],
			// "contracts/production/StakingWalletCosmicSignatureNft.sol": ["StakingWalletCosmicSignatureNft"],
			// "contracts/production/MarketingWallet.sol": ["MarketingWallet"],
			"contracts/production/CharityWallet.sol": ["CharityWallet"],
			// "contracts/production/CosmicSignatureDao.sol": ["CosmicSignatureDao"],
			// "contracts/production/CosmicSignatureGame.sol": ["CosmicSignatureGame"],
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

		// [Comment-202502057]
		// When we make an external call like `Contract1(address1).method1()`, SMTChecker will, by default, expect that
		// we are calling into potentially malicious code.
		// This parameter results in SMTChecker assuming that we are calling our own known contract.
		// This implies that for this to work correct we must cast an address to a specific contract, rather than to its interface.
		// We also must avoid low level calls, like `call` or `delegatecall`, which SMTChecker doesn't recognize.
		// See https://docs.soliditylang.org/en/latest/smtchecker.html#trusted-external-calls
		// Comment-202502043 relates.
		// [/Comment-202502057]
		extCalls: "trusted",

		// See https://docs.soliditylang.org/en/latest/smtchecker.html#reported-inferred-inductive-invariants
		invariants: [
			// "contract",
			"reentrancy",
		],

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
		// To enable the discovery of those, list them explicitly, together with whatever others.
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
		timeout: 24 * 60 * 60 * 1000,
	};
}

// #endregion
// #region

module.exports = hardhatUserConfig;

// #endregion
