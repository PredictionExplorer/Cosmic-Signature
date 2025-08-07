// todo-1 This is now broken because I have moved NFT donations to `PrizesWallet`.

// Confirms that deployed contracts are fully operational

"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../src/Helpers.js");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function bid_simple(testingAcct, cosmicSignatureGame) {
	let nextEthBidPrice1 = await cosmicSignatureGame.getNextEthBidPrice(1n);
	let nextEthBidPrice0 = await cosmicSignatureGame.getNextEthBidPrice(0n);
	/** @type {Promise<import("ethers").TransactionResponse>} */
	let transactionResponsePromise = cosmicSignatureGame.connect(testingAcct).bidWithEth((-1), "test bid", { value: nextEthBidPrice0 });
	let transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).equal(testingAcct.address);
	expect(parsed_log.args.paidEthPrice).oneOf([nextEthBidPrice0, nextEthBidPrice1]);
	expect(parsed_log.args.message).equal("test bid");
}

async function bid_with_rwalk(testingAcct, cosmicSignatureGame, nftId) {
	// let randomWalkNftAddress = await cosmicSignatureGame.randomWalkNft();

	// // Comment-202502096 applies.
	// let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddress);

	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	let nextEthPlusRandomWalkNftBidPrice = await cosmicSignatureGame.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice);
	/** @type {Promise<import("ethers").TransactionResponse>} */
	let transactionResponsePromise = cosmicSignatureGame.connect(testingAcct).bidWithEth(nftId, "rwalk bid", {value: nextEthPlusRandomWalkNftBidPrice});
	let transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).equal(testingAcct.address);
	expect(parsed_log.args.paidEthPrice).equal(nextEthPlusRandomWalkNftBidPrice);
	expect(parsed_log.args.randomWalkNftId).equal(nftId);
	expect(parsed_log.args.message).equal("rwalk bid");
}

async function bid_and_donate(testingAcct, cosmicSignatureGame, donatedTokenId) {
	let randomWalkNftAddress = await cosmicSignatureGame.randomWalkNft();

	// Comment-202502096 applies.
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddress);

	await randomWalkNft.connect(testingAcct).setApprovalForAll(cosmicSignatureGame.address, true);

	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	/** @type {Promise<import("ethers").TransactionResponse>} */
	let transactionResponsePromise = cosmicSignatureGame
		.connect(testingAcct)
		.bidWithEthAndDonateNft((-1), "donate bid", randomWalkNft.address, donatedTokenId, {value: nextEthBidPrice});
	let transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).equal(testingAcct.address);
	expect(parsed_log.args.paidEthPrice).equal(nextEthBidPrice);
	expect(parsed_log.args.message).equal("donate bid");

	topic_sig = cosmicSignatureGame.interface.getEventTopic("NftDonationEvent");
	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donorAddress).equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).equal(randomWalkNft.address);
	expect(parsed_log.args.nftId).equal(donatedTokenId);
}

async function bid_with_rwalk_and_donate(testingAcct, cosmicSignatureGame, donatedTokenId, tokenIdBidding) {
	let randomWalkNftAddress = await cosmicSignatureGame.randomWalkNft();

	// Comment-202502096 applies.
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddress);
	
	await randomWalkNft.connect(testingAcct).setApprovalForAll(cosmicSignatureGame.address, true);

	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	let nextEthPlusRandomWalkNftBidPrice = await cosmicSignatureGame.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice);
	/** @type {Promise<import("ethers").TransactionResponse>} */
	let transactionResponsePromise = cosmicSignatureGame
		.connect(testingAcct)
		.bidWithEthAndDonateNft(tokenIdBidding, "donate nft rwalk bid", randomWalkNft.address, donatedTokenId, {value: nextEthPlusRandomWalkNftBidPrice});
	let transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).equal(testingAcct.address);
	expect(parsed_log.args.paidEthPrice).equal(nextEthPlusRandomWalkNftBidPrice);
	expect(parsed_log.args.randomWalkNftId).equal(tokenIdBidding);
	expect(parsed_log.args.message).equal("donate nft rwalk bid");

	topic_sig = cosmicSignatureGame.interface.getEventTopic("NftDonationEvent");
	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donorAddress).equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).equal(randomWalkNft.address);
	expect(parsed_log.args.nftId).equal(donatedTokenId);
}

async function main() {
	let privKey = process.env.PRIVKEY;
	if (privKey == undefined || privKey.length <= 0) {
		console.info(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let rwalkTokenList = process.env.RWALK_TOKENS;
	if (rwalkTokenList == undefined || rwalkTokenList.length <= 0) {
		console.info("Please provide Random Walk NFT list in RWALK_TOKENS environment variable");
		process.exit(1);
	}
	let tokenList = rwalkTokenList.split(",");
	if (tokenList.length != 4) {
		console.info("This script needs 4 Random Walk NFTs (in RWALK_TOKENS environment variable)");
		process.exit(1);
	}

	const testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	const cosmicSignatureGame = await getCosmicSignatureGameContract();

	await bid_simple(testingAcct, cosmicSignatureGame);
	await bid_with_rwalk(testingAcct, cosmicSignatureGame, tokenList[0]);
	await bid_and_donate(testingAcct, cosmicSignatureGame, tokenList[1]);
	await bid_with_rwalk_and_donate(testingAcct, cosmicSignatureGame, tokenList[2], tokenList[3]);

	console.info("Bidding test result: success");
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
