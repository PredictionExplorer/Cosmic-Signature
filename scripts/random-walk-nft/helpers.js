"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");

async function configureRandomWalkNft(randomWalkNft_, bidder2Signer_, bidder3Signer_, prizesWalletAddress_) {
	await waitForTransactionReceipt(randomWalkNft_.connect(bidder2Signer_).setApprovalForAll(prizesWalletAddress_, true));
	await waitForTransactionReceipt(randomWalkNft_.connect(bidder3Signer_).setApprovalForAll(prizesWalletAddress_, true));
}

async function mintRandomWalkNft(randomWalkNft_, minterSigner_) {
	let mintPrice_ = await randomWalkNft_.getMintPrice();
	/** @type {Promise<hre.ethers.TransactionResponse>} */
	let transactionResponsePromise_ = randomWalkNft_.connect(minterSigner_).mint({value: mintPrice_,});
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	let randomWalkNftMintEventLog_ = transactionReceipt_.logs[1];
	let randomWalkNftMintEventParsedLog_ = randomWalkNft_.interface.parseLog(randomWalkNftMintEventLog_);
	let nftId_ = randomWalkNftMintEventParsedLog_.args.tokenId;
	console.info(`Minted a Random Walk NFT with id = ${nftId_}.`);
	return nftId_;
}

module.exports = {
	configureRandomWalkNft,
	mintRandomWalkNft,
};
