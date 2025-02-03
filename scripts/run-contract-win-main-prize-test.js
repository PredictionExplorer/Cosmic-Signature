"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { /*getCosmicSignatureGameContract,*/ getBidderContract } = require("./helpers.js");

async function main() {
	const [owner, addr1, addr2,] = await hre.ethers.getSigners();
	let bidderContract = await getBidderContract();
	let cosmicSignatureGameAddr = await bidderContract.cosmicSignatureGame();
	let cosmicSignatureGame = await hre.ethers.getContractAt("CosmicSignatureGame", cosmicSignatureGameAddr);

	let nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await cosmicSignatureGame.connect(owner).bidWithEth((-1), "owner bids", { value: nextEthBidPrice_ });
	nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await cosmicSignatureGame.connect(addr1).bidWithEth((-1), "addr1 bids", { value: nextEthBidPrice_ });
	nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await cosmicSignatureGame.connect(addr2).bidWithEth((-1), "addr2 bids", { value: nextEthBidPrice_ });
	let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	await randomWalkNft_.connect(owner).setApprovalForAll(cosmicSignatureGame.address, true);
	await randomWalkNft_.connect(owner).setApprovalForAll(bidderContract.address, true);
	let rwalkPrice = await randomWalkNft_.getMintPrice();
	let tx = await randomWalkNft_.connect(owner).mint({ value: rwalkPrice });
	let receipt = await tx.wait();
	let topic_sig = randomWalkNft_.interface.getEventTopic("MintEvent");
	let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = randomWalkNft_.interface.parseLog(log);
	let nftId_ = parsed_log.args.tokenId;
	console.log("tokenid = " + nftId_);
	await randomWalkNft_.connect(owner).transferFrom(owner.address, bidderContract.address, nftId_);
	nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await bidderContract.connect(owner).doBidWithEthAndDonateNft(randomWalkNftAddr_, nftId_, { value: nextEthBidPrice_ });

	nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await bidderContract.connect(owner).doBidWithEth({ value: nextEthBidPrice_ });

	rwalkPrice = await randomWalkNft_.getMintPrice();
	tx = await randomWalkNft_.connect(owner).mint({ value: rwalkPrice });
	receipt = await tx.wait();
	topic_sig = randomWalkNft_.interface.getEventTopic("MintEvent");
	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = randomWalkNft_.interface.parseLog(log);
	nftId_ = parsed_log.args.tokenId;
	await randomWalkNft_.connect(owner).transferFrom(owner.address, bidderContract.address, nftId_);
	await bidderContract.connect(owner).doBidWithEthRWalk(nftId_);

	let durationUntilMainPrize_ = await cosmicSignatureGame.getDurationUntilMainPrize();
	await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize_.toNumber()]);
	// await hre.ethers.provider.send("evm_mine");
	await bidderContract.connect(owner).doClaim();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
