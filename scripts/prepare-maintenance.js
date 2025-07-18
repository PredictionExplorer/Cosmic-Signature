// todo-1 There is no such thing as runtime and maintenance modes any more. Now `roundActivationTime` plays that role.

"use strict";

const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	let privKey = process.env.PRIVKEY;
	if (privKey == undefined || privKey.length <= 0) {
		console.log(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	// todo-1 Why do we need error handling here?
	try {
		// todo-1 This function no longer exists.
		await cosmicSignatureGame.connect(testingAcct).prepareMaintenance();
	} catch(e) {
		console.log(e);
	}
	// todo-1 This function no longer exists.
	let systemModeCode = await cosmicSignatureGame.systemMode();
	console.log("systemMode =", systemModeCode);
	if (systemModeCode.toString() == "1") {
		console.log("System is set for maintenance right after next claimMainPrize() call")
	} else {
		if (systemModeCode.toString() == "2") {
			console.log("System is in maintenance mode already");
		} else {
			console.log("Call failed");
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
