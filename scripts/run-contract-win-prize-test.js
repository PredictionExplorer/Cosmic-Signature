const hre = require("hardhat");
const { expect } = require("chai");
const {getCosmicGameContract,getBidderContract}  = require("./helper.js");

async function main() {

	let bidderContract = await getBidderContract();
	let cosmicGameAddr = await bidderContract.cosmicGameContract();
	let cosmicGame = await ethers.getContractAt("CosmicGame",cosmicGameAddr)
	let bidPrice = await cosmicGame.getBidPrice();

	[owner,addr1,addr3 ] = await ethers.getSigners();
	await cosmicGame.connect(owner).bid("owner bids", {value: bidPrice});
	bidPrice = await cosmicGame.getBidPrice();
	await cosmicGame.connect(owner).bid("addr1 bids", {value: bidPrice});
	bidPrice = await cosmicGame.getBidPrice();
	await cosmicGame.connect(owner).bid("addr2 bids", {value: bidPrice});
	bidPrice = await cosmicGame.getBidPrice();
	await bidderContract.do_bid({value:bidPrice});
  
	let prizeTime = await cosmicGame.timeUntilPrize();
	await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);

	await bidderContract.do_claim();
}
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

