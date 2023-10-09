// Used to check the three main fields of deployed contracts: activationTime, charityAddress and randomWalk address
const hre = require("hardhat");
const { expect } = require("chai");
const {getCosmicGameContract} = require("./helper.js");
async function main() {

	let cosmicGame = await getCosmicGameContract();

	let activationTime = await cosmicGame.activationTime();
	let randomWalkAddr = await cosmicGame.randomWalk();
	let charityAddr = await cosmicGame.charity();
	let charityContract = await ethers.getContractAt("CharityWallet",charityAddr)
	let charityContractOwner = await charityContract.owner();
	let charityDonationsReceiver = await charityContract.charityAddress();

	console.log("activation time = "+activationTime);
	console.log("randomWalk address = "+randomWalkAddr);
	console.log("charity wallet contract address = "+charityAddr);
	console.log("owner of charity wallet contract = "+charityContractOwner);
	console.log("charity donations receiver ="+charityDonationsReceiver);
}
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

