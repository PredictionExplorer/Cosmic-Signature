// Confirms that deployed contracts are fully operational

"use strict";

// const { expect } = require("chai");
// const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	// let privKey = process.env.PRIVKEY;
	// if (privKey == undefined || privKey.length <= 0) {
	// 	console.info(
	// 		// todo-1 "scripts/deploy.js" no longer exists.
	// 		"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
	// 	);
	// 	process.exit(1);
	// }
	// let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	const cosmicSignatureGame = await getCosmicSignatureGameContract("SelfDestructibleCosmicSignatureGame");
	await cosmicSignatureGame.finalizeTesting();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
