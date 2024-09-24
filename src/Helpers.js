// todo-0 I added this file. Was it a good idea?
// todo-0 Maybe this code belongs to "../scripts/helper.js"?

// #region

"use strict";

// #endregion
// #region parseBooleanEnvironmentVariable

/**
 * @param {string} environmentVariableName
 * @param {boolean} defaultValue
 * @returns {boolean}
 * @throws {Error}
 */
function parseBooleanEnvironmentVariable(environmentVariableName, defaultValue) {
	const rawValue = process.env[environmentVariableName];

	switch (rawValue) {
		case undefined:
			return defaultValue;
		case "true":
			return true;
		case "false":
			return false;
		default:
			throw new Error(`Invalid value for environment variable ${environmentVariableName}: "${rawValue}". Expected "true" or "false".`);
	}
}

// #endregion
// #region parseIntegerEnvironmentVariable

/**
 * @param {string} environmentVariableName
 * @param {number} defaultValue
 * @returns {number}
 * @throws {Error}
 */
function parseIntegerEnvironmentVariable(environmentVariableName, defaultValue) {
	const rawValue = process.env[environmentVariableName];

	if(rawValue === undefined)
	{
		return defaultValue;
	}

	const value = parseInt(rawValue);

	if(isNaN(value))
	{
		throw new Error(`Invalid value for environment variable ${environmentVariableName}: "${rawValue}". Expected an integer.`);
	}
	
	return value;
}

// #endregion
// #region

module.exports = { parseBooleanEnvironmentVariable, parseIntegerEnvironmentVariable };

// #endregion
