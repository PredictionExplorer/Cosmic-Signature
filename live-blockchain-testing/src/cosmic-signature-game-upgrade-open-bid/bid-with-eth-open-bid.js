// // Comment-202509229 applies.

// "use strict";

// const hre = require("hardhat");
// const { getCosmicSignatureGameContract } = require("../helpers.js");

// // const bidParamsEncoding = {
// // 	type: "tuple(string,int256,bool)",
// // 	name: "BidParams",
// // 	components: [
// // 		{ name: "message", type: "string" },
// // 		{ name: "randomWalkNftId", type: "int256" },
// // 		{ name: "isOpenBid", type: "bool"},
// // 	],
// // };

// async function main() {
// 	let privKey = process.env.PRIVKEY;
// 	if (privKey == undefined || privKey.length <= 0) {
// 		console.info(
// 			// todo-1 "scripts/deploy.js" no longer exists.
// 			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
// 		);
// 		process.exit(1);
// 	}
// 	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
// 	let cosmicSignatureGame = await getCosmicSignatureGameContract("CosmicSignatureGameOpenBid");
//
// 	let multiplier = await cosmicSignatureGame.timesEthBidPrice()
// 	// let bidParams = {message: "open bid test", randomWalkNftId: -1n, isOpenBid: true,};
// 	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
// 	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice({blockTag: "pending",});
// 	console.info("nextEthBidPrice before:", nextEthBidPrice);
// 	// todo-1 Revisit this `gasLimit` thing.
// 	// todo-9 It appears that we need to call `waitForTransactionReceipt` here.
// 	await cosmicSignatureGame.connect(testingAcct).bidWithEth(/*params*/ -1n, true, "open bid test", {value: nextEthBidPrice * multiplier, gasLimit: 30_000_000,});
// 	nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice({blockTag: "pending",});
// 	console.info("nextEthBidPrice after:", nextEthBidPrice);
// }

// main()
// 	.then(() => { process.exit(0); })
// 	.catch((errorObject_) => {
// 		console.error(errorObject_);
// 		process.exit(1);
// 	});
