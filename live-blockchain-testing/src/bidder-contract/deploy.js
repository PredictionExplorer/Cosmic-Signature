// // Comment-202509229 applies.

// "use strict";

// // const { expect } = require("chai");
// const hre = require("hardhat");
// const { getCosmicSignatureGameContract } = require("../helpers.js");

// async function main() {
// 	const cosmicSignatureGame = await getCosmicSignatureGameContract();
// 	const cosmicSignatureGameAddress = await cosmicSignatureGame.getAddress();
//
// 	// todo-9 Take `deployerSigner` from the `PRIVKEY` environment variable.
// 	const [deployerSigner,] = await hre.ethers.getSigners();
// 	const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerSigner);
// 	const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameAddress);
// 	await bidderContract.waitForDeployment();
// 	const bidderContractAddress = await bidderContract.getAddress();
//
// 	console.info("BidderContract address: " + bidderContractAddress);
// }

// main()
// 	.then(() => { process.exit(0); })
// 	.catch((errorObject_) => {
// 		console.error(errorObject_);
// 		process.exit(1);
// 	});
