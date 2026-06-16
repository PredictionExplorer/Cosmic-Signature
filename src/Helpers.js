// #region

"use strict";

// #endregion
// #region

// [Comment-202409255]
// Because "hardhat.config.js" imports us, an attempt to import "hardhat" here would throw an error.
// So we must do things differently here.
// Issue. A better option could be to add the `hre` parameter to functions that need it.
// [/Comment-202409255]
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

// #endregion
// #region

// I am not sure what the implications of this might be, so considering this an opt-in hack.
{
	const hackSupportBigIntToJson_ = parseBooleanEnvironmentVariable("HACK_SUPPORT_BIGINT_TOJSON", false);
	if (hackSupportBigIntToJson_) {
		if (BigInt.prototype.toJSON === undefined) {
			BigInt.prototype.toJSON =
				function() {
					return this.toString() + "n";
				};
			console.warn("Warning. Assigned to `BigInt.prototype.toJSON`.");
		} else {
			console.error("%s", "Error 202606172.");
		}
	}
}

// #endregion
// #region

/**
[Comment-202510221]
Supported values:
   @ 1 to run tests under the "${workspaceFolder}/test" subfolder deterministically and at the maximum speed.
     This is the value to set in most cases, especially if no blockchain calls will be made.
   @ 2 to simulate a live blockchain, which is designed for tests
     under the "${workspaceFolder}/live-blockchain-testing" subfolder.
[/Comment-202510221]
@type {number}
*/
let HARDHAT_MODE_CODE = parseIntegerEnvironmentVariable("HARDHAT_MODE_CODE", undefined);

switch (HARDHAT_MODE_CODE) {
	case 1:
	case 2: {
		console.info("%s", `HARDHAT_MODE_CODE = ${HARDHAT_MODE_CODE}`);
		break;
	}
	case undefined: {
		console.warn("%s", "Warning. The HARDHAT_MODE_CODE environment variable is not set. Assuming it equals 1.");
		HARDHAT_MODE_CODE = 1;
		break;
	}
	default: {
		throw new Error(`Invalid HARDHAT_MODE_CODE: ${HARDHAT_MODE_CODE}.`);
		// break;
	}
}

// #endregion
// #region

// Disable Hardhat Preprocessor by not setting or setting to "false" this environment variable
// when running any Hardhat task against a mainnet.
// It's to eliminate the risk of Hardhat Preprocessor bugs breaking things.
// If you forget to, we will throw an error near Comment-202408261.
// Comment-202408155 relates.
// Comment-202410099 relates.
const ENABLE_HARDHAT_PREPROCESSOR = parseBooleanEnvironmentVariable("ENABLE_HARDHAT_PREPROCESSOR", false);

// [Comment-202408155]
// This environment variable is ignored and assumed to be `false` when `! ENABLE_HARDHAT_PREPROCESSOR`.
// [/Comment-202408155]
// Comment-202408156 relates and/or applies.
const ENABLE_ASSERTS = ENABLE_HARDHAT_PREPROCESSOR && parseBooleanEnvironmentVariable("ENABLE_ASSERTS", false);

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
const ENABLE_SMTCHECKER = ENABLE_HARDHAT_PREPROCESSOR ? parseIntegerEnvironmentVariable("ENABLE_SMTCHECKER", 0) : 0;

// #endregion
// #region `shuffleArray`

/**
Randomly shuffles the given array using the Fisher-Yates (Knuth) Shuffle algorithm.
@param {array} array_
*/
function shuffleArray(array_) {
	for (let index1_ = array_.length; index1_ >= 2; ) {
		const index2_ = generateRandomUInt32() % index1_;
		-- index1_;
		[array_[index1_], array_[index2_]] = [array_[index2_], array_[index1_]];
	}
}

// #endregion
// #region `generateRandomUInt32`

function generateRandomUInt32() {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const randomBytes_ = hre.ethers.randomBytes(32 / 8);
	const randomNumber_ = hre.ethers.toNumber(randomBytes_);
	return randomNumber_;
}

// #endregion
// #region `generateRandomUInt256`

function generateRandomUInt256() {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const randomBytes_ = hre.ethers.randomBytes(256 / 8);
	const randomBigInt_ = hre.ethers.toBigInt(randomBytes_);
	return randomBigInt_;
}

// #endregion
// #region // `generateRandomUInt256Seed`

// /**
// Comment-202504067 applies.
// [Comment-202504071]
// This is a production function.
// It's not implemented.
// Only a similar test function is implemented.
// [/Comment-202504071]
// */
// function generateRandomUInt256Seed(???) {
// 	return ???;
// }

// #endregion
// #region `generateRandomUInt256FromSeedWrapper`

