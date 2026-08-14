// #region

"use strict";

// #endregion
// #region

const nodeFsModule = require("node:fs");

// Comment-202409255 relates.
const helpersModule = require("./src/Helpers.js");

// #endregion
// #region

// [Comment-202608134]
// `slither-check-upgradeability` cannot find a contract that lives in a different compilation unit
// than the old contract, and the per-file compiler settings override near Comment-202608121 splits
// `CosmicSignatureGameV3` into its own compilation unit.
// So the Slither scripts set this environment variable, which disables the override
// and compiles everything uniformly into a separate folder.
// The uniformly compiled `CosmicSignatureGameV3` bytecode exceeds the max allowed size,
// but that's inconsequential for static analysis.
// [/Comment-202608134]
const uniformCompilationForSlither = helpersModule.parseBooleanEnvironmentVariable("SLITHER_UNIFORM_BUILD", false);

// [Comment-202503272]
// The use of different folders prevents a recompile of some Solidity sources
// when using a different combination of environment variables.
// [/Comment-202503272]
// [Comment-202503302]
// A similar folder name exists in multiple places.
// [/Comment-202503302]
const solidityCompilationCacheSubFolderName =
	uniformCompilationForSlither ?
	"slither-uniform" :
	(
		helpersModule.ENABLE_HARDHAT_PREPROCESSOR ?
		`debug-${helpersModule.ENABLE_ASSERTS}-${helpersModule.ENABLE_SMTCHECKER > 0}` :
		"production"
	);

// #endregion
// #region

// [Comment-202409011]
// Issue. Hardhat would automatically install `solc-js`, but `solc-js` terminates with an error when SMTChecker is enabled.
// It could be a solc-js bug.
// So we must tell Hardhat to use the binary `solc` of the given version.
// Remember to manually install it.
// One option is to install the `solc` package globally:
//    `sudo add-apt-repository ppa:ethereum/ethereum`
//    `sudo apt install solc`
// Update: From Solidity 0.8.31 ChangeLog: Ubuntu PPA Packages: Discontinue the PPA as a binary distribution channel.
// Another, arguably better option is to use the `solc-select` tool.
// It's documented at https://github.com/crytic/solc-select .
// After you install it, to switch to a particular solc version, use this command:
//    solc-select use 0.8.34 --always-install
// It's OK if afterwards you switch to a different version. As long as the given version remains installed, we will find and use it.
//
// Update 1. It turns out that just like `solc-js`, `solc` installed with `solc-select` also fails when SMTChecker is enabled.
// So you must install `solc` globally.
// You can still use `solc` installed with `solc-select` when you don't need SMTChecker.
//
// Update 2. On the cosmic2 server, even the globally installed `solc` didn't work.
// Installing the `z3` package fixed that:
//    `sudo apt install z3`
// Now even `solc` installed with `solc-select` works. So it's actually unnecessary to install `solc` globally.
// todo-3 Test if `solc-js` works too.
//
// Note that Hardhat will not necessarily validate `solc` of what version it's executing,
// so it's your responsibility to correctly configure all the relevant parameters that reference this comment.
// Note that if your system is configured to install updates automatically and you installed the `solc` package globally,
// the package can be updated at any moment, so you might want to disable quiet automatic updates.
// [/Comment-202409011]

// Comment-202409011 applies.
// todo-1 Periodically check out known Solidity compiler bugs at https://www.soliditylang.org/blog/category/security-alerts/ .
// [ToDo-202409098-2]
// When changing this, remember to revisit the configuration near Comment-202411136, Comment-202408026, Comment-202408025.
// [/ToDo-202409098-2]
const solidityVersion = "0.8.34";

