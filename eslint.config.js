"use strict";


// import js from "@eslint/js";
// import globals from "globals";
// import { defineConfig } from "eslint/config";
//
// export default defineConfig([
//   { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
//   { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
//   { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: globals.browser } },
// ]);


const js = require("@eslint/js");
// const pluginPromise = require("eslint-plugin-promise");
const pluginNoFloatingPromise = require("eslint-plugin-no-floating-promise");

module.exports = [
	{
		// ignores: ["node_modules/**"],
		ignores: ["coverage/**"],
	},

	{
		// load the promise plugin
		plugins: {
			// promise: pluginPromise,
			noFloatingPromise: pluginNoFloatingPromise,
		},

		// extends: ["eslint:recommended", "plugin:promise/recommended"],

		// parser / env settings
		languageOptions: {
			parserOptions: {
				// Comment-202505308 applies.
				// ecmaVersion: 2021, // ES2021
				ecmaVersion: 2022,
				// sourceType: "module", // or "script" if you’re not using imports
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
			...js.configs.recommended.rules,
	
			// // spread in all promise/recommended rules
			// ...pluginPromise.configs.recommended.rules,
	
			// // enforce no-floating-promises as an error
			// "promise/no-floating-promises": "error",

			// enable the no-floating-promise rule
			"noFloatingPromise/no-floating-promise": "error",
		},
	},
];
