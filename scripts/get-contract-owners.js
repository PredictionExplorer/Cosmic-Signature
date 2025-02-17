"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	let o = await cosmicSignatureGame.owner();
	console.log("Owner of CosmicSignatureGame: " + o);

	let addr;

	// // This contract is no longer `Ownable`.
	// addr = await cosmicSignatureGame.token();
	// let cosmicSignatureToken = await hre.ethers.getContractAt("CosmicSignatureToken", addr);
	// o = await cosmicSignatureToken.owner();
	// console.log("Owner of CosmicSignatureToken: " + o);

	addr = await cosmicSignatureGame.nft();
	let cosmicSignatureNft = await hre.ethers.getContractAt("CosmicSignatureNft", addr);
	o = await cosmicSignatureNft.owner();
	console.log("Owner of CosmicSignatureNft: " + o);

	addr = await cosmicSignatureGame.prizesWallet();
	let prizesWalletContract = await hre.ethers.getContractAt("PrizesWallet", addr);
	o = await prizesWalletContract.owner();
	console.log("Owner of PrizesWallet: " + o);

	addr = await cosmicSignatureGame.charityAddress();
	console.log("CharityWallet contract at CosmicSignatureGame contract: " + addr);
	let charityWalletContract = await hre.ethers.getContractAt("CharityWallet", addr);
	addr = await charityWalletContract.charityAddress();
	console.log("Charity address at CharityWallet contract: " + addr);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
