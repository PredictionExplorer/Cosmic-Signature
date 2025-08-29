// [Comment-202505289]
//
// To test for Solidity Coverage, it's recommended to execute "test/coverage-1.bash".
// It does most of the following.
//
// Execute the following command:
// 
// 'npx' 'hardhat' 'coverage'
// 
// To test only specific 1 or more test files:
//
// 'npx' 'hardhat' 'coverage' '--testfiles' 'test/MyTest1.js'
//
// 'npx' 'hardhat' 'coverage' '--testfiles' 'test/{MyTest1.js,MyTest2.js}'
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

	// // It appears that we don't need this unless the compilation fails.
	// configureYulOptimizer: true,

	istanbulReporter: ["html", /*"text",*/],
	mocha: {
		// // [Comment-202505171/]
		// grep: "multiple bidding rounds$",

		parallel: false,
	},
};
