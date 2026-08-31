// [Comment-202505289]
//
// To test for Solidity Coverage, it's recommended to execute "test/runners/coverage-1.bash".
// It does most of the following.
//
// Execute the following command:
// 
// 'npx' 'hardhat' 'coverage'
// 
// To test only specific 1 or more test files:
//
// 'npx' 'hardhat' 'coverage' '--testfiles' 'test/tests-src/MyTest1.js'
//
// 'npx' 'hardhat' 'coverage' '--testfiles' 'test/tests-src/{MyTest1.js,MyTest2.js}'
//
// To test only specific tests, specify a reg-exp pattern that matches their titles near Comment-202505171.
// 
// Hardhat will create the following folders and files:
// coverage/
// coverage.json
// 
// "coverage.json" isn't intended to be read by humans.
//
// To find parts of the code that are not covered, cd to "coverage/" and search the following in all files in the folder tree:
//
// title=
//
// [/Comment-202505289]

"use strict";

module.exports = {
	skipFiles: ["tests/", "upgrade-prototype/",],

	// [Comment-202609025]
	// It appears that we don't need this unless Solidity compilation fails.
	// Actually, I had to add this to fix a "stack too deep" compile error.
	// I also had to supplement some `assembly` keywords with `("memory-safe")`.
	// [/Comment-202609025]
	configureYulOptimizer: true,

	istanbulReporter: ["html", /*"text",*/],
	mocha: {
		// // [Comment-202505171/]
		// grep: "multiple bidding rounds$",

		parallel: false,
	},
};
