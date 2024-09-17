const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract } = require("./helper.js");

async function main() {
	let cosmicGameProxy = await getCosmicGameProxyContract();

	const [owner] = await ethers.getSigners();
	const BidderContract = await hre.ethers.getContractFactory("BidderContract");
	let bidderContract = await BidderContract.connect(owner).deploy(cosmicGameProxy.address);
	await bidderContract.deployed();

	console.log("BidderContract address: " + bidderContract.address);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
