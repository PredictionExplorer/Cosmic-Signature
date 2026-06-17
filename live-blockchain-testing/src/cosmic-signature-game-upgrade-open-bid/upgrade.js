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
// 	// 		"Error. Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
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
// 				call: "initializeV2",
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
