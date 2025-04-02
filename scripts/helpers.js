// See also: "../src/Helpers.js".

// todo-1 Review this. See todos below.

"use strict";

const hre = require("hardhat");

// todo-1 This should return `{cosmicSignatureGameAddr, cosmicSignatureGame}`.
async function getCosmicSignatureGameContract(cosmicSignatureGameContractName = "CosmicSignatureGame") {
	const cosmicSignatureGameAddr = process.env.COSMIC_SIGNATURE_GAME_ADDRESS;
	// todo-1 Unnecessary to validate length?
	if (typeof cosmicSignatureGameAddr === "undefined" || cosmicSignatureGameAddr.length !== 42) {
		console.log("COSMIC_SIGNATURE_GAME_ADDRESS environment variable does not contain contract address.");
		process.exit(1);
	}

	// [Comment-202502096]
	// Issue. This uses default signer. Is it a problem?
	// todo-1 Everywhere we call `getContractAt`, think about the above.
	// todo-1 Everywhere we call `getContractAt`, consider calling `attach`. See `deployContractsAdvanced`.
	// todo-1 Also `getContractFactory`.
	// todo-1 Mybe add a param: `ownerAcct`, similar to `deployerAcct` in some other functions.
	// todo-1 Some scripts use the `PRIVKEY` environment variable. So the caller can pass that wallet to us.
	// [/Comment-202502096]
	const cosmicSignatureGame = await hre.ethers.getContractAt(cosmicSignatureGameContractName, cosmicSignatureGameAddr);

	return cosmicSignatureGame;
}

// todo-1 This should return `{bidderContractAddr, bidderContract}`.
async function getBidderContract() {
	const bidderContractAddr = process.env.BIDDER_CONTRACT_ADDRESS;
	// todo-1 Unnecessary to validate length?
	if (typeof bidderContractAddr === "undefined" || bidderContractAddr.length !== 42) {
		console.log("BIDDER_CONTRACT_ADDRESS environment variable does not contain contract address.");
		process.exit(1);
	}
	// console.log(bidderContractAddr);

	// Comment-202502096 applies.
	const bidderContract = await hre.ethers.getContractAt("BidderContract", bidderContractAddr);

	return bidderContract;
}

module.exports = {
	getCosmicSignatureGameContract,
	getBidderContract,
};
