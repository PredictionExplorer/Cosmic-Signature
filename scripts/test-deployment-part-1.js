// todo-1 This is now broken because I have moved NFT donations to `PrizesWallet`.

// Confirms that deployed contracts are fully operational

"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function bid_simple(testingAcct, cosmicSignatureGame) {
	let nextEthBidPrice1_ = await cosmicSignatureGame.getNextEthBidPrice(1n);
	let nextEthBidPrice0_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	let tx = await cosmicSignatureGame.connect(testingAcct).bidWithEth((-1), "test bid", { value: nextEthBidPrice0_ });
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);
	expect(parsed_log.args.ethBidPrice).oneOf([nextEthBidPrice0_, nextEthBidPrice1_]);
	expect(parsed_log.args.message).to.equal("test bid");
}

async function bid_with_rwalk(testingAcct, cosmicSignatureGame, nftId) {
	// let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	// let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	let nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGame.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
	let tx = await cosmicSignatureGame.connect(testingAcct).bidWithEth(nftId, "rwalk bid", {value: nextEthPlusRandomWalkNftBidPrice_});
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);
	expect(parsed_log.args.ethBidPrice).to.equal(nextEthPlusRandomWalkNftBidPrice_);
	expect(parsed_log.args.randomWalkNftId).to.equal(nftId);
	expect(parsed_log.args.message).to.equal("rwalk bid");
}

async function bid_and_donate(testingAcct, cosmicSignatureGame, donatedTokenId) {
	let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	await randomWalkNft_.connect(testingAcct).setApprovalForAll(cosmicSignatureGame.address, true);

	let nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	let tx = await cosmicSignatureGame
		.connect(testingAcct)
		.bidWithEthAndDonateNft((-1), "donate bid", randomWalkNft_.address, donatedTokenId, {value: nextEthBidPrice_});
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);
	expect(parsed_log.args.ethBidPrice).to.equal(nextEthBidPrice_);
	expect(parsed_log.args.message).to.equal("donate bid");

	topic_sig = cosmicSignatureGame.interface.getEventTopic("NftDonationEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donorAddress).to.equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).to.equal(randomWalkNft_.address);
	expect(parsed_log.args.nftId).to.equal(donatedTokenId);
}

async function bid_with_rwalk_and_donate(testingAcct, cosmicSignatureGame, donatedTokenId, tokenIdBidding) {
	let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	await randomWalkNft_.connect(testingAcct).setApprovalForAll(cosmicSignatureGame.address, true);

	let nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGame.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
	let tx = await cosmicSignatureGame
		.connect(testingAcct)
		.bidWithEthAndDonateNft(tokenIdBidding, "donate nft rwalk bid", randomWalkNft_.address, donatedTokenId, {value: nextEthPlusRandomWalkNftBidPrice_});
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidPlaced");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);
	expect(parsed_log.args.ethBidPrice).to.equal(nextEthPlusRandomWalkNftBidPrice_);
	expect(parsed_log.args.randomWalkNftId).to.equal(tokenIdBidding);
	expect(parsed_log.args.message).to.equal("donate nft rwalk bid");

	topic_sig = cosmicSignatureGame.interface.getEventTopic("NftDonationEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donorAddress).to.equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).to.equal(randomWalkNft_.address);
	expect(parsed_log.args.nftId).to.equal(donatedTokenId);
}

async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let rwalkTokenList = process.env.RWALK_TOKENS;
	if (typeof rwalkTokenList === "undefined" || rwalkTokenList.length == 0) {
		console.log("Please provide RandomWalk NFT list in RWALK_TOKENS environment variable");
		process.exit(1);
	}
	let tokenList = rwalkTokenList.split(",");
	if (tokenList.length != 4) {
		console.log("This script needs 4 RandomWalk NFTs (in RWALK_TOKENS environment variable)");
		process.exit(1);
	}

	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	await bid_simple(testingAcct, cosmicSignatureGame);
	await bid_with_rwalk(testingAcct, cosmicSignatureGame, tokenList[0]);
	await bid_and_donate(testingAcct, cosmicSignatureGame, tokenList[1]);
	await bid_with_rwalk_and_donate(testingAcct, cosmicSignatureGame, tokenList[2], tokenList[3]);

	console.log("Bidding test result: success");
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
