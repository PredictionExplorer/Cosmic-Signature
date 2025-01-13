// todo-1 Rename this file to "deploy-bidder-contract.js".

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function main() {
	const cosmicSignatureGame = await getCosmicSignatureGameContract();

	const [owner,] = await hre.ethers.getSigners();
	const BidderContract = await hre.ethers.getContractFactory("BidderContract");
	const bidderContract = await BidderContract.connect(owner).deploy(cosmicSignatureGame.address);
	await bidderContract.deployed();

	console.log("BidderContract address: " + bidderContract.address);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
