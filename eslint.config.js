"use strict";

// [Comment-202506016]
// Execute the "./eslint/eslint-1.bash" script.
// [/Comment-202506016]


// import js from "@eslint/js";
// import globals from "globals";
// import { defineConfig } from "eslint/config";
//
// export default defineConfig([
//   { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
//   { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
//   { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: globals.browser } },
// ]);


const esLintJs = require("@eslint/js");
const typeScriptEsLintParser = require("@typescript-eslint/parser");

// // Issue. This misses missing `await`s.
// const esLintPluginNoFloatingPromise = require("eslint-plugin-no-floating-promise");

const typeScriptEsLintEsLintPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
	{
		// // This will anyway be ignored even if we don't list this here.
		// ignores: ["node_modules/**"],

		ignores: ["coverage/**"],
	},
	{
		plugins: {
			// noFloatingPromise: esLintPluginNoFloatingPromise,
			esLintPlugin: typeScriptEsLintEsLintPlugin,
		},

		// parser / env settings
		languageOptions: {
			parser: typeScriptEsLintParser,
			parserOptions: {
				project: "./jsconfig.json",

				// Comment-202505308 applies.
				ecmaVersion: 2022,
				// sourceType: "module", // or "script" if you're not using imports
				sourceType: "script",
			},
			globals: {
				// // browser globals
				// window: "readonly",
				// document: "readonly",
				// navigator: "readonly",

				// node globals
				process: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				module: "readonly",
				require: "readonly",
				console: "readonly",
			},
		},

		rules: {
			// spread in all eslint:recommended rules
			...esLintJs.configs.recommended.rules,
	
			// // Enable the no-floating-promise rule.
			// "noFloatingPromise/no-floating-promise": "error",

			// Enable the TS "no-floating-promises" rule.
			"esLintPlugin/no-floating-promises": "error",
		},
	},
];
