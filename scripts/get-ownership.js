const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameContract } = require("./helper.js");

async function main() {
	let cosmicGame = await getCosmicGameContract();

	let o, addr;
	o = await cosmicGame.owner();
	console.log("Owner of CosmicGame: " + o);

	addr = cosmicGame.token();
	let tokenContract = await ethers.getContractAt("CosmicToken", addr);
	o = await tokenContract.owner();
	console.log("Owner of CosmicToken: " + o);

	addr = cosmicGame.nft();
	let cstContract = await ethers.getContractAt("CosmicSignature", addr);
	o = await cstContract.owner();
	console.log("Owner of CosmicSignature: " + o);

	addr = cosmicGame.raffleWallet();
	let raffleWalletContract = await ethers.getContractAt("RaffleWallet", addr);
	o = await raffleWalletContract.owner();
	console.log("Owner of RaffleWallet: " + o);

	addr = await cosmicGame.charity();
	console.log("CharityWallet contract at CosmicGame contract: " + addr);
	let charityContract = await ethers.getContractAt("CharityWallet", addr);
	addr = await charityContract.charityAddress();
	console.log("Charity address at CharityWallet contract: " + addr);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
