// // Comment-202509229 applies.

// "use strict";

// const hre = require("hardhat");
// const { getCosmicSignatureGameContract } = require("../helpers.js");

// /// Comment-202412129 relates.
// async function main() {
// 	// let privKey = process.env.PRIVKEY;
// 	// if (privKey == undefined || privKey.length <= 0) {
// 	// 	console.info(
// 	// 		// todo-1 "scripts/deploy.js" no longer exists.
// 	// 		"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
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
// 	const cosmicSignatureGame2Proxy =
// 		await hre.upgrades.upgradeProxy(
// 			cosmicSignatureGameProxy,
// 			cosmicSignatureGameOpenBidFactory,
// 			{
// 				kind: "uups",
// 				call: "initialize2",
// 			}
// 		);
// 	await cosmicSignatureGame2Proxy.waitForDeployment();
// 	const cosmicSignatureGame2ImplementationAddress = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddress);
// 	console.info("Implementation address =", cosmicSignatureGame2ImplementationAddress);
// 	console.info("timesEthBidPrice =", await cosmicSignatureGame2Proxy.timesEthBidPrice());
// }

// main()
// 	.then(() => (process.exit(0)))
// 	.catch((errorObject_) => {
// 		console.error(errorObject_);
// 		process.exit(1);
// 	});
