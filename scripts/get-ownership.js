const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract } = require("./helper.js");

async function main() {
	let cosmicGameProxy = await getCosmicGameProxyContract();

	let o, addr;
	o = await cosmicGameProxy.owner();
	console.log("Owner of CosmicGameProxy: " + o);

	addr = cosmicGameProxy.token();
	let tokenContract = await hre.ethers.getContractAt("CosmicToken", addr);
	o = await tokenContract.owner();
	console.log("Owner of CosmicToken: " + o);

	addr = cosmicGameProxy.nft();
	let cstContract = await hre.ethers.getContractAt("CosmicSignature", addr);
	o = await cstContract.owner();
	console.log("Owner of CosmicSignature: " + o);

	addr = cosmicGameProxy.raffleWallet();
	let raffleWalletContract = await hre.ethers.getContractAt("RaffleWallet", addr);
	o = await raffleWalletContract.owner();
	console.log("Owner of RaffleWallet: " + o);

	addr = await cosmicGameProxy.charity();
	console.log("CharityWallet contract at CosmicGameProxy contract: " + addr);
	let charityContract = await hre.ethers.getContractAt("CharityWallet", addr);
	addr = await charityContract.charityAddress();
	console.log("Charity address at CharityWallet contract: " + addr);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