/** Comment-202504065 applies. */
function generateRandomUInt256FromSeedWrapper(seedWrapper_) {
	const newSeed_ = BigInt.asUintN(256, seedWrapper_.value + 1n);
	seedWrapper_.value = newSeed_;
	const randomNumber_ = generateRandomUInt256FromSeed(newSeed_);
	return randomNumber_;
}

// #endregion
// #region `generateRandomUInt256FromSeed`

/**
Comment-202504063 applies.
@param {bigint} seed_
*/
function generateRandomUInt256FromSeed(seed_) {
	return calculateUInt256HashSumOf(seed_);
}

// #endregion
// #region `calculateUInt256HashSumOf`

/**
Comment-202504061 applies.
@param {bigint} value_
*/
function calculateUInt256HashSumOf(value_) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const hashSumAsString_ = hre.ethers.solidityPackedKeccak256(["uint256"], [value_]);
	const hashSum_ = BigInt(hashSumAsString_);
	return hashSum_;
}

// #endregion
// #region `generateAccountPrivateKeyFromSeed`

/**
@param {bigint} seed_
*/
function generateAccountPrivateKeyFromSeed(seed_) {
	const accountPrivateKeyAsBigInt_ = generateRandomUInt256FromSeed(seed_);
	const accountPrivateKeyAsString_ = uint256ToPaddedHexString(accountPrivateKeyAsBigInt_);
	return accountPrivateKeyAsString_;
}

// #endregion
// #region `parseBooleanEnvironmentVariable`

/**
@template DefaultValue_
@param {string} environmentVariableName_
@param {DefaultValue_} defaultValue_
@throws {Error}
*/
function parseBooleanEnvironmentVariable(environmentVariableName_, defaultValue_) {
	const rawValue_ = process.env[environmentVariableName_];
	switch (rawValue_) {
		case undefined:
		case "":
			return defaultValue_;
		case "true":
			return true;
		case "false":
			return false;
		default:
			throw new Error(`Invalid value for environment variable ${environmentVariableName_}: "${rawValue_}". Expected "true" or "false".`);
	}
}

// #endregion
// #region `parseIntegerEnvironmentVariable`

/**
@template DefaultValue_
@param {string} environmentVariableName_
@param {DefaultValue_} defaultValue_
@throws {Error}
*/
function parseIntegerEnvironmentVariable(environmentVariableName_, defaultValue_) {
	const rawValue_ = process.env[environmentVariableName_];
	if (rawValue_ === undefined || rawValue_.length <= 0) {
		return defaultValue_;
	}
	const value_ = parseInt(rawValue_);
	if (isNaN(value_)) {
		throw new Error(`Invalid value for environment variable ${environmentVariableName_}: "${rawValue_}". Expected an integer.`);
	}
	return value_;
}

// #endregion
// #region `uint32ToPaddedHexString`

/**
@param {number} value_
*/
function uint32ToPaddedHexString(value_) {
	return   "0x" + value_.toString(16).padStart(32 / 8 * 2, "0");
}

// #endregion
// #region `uint256ToPaddedHexString`

/**
@param {bigint} value_
*/
function uint256ToPaddedHexString(value_) {
	// Issue. Can we use `hre.ethers.toBeHex` here?
	return   "0x" + value_.toString(16).padStart(256 / 8 * 2, "0");
}

// #endregion
// #region `sleepForMilliSeconds`

/**
@param {number} durationInMilliSeconds_
*/
function sleepForMilliSeconds(durationInMilliSeconds_) {
	// Issue. This is not the best implementation.
	// It would be better to import "node:timers/promises" and call `await setTimeout(durationInMilliSeconds_)` from there.
	return new Promise((resolve_) => (setTimeout(resolve_, durationInMilliSeconds_)));
}

// #endregion
// #region `getBlockTimeStampByBlockNumber`

/**
@param {string} blockNumber_ This may be "pending", "latest", etc.
*/
async function getBlockTimeStampByBlockNumber(blockNumber_) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const block_ = await hre.ethers.provider.send("eth_getBlockByNumber", [blockNumber_, false,]);
	const blockTimeStamp_ = BigInt(block_.timestamp);
	return blockTimeStamp_;
}

// #endregion
// #region `hackApplyGasMultiplierIfNeeded`

