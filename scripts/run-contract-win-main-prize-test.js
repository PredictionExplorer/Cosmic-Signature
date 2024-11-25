"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { /*getCosmicSignatureGameContract,*/ getBidderContract } = require("./helper.js");

async function main() {
	const [owner, addr1, addr2] = await hre.ethers.getSigners();
	let bidderContract = await getBidderContract();
	let cosmicSignatureGameAddr = await bidderContract.cosmicSignatureGame();
	let cosmicSignatureGame = await hre.ethers.getContractAt("CosmicSignatureGame", cosmicSignatureGameAddr);

	let bidPrice = await cosmicSignatureGame.getBidPrice();
	await cosmicSignatureGame.connect(owner).bid("owner bids", { value: bidPrice });
	bidPrice = await cosmicSignatureGame.getBidPrice();
	await cosmicSignatureGame.connect(addr1).bid("addr1 bids", { value: bidPrice });
	bidPrice = await cosmicSignatureGame.getBidPrice();
	await cosmicSignatureGame.connect(addr2).bid("addr2 bids", { value: bidPrice });
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
	let token_id = parsed_log.args.tokenId;
	console.log("tokenid = " + token_id);
	await randomWalkNft_.connect(owner).transferFrom(owner.address, bidderContract.address, token_id);
	bidPrice = await cosmicSignatureGame.getBidPrice();
	// todo-1 I have commented this method out.
	await bidderContract.connect(owner).doBidAndDonateNft(randomWalkNftAddr_, token_id, { value: bidPrice });

	bidPrice = await cosmicSignatureGame.getBidPrice();
	await bidderContract.connect(owner).doBid({ value: bidPrice });

	rwalkPrice = await randomWalkNft_.getMintPrice();
	tx = await randomWalkNft_.connect(owner).mint({ value: rwalkPrice });
	receipt = await tx.wait();
	topic_sig = randomWalkNft_.interface.getEventTopic("MintEvent");
	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = randomWalkNft_.interface.parseLog(log);
	token_id = parsed_log.args.tokenId;
	await randomWalkNft_.connect(owner).transferFrom(owner.address, bidderContract.address, token_id);
	await bidderContract.connect(owner).doBidRWalk(token_id);

	let durationUntilMainPrize_ = await cosmicSignatureGame.timeUntilPrize();
	await hre.ethers.provider.send("evm_increaseTime", [durationUntilMainPrize_.toNumber()]);

	await bidderContract.connect(owner).doClaim();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
