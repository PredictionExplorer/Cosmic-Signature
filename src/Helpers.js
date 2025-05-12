// #region Comment

// See also: "../scripts/helpers.js".

// #endregion
// #region

"use strict";

// #endregion
// #region

// Comment-202409255 applies.
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

// #endregion
// #region `generateRandomUInt32`

function generateRandomUInt32() {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const randomBytes_ = hre.ethers.randomBytes(4);
	const randomNumber_ = hre.ethers.toNumber(randomBytes_);
	return randomNumber_;
}

// #endregion
// #region `generateRandomUInt256`

function generateRandomUInt256() {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const randomBytes_ = hre.ethers.randomBytes(32);
	const randomBigInt_ = hre.ethers.toBigInt(randomBytes_);
	return randomBigInt_;
}

// #endregion
// #region // `generateRandomUInt256Seed`

// /// [Comment-202504071]
// /// Issue. This doesn't work, at least on Hardhat Network, because:
// /// In Solidity, `block.prevrandao` is a nonzero, while in JavaScript `block.prevRandao` is zero.
// /// In Solidity, `block.basefee` is zero, while in JavaScript `block.baseFeePerGas` is a nonzero.
// /// todo-1 ??? Actually `block.basefee` is zero if we call it from a `view` method after the transaction has completed.
// /// todo-1 +++ Find all (case insensitive; not whole word; reg exp): basefee|prevrandao
// /// todo-1 +++ Add asserts in both Solidity and JavaScript to check that those are nonzeros.
// /// [/Comment-202504071]
// /// Comment-202504067 applies.
// function generateRandomUInt256Seed(block) {
// 	// todo-9 Don't call `expect` in this file.
// 	expect(block.prevRandao > 0n);
// 	expect(block.baseFeePerGas > 0n);
//
// 	return BigInt(block.prevRandao) ^ block.baseFeePerGas;
// }

// #endregion
// #region `generateRandomUInt256FromSeedWrapper`

/// Comment-202504065 applies.
function generateRandomUInt256FromSeedWrapper(seedWrapper_) {
	const newSeed_ = BigInt.asUintN(256, seedWrapper_.value + 1n);
	seedWrapper_.value = newSeed_;
	const randomNumber_ = generateRandomUInt256FromSeed(newSeed_);
	return randomNumber_;
}

// #endregion
// #region `generateRandomUInt256FromSeed`

/**
 * Comment-202504063 applies.
 * @param {bigint} seed_
 */
function generateRandomUInt256FromSeed(seed_) {
	return calculateUInt256HashSumOf(seed_);
}

// #endregion
// #region `calculateUInt256HashSumOf`

/**
 * Comment-202504061 applies.
 * @param {bigint} value_
 */
function calculateUInt256HashSumOf(value_) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const hashSumAsString_ = hre.ethers.solidityPackedKeccak256(["uint256"], [value_]);
	const hashSum_ = BigInt(hashSumAsString_);
	return hashSum_;
}

// #endregion
// #region `parseBooleanEnvironmentVariable`

/**
 * @param {string?} environmentVariableName_
 * @param {boolean} defaultValue_
 * @returns {boolean}
 * @throws {Error}
 */
function parseBooleanEnvironmentVariable(environmentVariableName_, defaultValue_) {
	const rawValue_ = process.env[environmentVariableName_];

	switch (rawValue_) {
		case undefined:
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
 * @param {string?} environmentVariableName_
 * @param {number} defaultValue_
 * @returns {number}
 * @throws {Error}
 */
function parseIntegerEnvironmentVariable(environmentVariableName_, defaultValue_) {
	const rawValue_ = process.env[environmentVariableName_];

	if (rawValue_ === undefined) {
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
 * @param {number} value_
 */
function uint32ToPaddedHexString(value_) {
	return   "0x" + value_.toString(16).padStart(8, "0");
}

// #endregion
// #region `uint256ToPaddedHexString`

/**
 * @param {bigint} value_
 */
function uint256ToPaddedHexString(value_) {
	return   "0x" + value_.toString(16).padStart(64, "0");
}

// #endregion
// #region

module.exports = {
	generateRandomUInt32,
	generateRandomUInt256,
	// generateRandomUInt256Seed,
	generateRandomUInt256FromSeedWrapper,
	generateRandomUInt256FromSeed,
	calculateUInt256HashSumOf,
	parseBooleanEnvironmentVariable,
	parseIntegerEnvironmentVariable,
	uint32ToPaddedHexString,
	uint256ToPaddedHexString,
};

// #endregion
