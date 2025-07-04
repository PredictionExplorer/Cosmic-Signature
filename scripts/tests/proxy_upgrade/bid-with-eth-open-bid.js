"use strict";

const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("../../helpers.js");

// const bidParamsEncoding = {
// 	type: "tuple(string,int256,bool)",
// 	name: "BidParams",
// 	components: [
// 		{ name: "message", type: "string" },
// 		{ name: "randomWalkNftId", type: "int256" },
// 		{ name: "isOpenBid", type: "bool"},
// 	],
// };

async function main() {
	let privKey = process.env.PRIVKEY;
	if (privKey == undefined || privKey.length <= 0) {
		console.log(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract("CosmicSignatureGameOpenBid");

	let multiplier = await cosmicSignatureGame.timesEthBidPrice()
	// let bidParams = { message: "open bid", randomWalkNftId: -1, isOpenBid: true };
	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	console.log("nextEthBidPrice before:", nextEthBidPrice);
	// todo-1 Think about `gasLimit`. Maybe add it in some other places. Is there a default value when sending to a testnet or mainnet?
	await cosmicSignatureGame.connect(testingAcct).bidWithEth(/*params*/ (-1), true, "open bid", {value: nextEthBidPrice * multiplier, gasLimit: 30000000});
	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	console.log("nextEthBidPrice after:", nextEthBidPrice);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
