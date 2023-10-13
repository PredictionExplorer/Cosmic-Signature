const hre = require("hardhat");
const { expect } = require("chai");
const {getCosmicGameContract,getBidderContract}  = require("./helper.js");

async function main() {

	let bidderContract = await getBidderContract();
	let cosmicGameAddr = await bidderContract.cosmicGameContract();
	let cosmicGame = await ethers.getContractAt("CosmicGame",cosmicGameAddr)
	let bidPrice = await cosmicGame.getBidPrice();

	[owner,addr1,addr2 ] = await ethers.getSigners();
	await cosmicGame.connect(owner).bid("owner bids", {value: bidPrice});
	bidPrice = await cosmicGame.getBidPrice();
	await cosmicGame.connect(addr1).bid("addr1 bids", {value: bidPrice});
	bidPrice = await cosmicGame.getBidPrice();
	await cosmicGame.connect(addr2).bid("addr2 bids", {value: bidPrice});
	let randomWalkAddr = await cosmicGame.randomWalk();
	let randomWalk = await ethers.getContractAt("RandomWalkNFT",randomWalkAddr);
	let rwalkPrice = await randomWalk.getMintPrice();
	await randomWalk.connect(owner).setApprovalForAll(cosmicGame.address, true);
	let tx = await randomWalk.connect(owner).mint({value: rwalkPrice});
	let receipt = await tx.wait();
	let topic_sig = randomWalk.interface.getEventTopic("MintEvent");
	let log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
	let parsed_log = randomWalk.interface.parseLog(log);
	let token_id = parsed_log.args.tokenId;
	bidPrice = await cosmicGame.getBidPrice();
	console.log("tokenid= "+token_id);
	await bidderContract.connect(owner).do_bid_and_donate(randomWalkAddr,token_id,{value:bidPrice});

	bidPrice = await cosmicGame.getBidPrice();
	await bidderContract.connect(owner).do_bid({value:bidPrice});
  
	let prizeTime = await cosmicGame.timeUntilPrize();
	await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);

	await bidderContract.connect(owner).do_claim();
}
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

