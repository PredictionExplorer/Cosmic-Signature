"use strict";

// [Comment-202506016]
// Execute the "./eslint/eslint-1.bash" script.
// To find missing `await` keywords, in the ESLint report file, find:
// @typescript-eslint/no-floating-promises
// [/Comment-202506016]

const globals = require("globals");
const esLintJs = require("@eslint/js");
const typeScriptEsLint = require("typescript-eslint");
const stylisticEsLintPlugin = require("@stylistic/eslint-plugin");

const esLintConfigArray =
	typeScriptEsLint.config(
		[
			{
				ignores: [
					"coverage/**",
				],
				plugins: {
					"@typescript-eslint": typeScriptEsLint.plugin,
					"@stylistic-eslint-plugin": stylisticEsLintPlugin,
				},
				languageOptions: {
					parser: typeScriptEsLint.parser,
					parserOptions: {
						projectService: true,
						tsconfigRootDir: __dirname,
						// sourceType: "script",
					},
					// globals: {
					// 	...globals.node,
					// },
					globals: globals.node,
				},
				extends: [
					esLintJs.configs.recommended,
					typeScriptEsLint.configs.recommendedTypeChecked,

					// // Issue. This generates a zillion lints.
					// stylisticEsLintPlugin.configs.recommended,
				],
				rules: {
					"@typescript-eslint/no-require-imports": "off",
					"@typescript-eslint/no-unsafe-assignment": "off",
					"@typescript-eslint/no-unsafe-call": "off",
					"@typescript-eslint/no-unsafe-member-access": "off",
					"@typescript-eslint/no-unsafe-argument": "off",
					"@typescript-eslint/no-unsafe-return": "off",
					"@stylistic-eslint-plugin/semi": ["warn", "always",],
					"@stylistic-eslint-plugin/semi-style": ["warn", "last",],
					"@stylistic-eslint-plugin/no-extra-semi": "warn",
				},
			},
		]
	);

module.exports = esLintConfigArray;
