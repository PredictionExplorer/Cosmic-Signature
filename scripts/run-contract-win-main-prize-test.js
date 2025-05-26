"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { /*getCosmicSignatureGameContract,*/ getBidderContract } = require("./helpers.js");

async function main() {
	const [signer0, signer1, signer2,] = await hre.ethers.getSigners();
	const bidderContract = await getBidderContract();
	let cosmicSignatureGameAddr = await bidderContract.cosmicSignatureGame();

	// Comment-202502096 applies.
	let cosmicSignatureGame = await hre.ethers.getContractAt("CosmicSignatureGame", cosmicSignatureGameAddr);

	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await cosmicSignatureGame.connect(signer0).bidWithEth((-1), "signer0 bid", {value: nextEthBidPrice,});
	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await cosmicSignatureGame.connect(signer1).bidWithEth((-1), "signer1 bid", {value: nextEthBidPrice,});
	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await cosmicSignatureGame.connect(signer2).bidWithEth((-1), "signer2 bid", {value: nextEthBidPrice,});
	let randomWalkNftAddr = await cosmicSignatureGame.randomWalkNft();

	// Comment-202502096 applies.
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr);

	await randomWalkNft.connect(signer0).setApprovalForAll(cosmicSignatureGame.address, true);
	await randomWalkNft.connect(signer0).setApprovalForAll(bidderContract.address, true);
	let rwalkPrice = await randomWalkNft.getMintPrice();
	let transactionResponse = await randomWalkNft.connect(signer0).mint({ value: rwalkPrice });
	let transactionReceipt = await transactionResponse.wait();
	let topic_sig = randomWalkNft.interface.getEventTopic("MintEvent");
	let log = transactionReceipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = randomWalkNft.interface.parseLog(log);
	let nftId = parsed_log.args.tokenId;
	console.log("tokenid = " + nftId);
	await randomWalkNft.connect(signer0).transferFrom(signer0.address, bidderContract.address, nftId);
	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await bidderContract.connect(signer0).doBidWithEthAndDonateNft(randomWalkNftAddr, nftId, {value: nextEthBidPrice,});

	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await bidderContract.connect(signer0).doBidWithEth({value: nextEthBidPrice,});

	rwalkPrice = await randomWalkNft.getMintPrice();
	transactionResponse = await randomWalkNft.connect(signer0).mint({ value: rwalkPrice });
	transactionReceipt = await transactionResponse.wait();
	topic_sig = randomWalkNft.interface.getEventTopic("MintEvent");
	log = transactionReceipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = randomWalkNft.interface.parseLog(log);
	nftId = parsed_log.args.tokenId;
	await randomWalkNft.connect(signer0).transferFrom(signer0.address, bidderContract.address, nftId);
	await bidderContract.connect(signer0).doBidWithEthRWalk(nftId);

	let durationUntilMainPrize = await cosmicSignatureGame.getDurationUntilMainPrize();
	await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize.toNumber()]);
	// await hre.ethers.provider.send("evm_mine");
	await bidderContract.connect(signer0).doClaimMainPrize();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
