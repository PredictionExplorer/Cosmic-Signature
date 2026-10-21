// // Comment-202509229 applies.

// "use strict";

// const hre = require("hardhat");
// const { getCosmicSignatureGameContract } = require("../helpers.js");

// async function main() {
// 	// let privKey = process.env.PRIVKEY;
// 	// if (privKey === undefined || privKey.length <= 0) {
// 	// 	console.error(
// 	// 		"%s",
// 	// 		// todo-9 "scripts/deploy.js" no longer exists.
// 	// 		"Error. Supply PRIVKEY at a hidden prompt before starting this script; see live-blockchain-tests-old.md. Never put a literal key in a command.",
// 	// 	);
// 	// 	process.exit(1);
// 	// }
// 	// let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
// 	const cosmicSignatureGameProxy = await getCosmicSignatureGameContract();
// 	const cosmicSignatureGameProxyAddress = await cosmicSignatureGameProxy.getAddress();
//
// 	// Comment-202502096 applies.
// 	const cosmicSignatureGameOpenBidFactory = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
//
// 	const cosmicSignatureGameOpenBidProxy =
// 		await hre.upgrades.upgradeProxy(
// 			cosmicSignatureGameProxy,
// 			cosmicSignatureGameOpenBidFactory,
// 			{
// 				kind: "uups",
// 				call: "reinitialize",
// 			}
// 		);
// 	// await cosmicSignatureGameOpenBidProxy.waitForDeployment();
// 	// todo-9 Should we call `safeErc1967GetChangedImplementationAddress` instead?
// 	const cosmicSignatureGameOpenBidImplementationAddress = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddress);
// 	console.info("%s", `Implementation address = ${cosmicSignatureGameOpenBidImplementationAddress}`);
// 	console.info("%s", `timesEthBidPrice = ${await cosmicSignatureGameOpenBidProxy.timesEthBidPrice({blockTag: "pending",})}`);
// }

// main()
// 	.then(() => {})
// 	.catch((errorObject_) => {
// 		console.error("%o", errorObject_);
// 		process.exitCode = 1;
// 	});
