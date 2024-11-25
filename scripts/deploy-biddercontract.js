// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function main() {
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	const [owner] = await hre.ethers.getSigners();
	const BidderContract = await hre.ethers.getContractFactory("BidderContract");
	let bidderContract = await BidderContract.connect(owner).deploy(cosmicSignatureGame.address);
	await bidderContract.deployed();

	console.log("BidderContract address: " + bidderContract.address);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
