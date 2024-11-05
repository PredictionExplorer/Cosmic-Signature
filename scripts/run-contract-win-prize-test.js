const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract, getBidderContract } = require("./helper.js");

async function main() {
	let bidderContract = await getBidderContract();
	let cosmicGameProxyAddr = await bidderContract.cosmicGameProxy();
	let cosmicGameProxy = await hre.ethers.getContractAt("CosmicGame", cosmicGameProxyAddr);
	let bidPrice = await cosmicGameProxy.getBidPrice();

	const [owner, addr1, addr2] = await hre.ethers.getSigners();
	await cosmicGameProxy.connect(owner).bid("owner bids", { value: bidPrice });
	bidPrice = await cosmicGameProxy.getBidPrice();
	await cosmicGameProxy.connect(addr1).bid("addr1 bids", { value: bidPrice });
	bidPrice = await cosmicGameProxy.getBidPrice();
	await cosmicGameProxy.connect(addr2).bid("addr2 bids", { value: bidPrice });
	let randomWalkNftAddr_ = await cosmicGameProxy.randomWalkNft();
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	let rwalkPrice = await randomWalkNft.getMintPrice();
	await randomWalkNft.connect(owner).setApprovalForAll(cosmicGameProxy.address, true);
	await randomWalkNft.connect(owner).setApprovalForAll(bidderContract.address, true);
	let tx = await randomWalkNft.connect(owner).mint({ value: rwalkPrice });
	let receipt = await tx.wait();
	let topic_sig = randomWalkNft.interface.getEventTopic("MintEvent");
	let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = randomWalkNft.interface.parseLog(log);
	let token_id = parsed_log.args.tokenId;
	bidPrice = await cosmicGameProxy.getBidPrice();
	console.log("tokenid= " + token_id);
	await randomWalkNft.connect(owner).transferFrom(owner.address, bidderContract.address, token_id);
	await bidderContract.connect(owner).doBidAndDonate(randomWalkNftAddr_, token_id, { value: bidPrice });

	bidPrice = await cosmicGameProxy.getBidPrice();
	await bidderContract.connect(owner).doBid({ value: bidPrice });

	rwalkPrice = await randomWalkNft.getMintPrice();
	tx = await randomWalkNft.connect(owner).mint({ value: rwalkPrice });
	receipt = await tx.wait();
	topic_sig = randomWalkNft.interface.getEventTopic("MintEvent");
	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = randomWalkNft.interface.parseLog(log);
	token_id = parsed_log.args.tokenId;
	await randomWalkNft.connect(owner).transferFrom(owner.address, bidderContract.address, token_id);
	await bidderContract.connect(owner).doBidRWalk(token_id);

	let prizeTime = await cosmicGameProxy.timeUntilPrize();
	await hre.ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);

	await bidderContract.connect(owner).doClaim();
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
