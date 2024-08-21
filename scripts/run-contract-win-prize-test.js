const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract, getBidderContract } = require("./helper.js");

async function main() {
	let bidderContract = await getBidderContract();
	let cosmicGameProxyAddr = await bidderContract.cosmicGameProxy();
	let cosmicGameProxy = await ethers.getContractAt("CosmicGame", cosmicGameProxyAddr);
	let bidPrice = await cosmicGameProxy.getBidPrice();

	[owner, addr1, addr2] = await ethers.getSigners();
	await cosmicGameProxy.connect(owner).bid("owner bids", { value: bidPrice });
	bidPrice = await cosmicGameProxy.getBidPrice();
	await cosmicGameProxy.connect(addr1).bid("addr1 bids", { value: bidPrice });
	bidPrice = await cosmicGameProxy.getBidPrice();
	await cosmicGameProxy.connect(addr2).bid("addr2 bids", { value: bidPrice });
	let randomWalkAddr = await cosmicGameProxy.randomWalk();
	let randomWalk = await ethers.getContractAt("RandomWalkNFT", randomWalkAddr);
	let rwalkPrice = await randomWalk.getMintPrice();
	await randomWalk.connect(owner).setApprovalForAll(cosmicGameProxy.address, true);
	await randomWalk.connect(owner).setApprovalForAll(bidderContract.address, true);
	let tx = await randomWalk.connect(owner).mint({ value: rwalkPrice });
	let receipt = await tx.wait();
	let topic_sig = randomWalk.interface.getEventTopic("MintEvent");
	let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = randomWalk.interface.parseLog(log);
	let token_id = parsed_log.args.tokenId;
	bidPrice = await cosmicGameProxy.getBidPrice();
	console.log("tokenid= " + token_id);
	await randomWalk.connect(owner).transferFrom(owner.address, bidderContract.address, token_id);
	await bidderContract.connect(owner).doBidAndDonate(randomWalkAddr, token_id, { value: bidPrice });

	bidPrice = await cosmicGameProxy.getBidPrice();
	await bidderContract.connect(owner).doBid({ value: bidPrice });

	rwalkPrice = await randomWalk.getMintPrice();
	tx = await randomWalk.connect(owner).mint({ value: rwalkPrice });
	receipt = await tx.wait();
	topic_sig = randomWalk.interface.getEventTopic("MintEvent");
	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = randomWalk.interface.parseLog(log);
	token_id = parsed_log.args.tokenId;
	await randomWalk.connect(owner).transferFrom(owner.address, bidderContract.address, token_id);
	await bidderContract.connect(owner).doBidRWalk(token_id);

	let prizeTime = await cosmicGameProxy.timeUntilPrize();
	await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);

	await bidderContract.connect(owner).doClaim();
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
