// Used to check the three main fields of deployed contracts: activationTime, charityAddress and randomWalkNft address

const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract } = require("./helper.js");

async function main() {
	let cosmicGameProxy = await getCosmicGameProxyContract();

	let activationTime = await cosmicGameProxy.activationTime();
	let randomWalkNftAddr_ = await cosmicGameProxy.randomWalkNft();
	let charityAddr = await cosmicGameProxy.charity();
	let charityContract = await hre.ethers.getContractAt("CharityWallet", charityAddr);
	let charityContractOwner = await charityContract.owner();
	let charityDonationsReceiver = await charityContract.charityAddress();

	console.log("activation time = " + activationTime);
	console.log("randomWalkNft address = " + randomWalkNftAddr_);
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
