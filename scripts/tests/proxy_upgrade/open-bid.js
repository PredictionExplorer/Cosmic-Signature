"use strict";

const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("../../helper.js");

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
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract("CosmicSignatureGameOpenBid");

	let multiplier = await cosmicSignatureGame.timesBidPrice()
	// let bidParams = { message: "open bid", randomWalkNftId: -1, isOpenBid: true };
	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding],[bidParams]);
	let bidPrice = await cosmicSignatureGame.getBidPrice();
	console.log("bidPrice before:", bidPrice);
	await cosmicSignatureGame.connect(testingAcct).bid(/*params*/ (-1), true, "open bid", { value: bidPrice * multiplier, gasLimit: 30000000 });
	bidPrice = await cosmicSignatureGame.getBidPrice();
	console.log("bidPrice after:", bidPrice);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});