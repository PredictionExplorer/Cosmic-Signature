"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../src/Helpers.js");
const { /*getCosmicSignatureGameContract,*/ getBidderContract } = require("./helpers.js");

async function main() {
	const [signer0, signer1, signer2,] = await hre.ethers.getSigners();
	const bidderContract = await getBidderContract();
	const cosmicSignatureGameAddress = await bidderContract.cosmicSignatureGame();

	// Comment-202502096 applies.
	const cosmicSignatureGame = await hre.ethers.getContractAt("CosmicSignatureGame", cosmicSignatureGameAddress);

	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await waitForTransactionReceipt(cosmicSignatureGame.connect(signer0).bidWithEth((-1), "signer0 bid", {value: nextEthBidPrice,}));
	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await waitForTransactionReceipt(cosmicSignatureGame.connect(signer1).bidWithEth((-1), "signer1 bid", {value: nextEthBidPrice,}));
	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await waitForTransactionReceipt(cosmicSignatureGame.connect(signer2).bidWithEth((-1), "signer2 bid", {value: nextEthBidPrice,}));
	let randomWalkNftAddress = await cosmicSignatureGame.randomWalkNft();

	// Comment-202502096 applies.
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddress);

	await waitForTransactionReceipt(randomWalkNft.connect(signer0).setApprovalForAll(cosmicSignatureGame.address, true));
	await waitForTransactionReceipt(randomWalkNft.connect(signer0).setApprovalForAll(bidderContract.address, true));
	let rwalkPrice = await randomWalkNft.getMintPrice();
	/** @type {Promise<hre.ethers.TransactionResponse>} */
	let transactionResponsePromise = randomWalkNft.connect(signer0).mint({ value: rwalkPrice });
	let transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
	let topic_sig = randomWalkNft.interface.getEventTopic("MintEvent");
	let log = transactionReceipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = randomWalkNft.interface.parseLog(log);
	let nftId = parsed_log.args.tokenId;
	console.info(`nftId = ${nftId}`);
	await waitForTransactionReceipt(randomWalkNft.connect(signer0).transferFrom(signer0.address, bidderContract.address, nftId));
	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	// todo-1 This no longer calls nftAddress_.setApprovalForAll(address(prizesWallet_), true);
	await waitForTransactionReceipt(bidderContract.connect(signer0).doBidWithEthAndDonateNft(randomWalkNftAddress, nftId, {value: nextEthBidPrice,}));

	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await waitForTransactionReceipt(bidderContract.connect(signer0).doBidWithEth({value: nextEthBidPrice,}));

	rwalkPrice = await randomWalkNft.getMintPrice();
	transactionResponsePromise = randomWalkNft.connect(signer0).mint({ value: rwalkPrice });
	transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
	topic_sig = randomWalkNft.interface.getEventTopic("MintEvent");
	log = transactionReceipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = randomWalkNft.interface.parseLog(log);
	nftId = parsed_log.args.tokenId;
	await waitForTransactionReceipt(randomWalkNft.connect(signer0).transferFrom(signer0.address, bidderContract.address, nftId));
	await waitForTransactionReceipt(bidderContract.connect(signer0).doBidWithEthPlusRandomWalkNft(nftId));

	let durationUntilMainPrize = await cosmicSignatureGame.getDurationUntilMainPrize();
	await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize.toNumber()]);
	// await hre.ethers.provider.send("evm_mine");
	await waitForTransactionReceipt(bidderContract.connect(signer0).doClaimMainPrize());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
