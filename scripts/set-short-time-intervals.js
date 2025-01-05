// todo-1 Rename this file to "set-short-durations.js".

// Sets short time intervals to avoid waiting for running tests

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function set_parameters(testingAcct, cosmicSignatureGame) {
	// todo-0 Do we need to also set duration until activation here.

	const mainPrizeTimeIncrementInMicroSeconds_ = 3n * 60n * 1_000_000n;
	await cosmicSignatureGame.connect(testingAcct).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds_);
	const initialDurationUntilMainPrizeDivisor_ = 60n * 1_000_000n;
	await cosmicSignatureGame.connect(testingAcct).setInitialDurationUntilMainPrizeDivisor(initialDurationUntilMainPrizeDivisor_);
	const timeoutDurationToClaimMainPrize_ = 60n * 3n / 2n;
	await cosmicSignatureGame.connect(testingAcct).setTimeoutDurationToClaimMainPrize(timeoutDurationToClaimMainPrize_);
	console.log("Main prize time increment in microseconds =", mainPrizeTimeIncrementInMicroSeconds_);
	console.log("Initial duration until main prize divisor =", initialDurationUntilMainPrizeDivisor_);
	console.log("Timeout duration to claim main prize =", timeoutDurationToClaimMainPrize_);
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
