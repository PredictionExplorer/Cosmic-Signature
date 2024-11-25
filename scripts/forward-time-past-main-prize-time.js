"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function main() {
	const cosmicSignatureGame = await getCosmicSignatureGameContract();
	//console.log(cosmicSignatureGame);
	let durationUntilMainPrize_ = await cosmicSignatureGame.timeUntilPrize();
	console.log("Duration until main prize before: " + durationUntilMainPrize_.toString());
	// durationUntilMainPrize_ = await cosmicSignatureGame.timeUntilPrize();
	await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize_.add(1).toNumber()]);
	await hre.ethers.provider.send("evm_mine");
	durationUntilMainPrize_ = await cosmicSignatureGame.timeUntilPrize();
	console.log("Duration until main prize after: " + durationUntilMainPrize_.toString());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
