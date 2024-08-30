// Used to check the three main fields of deployed contracts: activationTime, charityAddress and randomWalk address
const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract } = require("./helper.js");
async function main() {
	let cosmicGameProxy = await getCosmicGameProxyContract();

	let activationTime = await cosmicGameProxy.activationTime();
	let randomWalkAddr = await cosmicGameProxy.randomWalk();
	let charityAddr = await cosmicGameProxy.charity();
	let charityContract = await ethers.getContractAt("CharityWallet", charityAddr);
	let charityContractOwner = await charityContract.owner();
	let charityDonationsReceiver = await charityContract.charityAddress();

	console.log("activation time = " + activationTime);
	console.log("randomWalk address = " + randomWalkAddr);
	console.log("charity wallet contract address = " + charityAddr);
	console.log("owner of charity wallet contract = " + charityContractOwner);
	console.log("charity donations receiver =" + charityDonationsReceiver);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
