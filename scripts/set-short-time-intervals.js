// todo-1 Rename this file to "set-short-durations.js".

// todo-0 Revisit this. See todos.
// todo-0 Set the durations that aren't proportional.
// todo-0 Those are duration until activation and timeout to claim.

// Sets short time intervals to avoid waiting for running tests

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function set_parameters(testingAcct, cosmicSignatureGame) {
	const mainPrizeTimeIncrementInMicroSeconds_ = 180_000_000n;
	await cosmicSignatureGame.connect(testingAcct).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds_);
	// todo-0 Rename this like the respectiva variable in the contract.
	// todo-0 But this is no longer needed.
	const initialSeconds = 60n;
	await cosmicSignatureGame.connect(testingAcct).setInitialSecondsUntilPrize(initialSeconds);
	// todo-0 Rename this like the respectiva variable in the contract.
	const timeoutDuration = 90n;
	await cosmicSignatureGame.connect(testingAcct).setTimeoutDurationToClaimMainPrize(timeoutDuration);
	// todo-0 Fhrase these better.
	console.log("Main prize time increment in microseconds =", mainPrizeTimeIncrementInMicroSeconds_);
	console.log("Initial duration until main prize =", initialSeconds);
	console.log("Timeout duration to claim main prize =", timeoutDuration);
}

async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	await set_parameters(testingAcct, cosmicSignatureGame);

	console.log("Completed.");
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
