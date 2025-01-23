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
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract("CosmicSignatureGameOpenBid");
	// let bidParams = { message: "bid test", randomWalkNftId: -1, isOpenBid: false };
	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	let nextEthBidPrice_ = await cosmicSignatureGame.getNextEthBidPrice(0n);
	await cosmicSignatureGame.connect(testingAcct).bid(/*params*/ (-1), false, "bid test", {value: nextEthBidPrice_, gasLimit: 30000000});
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
