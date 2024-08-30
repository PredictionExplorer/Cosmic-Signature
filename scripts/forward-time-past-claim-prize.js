const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract } = require("./helper.js");

async function main() {
	let cosmicGameProxy = await getCosmicGameProxyContract();
	//console.log(cosmicGameProxy);
	let timeUntil = await cosmicGameProxy.timeUntilPrize();
	console.log("Time until prize before: " + timeUntil.toString());
	let prizeTime = await cosmicGameProxy.timeUntilPrize();
	await hre.ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
	await hre.ethers.provider.send("evm_mine");

	timeUntil = await cosmicGameProxy.timeUntilPrize();
	console.log("Time until prize after: " + timeUntil.toString());
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
