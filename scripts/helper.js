const hre = require("hardhat");

async function getCosmicGameProxyContract() {
	let cosmicGameProxyAddr = process.env.COSMIC_GAME_ADDRESS;
	if (typeof cosmicGameProxyAddr === "undefined" || cosmicGameProxyAddr.length != 42) {
		console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGameProxy = await hre.ethers.getContractAt("CosmicGame", cosmicGameProxyAddr);
	return cosmicGameProxy;
}
async function getBidderContract() {
	let bidderContractAddr = process.env.BIDDER_CONTRACT_ADDRESS;
	if (typeof bidderContractAddr === "undefined" || bidderContractAddr.length != 42) {
		console.log("BIDDER_CONTRACT_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	console.log(bidderContractAddr);
	let bidderContract = await hre.ethers.getContractAt("BidderContract", bidderContractAddr);
	return bidderContract;
}
module.exports = { getCosmicGameProxyContract, getBidderContract };
