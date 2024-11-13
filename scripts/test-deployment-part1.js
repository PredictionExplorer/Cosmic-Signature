// todo-1 This is now broken because I have moved NFT donations to `PrizesWallet`.

// Confirms that deployed contracts are fully operational

const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicGameProxyContract } = require("./helper.js");

const bidParamsEncoding = {
	type: "tuple(string,int256)",
	name: "BidParams",
	components: [
		{ name: "message", type: "string" },
		{ name: "randomWalkNFTId", type: "int256" },
	],
};
async function bid_simple(testingAcct, cosmicGameProxy) {
	let bidPrice = await cosmicGameProxy.getBidPrice();
	let bidParams = { message: "test bid", randomWalkNFTId: -1 };
	let params = hre.ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	let tx = await cosmicGameProxy.connect(testingAcct).bid(params, { value: bidPrice });
	let receipt = await tx.wait();
	let topic_sig = cosmicGameProxy.interface.getEventTopic("BidEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("test bid");
	expect(parsed_log.args.bidPrice).to.equal(bidPrice);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);
}
async function bid_randomwalk(testingAcct, cosmicGameProxy, nftId) {
	let bidPrice = await cosmicGameProxy.getBidPrice();
	let rwalkAddr = await cosmicGameProxy.randomWalkNft();
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", rwalkAddr);
	let bidParams = { message: "rwalk bid", randomWalkNFTId: nftId };
	let params = hre.ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	tx = await cosmicGameProxy.connect(testingAcct).bid(params,{value:bidPrice});
	receipt = await tx.wait();
	topic_sig = cosmicGameProxy.interface.getEventTopic("BidEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("rwalk bid");
	expect(parsed_log.args.randomWalkNFTId).to.equal(nftId);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);
}
async function bid_and_donate(testingAcct, cosmicGameProxy, donatedTokenId) {
	let bidPrice = await cosmicGameProxy.getBidPrice();

	let rwalkAddr = await cosmicGameProxy.randomWalkNft();
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", rwalkAddr);
	await randomWalkNft.connect(testingAcct).setApprovalForAll(cosmicGameProxy.address, true);

	let bidParams = { message: "donate bid", randomWalkNFTId: -1 };
	let params = hre.ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	tx = await cosmicGameProxy
		.connect(testingAcct)
		.bidAndDonateNft(params, randomWalkNft.address, donatedTokenId, {value: bidPrice});
	receipt = await tx.wait();
	topic_sig = cosmicGameProxy.interface.getEventTopic("BidEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("donate bid");
	expect(parsed_log.args.bidPrice).to.equal(bidPrice);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);

	topic_sig = cosmicGameProxy.interface.getEventTopic("NftDonationEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donor).to.equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).to.equal(randomWalkNft.address);
	expect(parsed_log.args.nftId).to.equal(donatedTokenId);
}
async function bid_and_donate_with_rwalk(testingAcct, cosmicGameProxy, donatedTokenId, tokenIdBidding) {
	let bidPrice = await cosmicGameProxy.getBidPrice();

	let rwalkAddr = await cosmicGameProxy.randomWalkNft();
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", rwalkAddr);
	await randomWalkNft.connect(testingAcct).setApprovalForAll(cosmicGameProxy.address, true);

	let bidParams = { message: "donate nft rwalk bid", randomWalkNFTId: tokenIdBidding };
	let params = hre.ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	tx = await cosmicGameProxy
		.connect(testingAcct)
		.bidAndDonateNft(params, randomWalkNft.address, donatedTokenId, {value: bidPrice});
	receipt = await tx.wait();
	topic_sig = cosmicGameProxy.interface.getEventTopic("BidEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.message).to.equal("donate nft rwalk bid");
	expect(parsed_log.args.randomWalkNFTId).to.equal(tokenIdBidding);
	expect(parsed_log.args.lastBidder).to.equal(testingAcct.address);

	topic_sig = cosmicGameProxy.interface.getEventTopic("NftDonationEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.donor).to.equal(testingAcct.address);
	expect(parsed_log.args.nftAddress).to.equal(randomWalkNft.address);
	expect(parsed_log.args.nftId).to.equal(donatedTokenId);
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
	let cosmicGameProxy = await getCosmicGameProxyContract();

	await bid_simple(testingAcct, cosmicGameProxy);
	await bid_randomwalk(testingAcct, cosmicGameProxy, tokenList[0]);
	await bid_and_donate(testingAcct, cosmicGameProxy, tokenList[1]);
	await bid_and_donate_with_rwalk(testingAcct, cosmicGameProxy, tokenList[2], tokenList[3]);

	console.log("Bidding test result: success");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
