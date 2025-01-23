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
// #region `generateRandomUInt256`

function generateRandomUInt256() {
	// Comment-202409255 applies.
	const hre_ = HardhatContext.getHardhatContext().environment;

	const randomBytes_ = hre_.ethers.randomBytes(32);
	const randomBigInt_ = hre_.ethers.toBigInt(randomBytes_);
	return randomBigInt_;
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

	if(rawValue_ === undefined)
	{
		return defaultValue_;
	}

	const value_ = parseInt(rawValue_);

	if(isNaN(value_))
	{
		throw new Error(`Invalid value for environment variable ${environmentVariableName_}: "${rawValue_}". Expected an integer.`);
	}
	
	return value_;
}

// #endregion
// #region

module.exports = {
	generateRandomUInt256,
	parseBooleanEnvironmentVariable,
	parseIntegerEnvironmentVariable,
};

// #endregion
