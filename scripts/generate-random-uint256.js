"use strict";

/* const hre = */ require("hardhat");
const { generateRandomUInt256, uint256ToPaddedHexString } = require("../src/Helpers.js");

main();

function main() {
	console.info();
	const numRandomNumbersToGenerateAsString_ = process.argv[2];
	const numRandomNumbersToGenerate_ =
		((numRandomNumbersToGenerateAsString_ ?? "").length <= 0) ? 1 : parseInt(numRandomNumbersToGenerateAsString_);
	for ( let counter_ = numRandomNumbersToGenerate_; counter_ > 0; -- counter_ ) {
		const randomNumber_ = generateRandomUInt256();
		const randomNumberAsString_ = uint256ToPaddedHexString(randomNumber_);
		console.info("%s", randomNumberAsString_);
	}
}
