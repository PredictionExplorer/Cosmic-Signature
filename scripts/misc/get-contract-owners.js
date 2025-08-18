// todo-1 This test is incomplete.
// todo-1 We need a test that validates that all state variables in all contracts have been assigned the right values.
// todo-1 But I have developed such a tet already. See `validateCosmicSignatureContractStatesIfNeeded`.

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	let o = await cosmicSignatureGame.owner();
	console.info("Owner of CosmicSignatureGame: " + o);

	let address;

	// // This contract is no longer `Ownable`.
	// address = await cosmicSignatureGame.token();
	// let cosmicSignatureToken = await hre.ethers.getContractAt("CosmicSignatureToken", address);
	// o = await cosmicSignatureToken.owner();
	// console.info("Owner of CosmicSignatureToken: " + o);

	address = await cosmicSignatureGame.nft();
	let cosmicSignatureNft = await hre.ethers.getContractAt("CosmicSignatureNft", address);
	o = await cosmicSignatureNft.owner();
	console.info("Owner of CosmicSignatureNft: " + o);

	address = await cosmicSignatureGame.prizesWallet();
	let prizesWalletContract = await hre.ethers.getContractAt("PrizesWallet", address);
	o = await prizesWalletContract.owner();
	console.info("Owner of PrizesWallet: " + o);

	address = await cosmicSignatureGame.charityAddress();
	console.info("CharityWallet contract at CosmicSignatureGame contract: " + address);
	let charityWalletContract = await hre.ethers.getContractAt("CharityWallet", address);
	address = await charityWalletContract.charityAddress();
	console.info("Charity address at CharityWallet contract: " + address);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
