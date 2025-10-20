// // Comment-202509229 applies.

// "use strict";

// const hre = require("hardhat");
// const { getCosmicSignatureGameContract } = require("../helpers.js");
// const { mintRandomWalkNft } = require("./helpers.js");

// const numRWalkToMint = 4;

// async function mint_random_walks(testingAcct, cosmicSignatureGame) {
// 	let randomWalkNftAddress = await cosmicSignatureGame.randomWalkNft({blockTag: "pending",});
//
// 	// Comment-202502096 applies.
// 	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddress);
//
// 	let output = "";
// 	for (let i = 0; i < numRWalkToMint; i++) {
// 		if (output.length > 0) {
// 			output = output + ",";
// 		}
// 		let nftId = await mintRandomWalkNft(randomWalkNft, testingAcct);
// 		output = output + nftId.toString();
// 	}
// 	return output;
// }

// async function main() {
// 	let privKey = process.env.PRIVKEY;
// 	if (privKey == undefined || privKey.length <= 0) {
// 		console.info(
// 			"%s",
// 			// todo-9 "scripts/deploy.js" no longer exists.
// 			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
// 		);
// 		process.exit(1);
// 	}
// 	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
// 	let cosmicSignatureGame = await getCosmicSignatureGameContract();
//
// 	let token_list = await mint_random_walks(testingAcct, cosmicSignatureGame);
// 	console.info("%s", token_list);
// }

// main()
// 	.then(() => {})
// 	.catch((errorObject_) => {
// 		console.error("%o", errorObject_);
// 		process.exitCode = 1;
// 	});
