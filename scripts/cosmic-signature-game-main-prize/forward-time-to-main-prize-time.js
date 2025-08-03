"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	const cosmicSignatureGame = await getCosmicSignatureGameContract();
	let durationUntilMainPrize = await cosmicSignatureGame.getDurationUntilMainPrize();
	console.log("Duration until main prize before:", durationUntilMainPrize);
	if (durationUntilMainPrize > 0n) {
		if (durationUntilMainPrize > 1n) {
			await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize.toNumber()]);
		}
		await hre.ethers.provider.send("evm_mine");

		// This is supposed to be zero.
		durationUntilMainPrize = await cosmicSignatureGame.getDurationUntilMainPrize();

		console.log("Duration until main prize after:", durationUntilMainPrize);
	}
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
