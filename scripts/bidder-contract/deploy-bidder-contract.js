"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	const cosmicSignatureGame = await getCosmicSignatureGameContract();
	const cosmicSignatureGameAddr = await cosmicSignatureGame.getAddress();

	// todo-1 Take `deployerAcct` from the `PRIVKEY` environment variable.
	const [deployerAcct,] = await hre.ethers.getSigners();
	const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
	const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameAddr);
	await bidderContract.waitForDeployment();
	const bidderContractAddr = await bidderContract.getAddress();

	console.log("BidderContract address: " + bidderContractAddr);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