// Comment-202409011 applies.
// [Comment-202411136]
// Hardhat docs says that this is used as extra information in the build-info files, but other than that is not important.
// To find out this value, execute:
//    `solc --version`
// Make sure you are executing the executable pointed at by the `solidityCompilerPath` variable.
// We log it near Comment-202411143.
//
// 2025-08 Update.
// The binary `solc` long version looks like "0.8.XX+commit.1234abcd.Linux.g++".
// Problem is that's too long for EtherScan. It dislikes the ".Linux.g++" suffix.
// The supported versions listed at https://etherscan.io/solcversions contain no suffixes.
// `solc-js` is said to report its version without the suffix.
// So we must do the same here.
// [/Comment-202411136]
const solidityCompilerLongVersion = solidityVersion + "+commit.80d5c536";

// Comment-202409011 applies.
// Comment-202411136 relates.
let solidityCompilerPath;
const solidityCompilerPathGlobal = "/usr/bin/solc";
// if (helpersModule.ENABLE_SMTCHECKER < 2) {
	solidityCompilerPath = `${process.env.HOME}/.solc-select/artifacts/solc-${solidityVersion}/solc-${solidityVersion}`;
	if ( ! nodeFsModule.statSync(solidityCompilerPath, {throwIfNoEntry: false,})?.isFile() ) {
		solidityCompilerPath = `${process.env.HOME}/.local/bin/solc`;
		if ( ! nodeFsModule.statSync(solidityCompilerPath, {throwIfNoEntry: false,})?.isFile() ) {
			solidityCompilerPath = solidityCompilerPathGlobal;
		}
	}
// } else {
// 	solidityCompilerPath = solidityCompilerPathGlobal;
// }

// #endregion
// #region

if (helpersModule.ENABLE_HARDHAT_PREPROCESSOR) {
	console.warn("%s", "Warning. Hardhat Preprocessor is enabled. Assuming it's intentional.");
	if (helpersModule.ENABLE_SMTCHECKER <= 0 && ( ! helpersModule.ENABLE_ASSERTS )) {
		// [Comment-202409025/]
		console.warn("%s", "Warning. Neither the preprocessing for SMTChecker nor asserts are enabled. Assuming it's intentional.");
	}
	if (helpersModule.ENABLE_SMTCHECKER > 0 && ( ! helpersModule.ENABLE_ASSERTS )) {
		console.warn("%s", "Warning. The preprocessing for SMTChecker is enabled, but asserts are disabled. Is it intentional?");
	}
	if (helpersModule.ENABLE_SMTCHECKER >= 2) {
		console.info("%s", "SMTChecker execution is enabled.");
	}
} else {
	console.warn("%s", "Warning. Hardhat Preprocessor is disabled. Assuming it's intentional.");
}

// [Comment-202411143/]
// Comment-202409011 relates.
// Comment-202411136 relates.
console.warn("%s", `Warning. Make sure \`${solidityCompilerPath}\` version is \`${solidityCompilerLongVersion}\`. Hardhat will not necessarily validate that.`);

// #endregion
// #region

// const nodeOsModule = require("node:os");

// This imports a bunch of Hardhat packages. Don't import them here.
require("@nomicfoundation/hardhat-toolbox");

const { subtask } = require("hardhat/config");
if (helpersModule.ENABLE_HARDHAT_PREPROCESSOR) {
	require("hardhat-preprocessor");
}

// // [Comment-202510064]
// // I feel that we don't need this.
// // ABIs of all contracts are anyway created under the `artifacts` folder on compile.
// // I have deleted the following from the `package.json` file:
// // `"hardhat-abi-exporter": "~2.11.0"`,
// // [/Comment-202510064]
// require("hardhat-abi-exporter");

// // Issue. After I upgraded to Hardhat 2.26.1, this import started to cause all Solidity files recompile
// // on each Hardhat Test task run. So I have commented it out and deleted the following line from `package.json`:
// // `"hardhat-docgen": "~1.3.0"`,
// require("hardhat-docgen");

require("@nomiclabs/hardhat-solhint");
if (process.env["DISABLE_HARDHAT_TRACER"] != "true") { require("hardhat-tracer"); }

// // It appears that it's unnecessary to include this into `package.json` or import this.
// require("@nomiclabs/hardhat-etherscan");

const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, } = require("hardhat/builtin-tasks/task-names");
require("@openzeppelin/hardhat-upgrades");

