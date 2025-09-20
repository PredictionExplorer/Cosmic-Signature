// // Comment-202509229 applies.

// "use strict";

// // const hre = require("hardhat");
// const { getCosmicSignatureGameContract } = require("../helpers.js");

// async function main() {
// 	// let privKey = process.env.PRIVKEY;
// 	// if (privKey == undefined || privKey.length <= 0) {
// 	// 	console.info(
// 	// 		// todo-9 "scripts/deploy.js" no longer exists.
// 	// 		"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
// 	// 	);
// 	// 	process.exit(1);
// 	// }
// 	// let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
// 	const cosmicSignatureGame = await getCosmicSignatureGameContract("SelfDestructibleCosmicSignatureGame");
// 	// todo-9 It appears that we need to call `waitForTransactionReceipt` here.
// 	await cosmicSignatureGame.finalizeTesting();
// }

// main()
// 	.then(() => { process.exit(0); })
// 	.catch((errorObject_) => {
// 		console.error(errorObject_);
// 		process.exit(1);
// 	});
