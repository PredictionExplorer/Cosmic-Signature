"use strict";

// [Comment-202506016]
// Execute the "./eslint/eslint-1.bash" script.
// To find missing `await` keywords, in the ESLint report file, find:
// @typescript-eslint/no-floating-promises
// [/Comment-202506016]

const globals = require("globals");
const esLintJs = require("@eslint/js");
const typeScriptEsLint = require("typescript-eslint");

const esLintConfigArray =
	typeScriptEsLint.config(
		[
			{
				ignores: [
					"coverage/**",
				],
				plugins: {
					"@typescript-eslint": typeScriptEsLint.plugin,
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
				],
				rules: {
					"@typescript-eslint/no-require-imports": "off",
					"@typescript-eslint/no-unsafe-assignment": "off",
					"@typescript-eslint/no-unsafe-call": "off",
					"@typescript-eslint/no-unsafe-member-access": "off",
					"@typescript-eslint/no-unsafe-argument": "off",
					"@typescript-eslint/no-unsafe-return": "off",
				},
			},
		]
	);

module.exports = esLintConfigArray;