// Comment-202409255 relates.
require("./tasks/src/cosmic-signature-tasks.js");

// #endregion
// #region

/** @type {boolean | undefined} */
let networkIsMainNet = undefined;

/**
@param {import("hardhat")} hre
*/
function populateNetworkIsMainNetOnce(hre) {
	if (networkIsMainNet !== undefined) {
		return;
	}

	// [Comment-202408313]
	// To be safe, checking if the network is a known testnet. Otherwise we will suspect that it could be a mainnet.
	// [/Comment-202408313]
	switch (hre.network.name) {
		case "hardhat":
		case "hardhat_on_localhost":
		case "sepolia":
		case "arbitrumSepolia": {
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
	async (args/*, hre, runSuper*/) => {
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
		
		throw new Error(`Hardhat is trying to use a wrong Solidity compiler version: \`${args.solcVersion}\`.`);

		// // Calling the default implementation.
		// return runSuper();
	}
);

// #endregion
// #region

const solidityLinePreProcessingRegExp = helpersModule.ENABLE_HARDHAT_PREPROCESSOR ? createSolidityLinePreProcessingRegExp() : undefined;

function createSolidityLinePreProcessingRegExp() {
	const regExpPatternPart1 =
		(helpersModule.ENABLE_ASSERTS ? "enable_asserts" : "disable_asserts") +
		"|" +
		((helpersModule.ENABLE_SMTCHECKER > 0) ? "enable_smtchecker" : "disable_smtchecker");
	const regExpPatternPart2 = `\\/\\/[ \\t]*\\#(?:${regExpPatternPart1})(?: |\\b)`;
	const regExpPattern = `^([ \\t]*)${regExpPatternPart2}(?:[ \\t]*${regExpPatternPart2})*`;
	const regExp = new RegExp(regExpPattern, "s");
	return regExp;
}

// #endregion
// #region

/**
@param {import("hardhat")} hre
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

/**
Creates a Solidity compiler settings object.
Comment-202608121 relates.
@param {number} optimizerRuns_
@param {boolean} minimizeBytecodeSize_ When `true`, the compiler will not append the CBOR metadata section,
which includes the metadata hash, to the contract bytecode, which makes the bytecode a little smaller.
Source code verification on EtherScan/Arbiscan still works without it.
*/
function createSoliditySettings(optimizerRuns_, minimizeBytecodeSize_ = false, yulOptimizerSteps_ = undefined) {
	return {
		...(minimizeBytecodeSize_ ? {metadata: {appendCBOR: false, bytecodeHash: "none",},} : {}),
		// [Comment-202408026]
		// By default, this is "paris".
		// See https://v2.hardhat.org/hardhat-runner/docs/config#default-evm-version
		// But we want this to be the latest Arbitrum-compatible.
		// [/Comment-202408026]
		evmVersion: "osaka",

		// [Comment-202408025]
		// See https://v2.hardhat.org/hardhat-runner/docs/reference/solidity-support
		// [/Comment-202408025]
		// Is this going to become `true` by default in a future Solidity version?
		// As of the 0.8.34, this is `false` by default.
		viaIR: true,

		// Comment-202408025 applies.
		optimizer: {
			enabled: true,

			// By default, this is 200.
			// A big value here can cause excessive inlining, which can results in the Game contract bytecode size
			// exceeding the max allowed limit.
			// Comment-202608121 relates.
			runs: optimizerRuns_,

			...((yulOptimizerSteps_ !== undefined) ?
				{
					details: {
						yulDetails: {
							optimizerSteps: yulOptimizerSteps_,
						},
					},
				} :
				{}
			),

			// details: {
			// 	yulDetails: {
			// 		// Hardhat docs at https://v2.hardhat.org/hardhat-runner/docs/reference/solidity-support says that
			// 		// this setting makes Hardhat "work as well as possible".
			// 		// Issue. But it appears to increase contract binary size and, possibly, gas use.
			// 		// So we not necessarily need this.
			// 		// Although it could make sense to enable this if Hardhat Preprocessor is enabled.
			// 		optimizerSteps: "u",
			// 	},
			// },
		},

		// // This appears to be a legacy setting.
		// // The latest Hardhat 2.x ignores this.
		// outputSelection: {
		// 	"*": {
		// 		"*": [
		// 			"storageLayout",
		// 			// "ir",
		// 			// "irOptimized",
		// 			// "bytecode",
		// 		],
		// 	},
		// },
	};
}

/** @type {import("hardhat/config").HardhatUserConfig} */
const hardhatUserConfig = {
	// #region

	paths: {
		// Comment-202503272 relates.
		cache: "./cache/" + solidityCompilationCacheSubFolderName,
		artifacts: "./artifacts/" + solidityCompilationCacheSubFolderName,

		tests: "./test/tests-src",
	},

	// #endregion
	// #region

	solidity: {
		compilers: [
			{
				version: solidityVersion,
				settings: createSoliditySettings(400),
			},
		],

		// [Comment-202608121]
		// `CosmicSignatureGameV3` deployed bytecode size exceeds the EIP-170 limit of 24576 bytes
		// when compiled with `runs: 400` (25600 bytes as of 2026-08).
		// A lower `runs` value reduces inlining, which brings it under the limit,
		// at the cost of a small runtime gas increase for this one contract.
		// Other contracts keep the default settings configured above.
		// Note that this must be the `compilers` array form rather than the single-compiler shorthand,
		// because Hardhat ignores `overrides` when the shorthand is used.
		// Comment-202608134 relates.
		// [/Comment-202608121]
		overrides:
			uniformCompilationForSlither ?
			{} :
			{
				"contracts/production/CosmicSignatureGameV3.sol": {
					version: solidityVersion,
					settings: createSoliditySettings(1, true),
				},
			},
	},

	// #endregion
	// #region

	// The `hardhat-preprocessor` package configuration.
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
						// enableAsserts: helpersModule.ENABLE_ASSERTS,
						// enableSmtChecker: helpersModule.ENABLE_SMTCHECKER > 0,
					},

					// // This undocumented parameter appears to make it possible to specify what files to preprocess.
					// // It appears to be unnecessary to configure this.
					// // Comment-202408173 relates.
					// files: "???",

					transform: (line) => (preProcessSolidityLine(hre, line)),
				}
			),
	},

	// #endregion
	// #region //

	// // Comment-202510064 applies.
	// abiExporter: {
	// 	// [Comment-202408024]
	// 	// This folder name exists in multiple places.
	// 	// [/Comment-202408024]
	// 	path: "./abi",
	//
	// 	// runOnCompile: true,
	// 	clear: true,
	// 	flat: true,
	//
	// 	// todo-9 This list is incomplete.
	// 	only: [
	// 		"CosmicSignatureToken",
	// 		"RandomWalkNFT",
	// 		"CosmicSignatureNft",
	// 		"PrizesWallet",
	// 		"CharityWallet",
	// 		"CosmicSignatureDao",
	// 		// "CosmicSignatureGameProxy",
	// 	],
	//
	// 	spacing: 2,
	// 	pretty: true,
	// },

	// #endregion
	// #region

	// todo-2 When making changes to the networks, remember to refactor the logic near Comment-202408313.
	networks: {
		hardhat: {
			// [Comment-202608131]
			// When the `FORK_RPC_URL` environment variable is set, the in-process Hardhat Network forks the given
			// live blockchain. `FORK_BLOCK_NUMBER` optionally pins the fork block, which makes runs deterministic
			// and cacheable. This is used by "tasks/src/fork-rehearse-cosmic-signature-game-v3-upgrade.js"
			// (Comment-202608128).
			// It has to be configured statically here, rather than at runtime via "hardhat_reset",
			// because in the current Hardhat version resetting into a fork fails with
			// "Storage overrides are not supported for forked blocks yet"
			// (see https://github.com/NomicFoundation/edr/issues/911 ).
			// [/Comment-202608131]
			forking:
				((process.env["FORK_RPC_URL"] ?? "").length > 0) ?
				{
					url: process.env["FORK_RPC_URL"],
					blockNumber: ((process.env["FORK_BLOCK_NUMBER"] ?? "").length > 0) ? Number.parseInt(process.env["FORK_BLOCK_NUMBER"]) : undefined,
				} :
				undefined,

			// Comment-202608131 relates.
			// Without a hardfork activation history, executing calls on or before the fork block fails with
			// "No known hardfork for execution on historical block".
			// Treating the whole history as the latest hardfork is adequate for our purposes,
			// given that we fork at a recent block.
			// Note that this EDR version appears to not support "osaka" here; "cancun" works.
			// Cancun supports the transient storage opcodes, which our contracts use.
			chains:
				((process.env["FORK_RPC_URL"] ?? "").length > 0) ?
				{
					// Arbitrum One.
					42161: {hardforkHistory: {cancun: 0,},},

					// Arbitrum Sepolia.
					421614: {hardforkHistory: {cancun: 0,},},
				} :
				undefined,

			chainId: 31337,

			// Comment-202501193 relates and/or applies.
			// We also use this near Comment-202510196.
			// Comment-202608131 relates (no initial date on a forked blockchain; its timestamps come from the fork block).
			initialDate: (helpersModule.HARDHAT_MODE_CODE == 1 && (process.env["FORK_RPC_URL"] ?? "").length <= 0) ? "2025-01-01" : undefined,

			// By default, this is `false`.
			// Comment-202501193 relates and/or applies.
			allowBlocksWithSameTimestamp: (helpersModule.HARDHAT_MODE_CODE != 2) ? false : true,

			// Comment-202608131 relates. When rehearsing an upgrade on a fork, we want the real EIP-170 limit
			// to be enforced, so that deploying an oversized implementation fails, like it would in the production.
			allowUnlimitedContractSize: ((process.env["FORK_RPC_URL"] ?? "").length > 0) ? false : true,

			// [Comment-202507272]
			// Providing a particular value, rather than "auto", improves Hardhat Network performance.
			// By default, this value is taken from `blockGasLimit`.
			// But, as explained in Comment-202510018, the "auto" is not always honored.
			// We also use this near Comment-202508223.
			// Comment-202507252 relates.
			// Comment-202508265 relates and/or applies.
			// [/Comment-202507272]
			// [Comment-202508267]
			// Similar magic numbers exist in multiple places.
			// [/Comment-202508267]
			gas: (helpersModule.HARDHAT_MODE_CODE == 1) ? 30_000_000 : "auto",

			// // [Comment-202509209]
			// // We also use this near Comment-202509185.
			// // [/Comment-202509209]
			// gasMultiplier: 1.0,

			// [Comment-202507252]
			// By default, this is 30_000_000.
			// When automining is disabled and the `gas` parameter is a fraction of this,
			// a bigger value allows to mine many transactions per block with a single "evm_mine".
			// Comment-202507272 relates.
			// Comment-202508265 relates and/or applies.
			// [/Comment-202507252]
			// Comment-202508267 applies.
			blockGasLimit: 10_000 * 30_000_000,

			// // Comment-202505294 relates.
			// initialBaseFeePerGas: 1e9,
			// minGasPrice: 100,

			// [Comment-202501193]
			// When `HARDHAT_MODE_CODE` is 1, this configures to deterministically mine a block
			// when a transaction request arrives.
			// Block timestamp increment is always 1 second and is not configurable, with caveats described in the issue 3.
			// Issue 1. So we cannot easily test adjacent blocks with equal timestamps.
			// 
			// Issue 2.  Hardhat Network advances the next block timestamp to at least the current system time.
			// As a result, if `loadFixture` was already called, after it's called again, the next block timestamp can leap by many seconds
			// from the "latest" block timestamp.
			// If that's undesirable, these are possible options to prevent that.
			// (1) Set the next block timestamp to the "latest" block timestamp plus 1.
			// (2) Mine a dummy block.
			// (3) For a more deterministic behavior, set the next block timestamp to a constant in the future and mine a dummy block,
			//     which we do near Comment-202510198.
			// 
			// Issue 3. Even if the last block timestamp is ahead of the current system time,
			// the next block timestamp will be increased by the number of times the system time reached the beginning of a second
			// since the last block was mined.
			// Calling the "evm_increaseTime" JSON RPC method will add its argument to the above value.
			// Additionally, the next block timestamp will be forced to be bigger than the last one by at least 1,
			// although that functionality can be disabled by the `allowBlocksWithSameTimestamp` parameter.
			// So to increase the chance of deterministic behavior when the current system time is approaching the beginning of a second,
			// we must wait until the next second and then subtract 1 (or more) from the value we are to pass to "evm_increaseTime".
			//
			// Note that a constant `initialDate` parameter does not change the behavior. It only changes the initial block time.
			// System time passage still drives block time increses.
			// [/Comment-202501193]
			mining: {
				// By default, this is `true`.
				auto: (helpersModule.HARDHAT_MODE_CODE == 1) ? true : false,

				// By default, this is 0.
				interval: (helpersModule.HARDHAT_MODE_CODE == 1) ? 0 : 100,

				mempool: {
					// By default, this is "priority".
					order: (helpersModule.HARDHAT_MODE_CODE == 1) ? "fifo" : "priority",
				},
			},

			// loggingEnabled: false,
		},
		hardhat_on_localhost: {
			chainId: 31337,
			url: "http://localhost:8545/",

			// Comment-202509209 applies.
			gasMultiplier: 1.4,
		},
		sepolia: {
			chainId: 11155111,
			url:
				// "http://170.187.142.12:22545/",
				"https://ethereum-sepolia.publicnode.com",

			// Comment-202509209 applies.
			gasMultiplier: 1.4,

			// accounts: ((process.env.SEPOLIA_PRIVATE_KEY ?? "").length > 0) ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
		},
		arbitrumSepolia: {
			chainId: 421614,
			url: "https://sepolia-rollup.arbitrum.io/rpc",

			// Comment-202509209 applies.
			gasMultiplier: 1.4,

			// accounts: ((process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY ?? "").length > 0) ? [process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY] : [],
		},
		arbitrumOne: {
			chainId: 42161,
			url: "https://arb1.arbitrum.io/rpc",

			// Comment-202509209 applies.
			gasMultiplier: 1.4,

			// accounts: ((process.env.MAINNET_PRIVATE_KEY ?? "").length > 0) ? [process.env.MAINNET_PRIVATE_KEY] : [],
		},
	},

	// #endregion
	// #region

	// Comment-202509112 relates.
	etherscan: {
		// apiKey: process.env.ETHERSCAN_API_KEY,
	},

	// #endregion
	// #region //

	// // [Comment-202509112]
	// // It appears that we can get by without this.
	// // [/Comment-202509112]
	// sourcify: {
	// 	enabled: true,
	// },

	// #endregion
	// #region

	mocha: {
		parallel: true,
		// jobs: nodeOsModule.availableParallelism(),
		timeout: 12 * 60 * 60 * 1000,

		// Comment-202508265 relates and/or applies.
		require: ["./src/MochaHooks.js",],
	},

	// #endregion
};

// #endregion
// #region

if (helpersModule.ENABLE_SMTCHECKER >= 2) {
	// See https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description
	// On that page, find: modelChecker
	// Comment-202608121 relates.
	const modelCheckerSettings = {
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
		// todo-3 This list is incomplete.
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

	// Applying to all compilation jobs, including the per-file overrides.
	// Comment-202608121 relates.
	for (const solidityCompilerConfig of hardhatUserConfig.solidity.compilers) {
		solidityCompilerConfig.settings.modelChecker = modelCheckerSettings;
	}
	for (const solidityCompilerConfig of Object.values(hardhatUserConfig.solidity.overrides)) {
		solidityCompilerConfig.settings.modelChecker = modelCheckerSettings;
	}
}

// #endregion
// #region

module.exports = hardhatUserConfig;

// #endregion
