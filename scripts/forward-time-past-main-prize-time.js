// todo-1 Rename this file. Replace "past" with "to".
// todo-1 Remember to rename all mentionings of this file.

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function main() {
	const cosmicSignatureGame = await getCosmicSignatureGameContract();
	let durationUntilMainPrize_ = await cosmicSignatureGame.getDurationUntilMainPrize();
	console.log("Duration until main prize before:", durationUntilMainPrize_);
	if (durationUntilMainPrize_ > 0n) {
		if (durationUntilMainPrize_ > 1n) {
			await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize_.toNumber()]);
		}
		await hre.ethers.provider.send("evm_mine");

		// This is supposed to be zero.
		durationUntilMainPrize_ = await cosmicSignatureGame.getDurationUntilMainPrize();

		console.log("Duration until main prize after:", durationUntilMainPrize_);
	}
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
