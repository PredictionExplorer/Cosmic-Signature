const hre = require("hardhat");
const { expect } = require("chai");
const {getCosmicGameContract}  = require("./helper.js");

async function main() {
	let cosmicGame = await getCosmicGameContract();
	//console.log(cosmicGame);
	let timeUntil = await cosmicGame.timeUntilPrize();
	console.log("Time until prize before: "+timeUntil.toString());
	let prizeTime = await cosmicGame.timeUntilPrize();
	await hre.ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
	await hre.ethers.provider.send("evm_mine");
  
	timeUntil = await cosmicGame.timeUntilPrize();
	console.log("Time until prize after: "+timeUntil.toString());
}
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

