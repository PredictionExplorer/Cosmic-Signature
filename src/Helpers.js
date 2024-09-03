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
// #region

module.exports = { parseBooleanEnvironmentVariable };

// #endregion
