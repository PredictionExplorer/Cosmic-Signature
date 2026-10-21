// // Comment-202509229 applies.

// "use strict";

// // const hre = require("hardhat");
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
// 	const cosmicSignatureGame = await getCosmicSignatureGameContract("SelfDestructibleCosmicSignatureGame");
// 	// todo-9 It appears that we need to call `waitForTransactionReceipt` here.
// 	await cosmicSignatureGame.finalizeTesting();
// }

// main()
// 	.then(() => {})
// 	.catch((errorObject_) => {
// 		console.error("%o", errorObject_);
// 		process.exitCode = 1;
// 	});
