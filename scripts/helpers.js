/// [Comment-202509229]
/// Issue. These are legacy functions that I preserved for now.
/// Consider deleting them.
/// [/Comment-202509229]

// See also: "../src/Helpers.js".

"use strict";

// const hre = require("hardhat");

// // todo-1 This should return an object: `{cosmicSignatureGameAddress, cosmicSignatureGame,}`.
// async function getCosmicSignatureGameContract(cosmicSignatureGameContractName = "CosmicSignatureGame") {
// 	const cosmicSignatureGameAddress = process.env.COSMIC_SIGNATURE_GAME_ADDRESS;
// 	// todo-1 Unnecessary to validate length?
// 	if (cosmicSignatureGameAddress == undefined || cosmicSignatureGameAddress.length != 42) {
// 		console.error("COSMIC_SIGNATURE_GAME_ADDRESS environment variable does not contain contract address.");
// 		process.exit(1);
// 	}
//
// 	// [Comment-202502096]
// 	// Issue. This uses default signer. Is it a problem?
// 	// todo-1 Everywhere we call `getContractAt`, think about the above.
// 	// todo-1 Everywhere we call `getContractAt`, consider calling `attach`. See `deployContractsAdvanced`.
// 	// todo-1 Also `getContractFactory`.
// 	// todo-1 Mybe add a param: `ownerSigner`, similar to `deployerSigner` in some other functions.
// 	// todo-1 Some scripts use the `PRIVKEY` environment variable. So the caller can pass that wallet to us.
// 	// [/Comment-202502096]
// 	const cosmicSignatureGame = await hre.ethers.getContractAt(cosmicSignatureGameContractName, cosmicSignatureGameAddress);
//
// 	return cosmicSignatureGame;
// }

// // todo-1 This should return an object: `{bidderContractAddress, bidderContract,}`.
// async function getBidderContract() {
// 	const bidderContractAddress = process.env.BIDDER_CONTRACT_ADDRESS;
// 	// todo-1 Unnecessary to validate length?
// 	if (bidderContractAddress == undefined || bidderContractAddress.length != 42) {
// 		console.error("BIDDER_CONTRACT_ADDRESS environment variable does not contain contract address.");
// 		process.exit(1);
// 	}
///
// 	// Comment-202502096 applies.
// 	const bidderContract = await hre.ethers.getContractAt("BidderContract", bidderContractAddress);
//
// 	return bidderContract;
// }

module.exports = {
	// getCosmicSignatureGameContract,
	// getBidderContract,
};
