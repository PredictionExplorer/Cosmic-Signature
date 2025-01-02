// todo-1 Rename this file to "helpers.js".

// See also: "../src/Helpers.js".

"use strict";

const hre = require("hardhat");

async function getCosmicSignatureGameContract(cosmicSignatureGameContractName = "CosmicSignatureGame") {
	let cosmicSignatureGameAddr = process.env.COSMIC_SIGNATURE_GAME_ADDRESS;
	if (typeof cosmicSignatureGameAddr === "undefined" || cosmicSignatureGameAddr.length != 42) {
		console.log("COSMIC_SIGNATURE_GAME_ADDRESS environment variable does not contain contract address.");
		process.exit(1);
	}
	let cosmicSignatureGame = await hre.ethers.getContractAt(cosmicSignatureGameContractName, cosmicSignatureGameAddr);
	return cosmicSignatureGame;
}

async function getBidderContract() {
	let bidderContractAddr = process.env.BIDDER_CONTRACT_ADDRESS;
	if (typeof bidderContractAddr === "undefined" || bidderContractAddr.length != 42) {
		console.log("BIDDER_CONTRACT_ADDRESS environment variable does not contain contract address.");
		process.exit(1);
	}
	// console.log(bidderContractAddr);
	let bidderContract = await hre.ethers.getContractAt("BidderContract", bidderContractAddr);
	return bidderContract;
}

module.exports = { getCosmicSignatureGameContract, getBidderContract };