/**
[Comment-202509185]
Sometimes (always?) Hardhat forgets to apply the configured `gasMultiplier`.
This hack fixes that.
This issue is said to have been fixed in Hardhat 3.
Hardhat 2.x is unlikely to receive the same fix, so keep this compatibility shim while the project stays on Hardhat 2.
Comment-202508265 relates.
[/Comment-202509185]
*/
function hackApplyGasMultiplierIfNeeded() {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	// if (hre.network.name != "hardhat_on_localhost") {
	// 	return;
	// }
	const gasMultiplier_ = hre.network.config.gasMultiplier;
	// if (gasMultiplier_ === undefined) {
	// 	return;
	// }
	// if (typeof gasMultiplier_ != "number") {
	// 	throw new Error("Isn't gasMultiplier supposed to be a number?");
	// }
	if (gasMultiplier_ == 1.0) {
		return;
	}
	const originalEstimateGas_ = hre.ethers.provider.estimateGas.bind(hre.ethers.provider);

	// [Comment-202509198]
	// Hardhat uses similar logic to multiply a gas estimate.
	// Similar logic exists in multiple places.
	// [/Comment-202509198]
	hre.ethers.provider.estimateGas =
		async (transactionRequest_) =>
		(BigInt(Math.floor(Number(await originalEstimateGas_(transactionRequest_)) * gasMultiplier_)));
}

// #endregion
// #region `waitForTransactionReceipt`

/**
@param {Promise<import("hardhat").ethers.TransactionResponse>} transactionResponsePromise_
*/
async function waitForTransactionReceipt(transactionResponsePromise_) {
	const transactionResponse_ = await transactionResponsePromise_;
	const transactionReceipt_ = await transactionResponse_.wait();

	// // Testing.
	// {
	// 	// Comment-202409255 applies.
	// 	const hre = HardhatContext.getHardhatContext().environment;
	// 
	// 	const transactionBlock_ = await transactionReceipt_.getBlock();
	// 
	// 	// Comment-202509198 applies.
	// 	// const multipliedGasUsed_ = Math.floor(Number(transactionReceipt_.gasUsed) * hre.network.config.gasMultiplier);
	// 	const originalGasEstimate_ = Math.ceil(Number(transactionResponse_.gasLimit) / hre.network.config.gasMultiplier);
	// 	const gasUnusedFromOriginalGasEstimate_ = originalGasEstimate_ - Number(transactionReceipt_.gasUsed);
	// 	const gasUnusedAsFractionOfOriginalGasEstimate_ = gasUnusedFromOriginalGasEstimate_ / originalGasEstimate_;
	// 
	// 	console.info(
	// 		"%s",
	// 		`202509184 ` +
	// 		`${transactionBlock_.number} ` +
	// 		`${transactionResponse_.gasLimit} ` +
	// 		`${originalGasEstimate_} ` +
	// 		`${transactionReceipt_.gasUsed} ` +
	// 		`${gasUnusedFromOriginalGasEstimate_} ` +
	// 		`${gasUnusedAsFractionOfOriginalGasEstimate_.toPrecision(2)}`
	// 	);
	// }

	return transactionReceipt_;
}

// #endregion
// #region `safeErc1967GetChangedImplementationAddress`

/**
[Comment-202510208]
Issue. ChatGPT says that `HardhatRuntimeEnvironment.upgrades.upgradeProxy` doesn't wait
for the upgrade transaction to be mined.
So we need this ugly function to reliably get the new implementation contract address.
A more correct solution would be to find and parse the `IERC1967.Upgraded` event.
But we would still have to wait for the transaction and its block to be mined.
It would also be helpful to throw an error if we observe that another block has been mined and/or a timeout expired,
but the implementation contract address has not changed. But if the upgrade transaction is still pending at that point,
it would still likely be mined later.
So keeping it simple for now.
[/Comment-202510208]
@param {string} proxyAddress_
@param {string} oldImplementationAddress_
@dev Issue. Should this method have the word `wait` in its name?
*/
async function safeErc1967GetChangedImplementationAddress(proxyAddress_, oldImplementationAddress_) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	for (;;) {
		{
			const newImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_);
			if (newImplementationAddress_ != oldImplementationAddress_) {
				return newImplementationAddress_;
			}
		}
		console.warn("%s", "Warning. We have to wait for the contract upgrade transaction to be mined.");
		await sleepForMilliSeconds(2000);
	}
}

// #endregion
// #region

module.exports = {
	HARDHAT_MODE_CODE,
	ENABLE_HARDHAT_PREPROCESSOR,
	ENABLE_ASSERTS,
	ENABLE_SMTCHECKER,
	shuffleArray,
	generateRandomUInt32,
	generateRandomUInt256,
	// generateRandomUInt256Seed,
	generateRandomUInt256FromSeedWrapper,
	generateRandomUInt256FromSeed,
	calculateUInt256HashSumOf,
	generateAccountPrivateKeyFromSeed,
	parseBooleanEnvironmentVariable,
	parseIntegerEnvironmentVariable,
	uint32ToPaddedHexString,
	uint256ToPaddedHexString,
	sleepForMilliSeconds,
	getBlockTimeStampByBlockNumber,
	hackApplyGasMultiplierIfNeeded,
	waitForTransactionReceipt,
	safeErc1967GetChangedImplementationAddress,
};

// #endregion
