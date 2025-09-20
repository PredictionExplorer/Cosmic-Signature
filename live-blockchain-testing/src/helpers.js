"use strict";

// const hre = require("hardhat");

// /// [Comment-202509229]
// /// Issue. This is a legacy function that I stopped short of deleting for now.
// /// Consider deleting it.
// /// [/Comment-202509229]
// /// todo-9 This should return an object: `{cosmicSignatureGameAddress, cosmicSignatureGame,}`.
// async function getCosmicSignatureGameContract(cosmicSignatureGameContractName = "CosmicSignatureGame") {
// 	const cosmicSignatureGameAddress = process.env.COSMIC_SIGNATURE_GAME_ADDRESS;
// 	if (cosmicSignatureGameAddress == undefined || cosmicSignatureGameAddress.length <= 0) {
// 		console.error("COSMIC_SIGNATURE_GAME_ADDRESS environment variable does not contain contract address.");
// 		process.exit(1);
// 	}
//
// 	// [Comment-202502096]
// 	// Issue. This uses default signer. Is it a problem?
// 	// todo-9 Everywhere we call `getContractAt`, think about the above.
// 	// todo-9 Everywhere we call `getContractAt`, consider calling `attach` on the contract factory. See `deployContractsAdvanced`.
// 	// todo-9 Mybe add a param: `defaultSigner`, similar to `deployerSigner` in some other functions.
// 	// todo-9 Some scripts use the `PRIVKEY` environment variable. So the caller can pass that wallet to us.
// 	// [/Comment-202502096]
// 	const cosmicSignatureGame = await hre.ethers.getContractAt(cosmicSignatureGameContractName, cosmicSignatureGameAddress);
//
// 	return cosmicSignatureGame;
// }

// /// Comment-202509229 applies.
// /// todo-9 This should return an object: `{bidderContractAddress, bidderContract,}`.
// async function getBidderContract() {
// 	const bidderContractAddress = process.env.BIDDER_CONTRACT_ADDRESS;
// 	if (bidderContractAddress == undefined || bidderContractAddress.length <= 0) {
// 		console.error("BIDDER_CONTRACT_ADDRESS environment variable does not contain contract address.");
// 		process.exit(1);
// 	}
//
// 	// Comment-202502096 applies.
// 	const bidderContract = await hre.ethers.getContractAt("BidderContract", bidderContractAddress);
//
// 	return bidderContract;
// }

module.exports = {
	// getCosmicSignatureGameContract,
	// getBidderContract,
};
