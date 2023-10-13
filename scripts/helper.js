//const hre = require("hardhat");
async function getCosmicGameContract() {

	let cosmicGameAddr = process.env.COSMIC_GAME_ADDRESS;
	if ((typeof cosmicGameAddr === 'undefined') || (cosmicGameAddr.length != 42) )  {
		console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGame = await ethers.getContractAt("CosmicGame",cosmicGameAddr)
	return cosmicGame;
}
async function getBidderContract() {

	let bidderContractAddr = process.env.BIDDER_CONTRACT_ADDRESS;
	if ((typeof bidderContractAddr === 'undefined') || (bidderContractAddr.length != 42) )  {
		console.log("BIDDER_CONTRACT_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	console.log(bidderContractAddr)
	let bidderContract = await ethers.getContractAt("BidderContract",bidderContractAddr)
	return bidderContract;
}
module.exports = {getCosmicGameContract,getBidderContract};
