"use strict";

// const { expect } = require("chai");
// const hre = require("hardhat");
const { getBidderContract } = require("./helpers.js");

async function main() {
	const bidderContract = await getBidderContract();
	await bidderContract.withdrawAll();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
