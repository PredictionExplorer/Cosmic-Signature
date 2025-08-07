// Used to check the three main fields of deployed contracts: roundActivationTime, charityAddress and randomWalkNft address

// todo-1 Add the testing/logging of `marketingWalletAddress` to this?

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	let roundActivationTime = await cosmicSignatureGame.roundActivationTime();
	let randomWalkNftAddress = await cosmicSignatureGame.randomWalkNft();
	let charityAddress = await cosmicSignatureGame.charityAddress();

	// Comment-202502096 applies.
	let charityWalletContract = await hre.ethers.getContractAt("CharityWallet", charityAddress);
	
	let charityWalletContractOwner = await charityWalletContract.owner();
	let charityDonationsReceiverAddress = await charityWalletContract.charityAddress();

	console.info("bidding round activation time = " + roundActivationTime.toString());
	console.info("randomWalkNft address = " + randomWalkNftAddress.toString());
	console.info("charity wallet contract address = " + charityAddress.toString());
	console.info("owner of charity wallet contract = " + charityWalletContractOwner.toString());
	console.info("charity donations receiver address = " + charityDonationsReceiverAddress.toString());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
