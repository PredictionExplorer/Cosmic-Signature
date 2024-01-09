const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameContract } = require("./helper.js");

async function main() {
	let cosmicGame = await getCosmicGameContract();

	[owner] = await ethers.getSigners();
	const BidderContract = await ethers.getContractFactory("BidderContract");
	let bidderContract = await BidderContract.connect(owner).deploy(cosmicGame.address);
	await bidderContract.deployed();

	console.log("BidderContract address: " + bidderContract.address);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
