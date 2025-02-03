// Used to check the three main fields of deployed contracts: roundActivationTime, charityAddress and randomWalkNft address

// todo-1 Add the testing/logging of `marketingWalletAddr` to this?

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	let roundActivationTime = await cosmicSignatureGame.roundActivationTime();
	let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	let charityAddr = await cosmicSignatureGame.charityAddress();
	let charityWalletContract = await hre.ethers.getContractAt("CharityWallet", charityAddr);
	let charityWalletContractOwner = await charityWalletContract.owner();
	let charityDonationsReceiverAddress = await charityWalletContract.charityAddress();

	console.log("round activation time = " + roundActivationTime.toString());
	console.log("randomWalkNft address = " + randomWalkNftAddr_.toString());
	console.log("charity wallet contract address = " + charityAddr.toString());
	console.log("owner of charity wallet contract = " + charityWalletContractOwner.toString());
	console.log("charity donations receiver address = " + charityDonationsReceiverAddress.toString());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
