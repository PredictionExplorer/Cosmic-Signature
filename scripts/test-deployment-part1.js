// Confirms that deployed contracts are fully operational
const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameContract } = require("./helper.js");
const bidParamsEncoding = {
	type: "tuple(string,int256)",
	name: "bidparams",
	components: [
		{ name: "msg", type: "string" },
		{ name: "rwalk", type: "int256" },
	],
};
async function bid_simple(testingAcct, cosmicGame) {
	let bidPrice = await cosmicGame.getBidPrice();
	let bidParams = { msg: "test bid", rwalk: -1 };
	let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	let tx = await cosmicGame.connect(testingAcct).bid(params, { value: bidPrice });
	let receipt = await tx.wait();
	let topic_sig = cosmicGame.interface.getEventTopic("BidEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("test bid");
	expect(parsed_log.args.bidPrice).to.equal(bidPrice);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);
}
async function bid_randomwalk(testingAcct, cosmicGame, tokenId) {
	let bidPrice = await cosmicGame.getBidPrice();
	let rwalkAddr = await cosmicGame.randomWalk();
	let randomWalk = await ethers.getContractAt("RandomWalkNFT", rwalkAddr);
	let bidParams = { msg: "rwalk bid", rwalk: tokenId };
	let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	tx = await cosmicGame.connect(testingAcct).bid(params,{value:bidPrice});
	receipt = await tx.wait();
	topic_sig = cosmicGame.interface.getEventTopic("BidEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("rwalk bid");
	expect(parsed_log.args.randomWalkNFTId).to.equal(tokenId);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);
}
async function bid_and_donate(testingAcct, cosmicGame, donatedTokenId) {
	let bidPrice = await cosmicGame.getBidPrice();

	let rwalkAddr = await cosmicGame.randomWalk();
	let randomWalk = await ethers.getContractAt("RandomWalkNFT", rwalkAddr);
	await randomWalk.connect(testingAcct).setApprovalForAll(cosmicGame.address, true);

	let bidParams = { msg: "donate bid", rwalk: -1 };
	let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	tx = await cosmicGame
		.connect(testingAcct)
		.bidAndDonateNFT(params, randomWalk.address, donatedTokenId, { value: bidPrice });
	receipt = await tx.wait();
	topic_sig = cosmicGame.interface.getEventTopic("BidEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("donate bid");
	expect(parsed_log.args.bidPrice).to.equal(bidPrice);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);

	topic_sig = cosmicGame.interface.getEventTopic("NFTDonationEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donor).to.equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).to.equal(randomWalk.address);
	expect(parsed_log.args.tokenId).to.equal(donatedTokenId);
}
async function bid_and_donate_with_rwalk(testingAcct, cosmicGame, donatedTokenId, tokenIdBidding) {
	let bidPrice = await cosmicGame.getBidPrice();

	let rwalkAddr = await cosmicGame.randomWalk();
	let randomWalk = await ethers.getContractAt("RandomWalkNFT", rwalkAddr);
	await randomWalk.connect(testingAcct).setApprovalForAll(cosmicGame.address, true);

	let bidParams = { msg: "donate nft rwalk bid", rwalk: tokenIdBidding };
	let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	tx = await cosmicGame
		.connect(testingAcct)
		.bidAndDonateNFT(params, randomWalk.address, donatedTokenId,{value:bidPrice});
	receipt = await tx.wait();
	topic_sig = cosmicGame.interface.getEventTopic("BidEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("donate nft rwalk bid");
	expect(parsed_log.args.randomWalkNFTId).to.equal(tokenIdBidding);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);

	topic_sig = cosmicGame.interface.getEventTopic("NFTDonationEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGame.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donor).to.equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).to.equal(randomWalk.address);
	expect(parsed_log.args.tokenId).to.equal(donatedTokenId);
}
async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let rwalkTokenList = process.env.RWALK_TOKENS;
	if (typeof rwalkTokenList === "undefined" || rwalkTokenList.length == 0) {
		console.log("Please provide RandomWalk token list in RWALK_TOKENS environment variable");
		process.exit(1);
	}
	tokenList = rwalkTokenList.split(",");
	if (tokenList.length != 4) {
		console.log("This script needs 4 RandomWalk tokens (in RWALK_TOKENS environment variable)");
		process.exit(1);
	}

	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicGame = await getCosmicGameContract();

	await bid_simple(testingAcct, cosmicGame);
	await bid_randomwalk(testingAcct, cosmicGame, tokenList[0]);
	await bid_and_donate(testingAcct, cosmicGame, tokenList[1]);
	await bid_and_donate_with_rwalk(testingAcct, cosmicGame, tokenList[2], tokenList[3]);

	console.log("Bidding test result: success");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
