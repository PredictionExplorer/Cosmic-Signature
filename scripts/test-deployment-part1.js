// todo-1 Rename to "test-deployment-part-1.js".
// todo-1 This is now broken because I have moved NFT donations to `PrizesWallet`.

// Confirms that deployed contracts are fully operational

const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

// const bidParamsEncoding = {
// 	type: "tuple(string,int256)",
// 	name: "BidParams",
// 	components: [
// 		{ name: "message", type: "string" },
// 		{ name: "randomWalkNftId", type: "int256" },
// 	],
// };

async function bid_simple(testingAcct, cosmicSignatureGame) {
	// let bidParams = { message: "test bid", randomWalkNftId: -1 };
	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	let ethBidPrice_ = await cosmicSignatureGame.getBidPrice();
	let tx = await cosmicSignatureGame.connect(testingAcct).bid(/*params*/ (-1), "test bid", { value: ethBidPrice_ });
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("test bid");
	expect(parsed_log.args.ethBidPrice).to.equal(ethBidPrice_);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);
}

async function bid_randomwalk(testingAcct, cosmicSignatureGame, nftId) {
	// let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	// let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	// let bidParams = { message: "rwalk bid", randomWalkNftId: nftId };
	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	let ethBidPrice_ = await cosmicSignatureGame.getBidPrice();
	let tx = await cosmicSignatureGame.connect(testingAcct).bid(/*params*/ nftId, "rwalk bid", {value: ethBidPrice_ / 2n});
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("rwalk bid");
	expect(parsed_log.args.randomWalkNftId).to.equal(nftId);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);
}

async function bid_and_donate(testingAcct, cosmicSignatureGame, donatedTokenId) {
	let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	await randomWalkNft_.connect(testingAcct).setApprovalForAll(cosmicSignatureGame.address, true);

	// let bidParams = { message: "donate bid", randomWalkNftId: -1 };
	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	let ethBidPrice_ = await cosmicSignatureGame.getBidPrice();
	let tx = await cosmicSignatureGame
		.connect(testingAcct)
		.bidAndDonateNft(/*params*/ (-1), "donate bid", randomWalkNft_.address, donatedTokenId, {value: ethBidPrice_});
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("donate bid");
	expect(parsed_log.args.ethBidPrice).to.equal(ethBidPrice_);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);

	topic_sig = cosmicSignatureGame.interface.getEventTopic("NftDonationEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donorAddress).to.equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).to.equal(randomWalkNft_.address);
	expect(parsed_log.args.nftId).to.equal(donatedTokenId);
}

async function bid_and_donate_with_rwalk(testingAcct, cosmicSignatureGame, donatedTokenId, tokenIdBidding) {
	let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	await randomWalkNft_.connect(testingAcct).setApprovalForAll(cosmicSignatureGame.address, true);

	// let bidParams = { message: "donate nft rwalk bid", randomWalkNftId: tokenIdBidding };
	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	let ethBidPrice_ = await cosmicSignatureGame.getBidPrice();
	let tx = await cosmicSignatureGame
		.connect(testingAcct)
		.bidAndDonateNft(/*params*/ tokenIdBidding, "donate nft rwalk bid", randomWalkNft_.address, donatedTokenId, {value: ethBidPrice_});
	let receipt = await tx.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("BidEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("donate nft rwalk bid");
	expect(parsed_log.args.randomWalkNftId).to.equal(tokenIdBidding);
	expect(parsed_log.args.lastBidderAddress).to.equal(testingAcct.address);

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
	await bid_randomwalk(testingAcct, cosmicSignatureGame, tokenList[0]);
	await bid_and_donate(testingAcct, cosmicSignatureGame, tokenList[1]);
	await bid_and_donate_with_rwalk(testingAcct, cosmicSignatureGame, tokenList[2], tokenList[3]);

	console.log("Bidding test result: success");
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
