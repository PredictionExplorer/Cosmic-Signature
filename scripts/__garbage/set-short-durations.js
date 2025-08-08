// Sets short time intervals to avoid waiting for running tests

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function set_parameters(testingAcct, cosmicSignatureGame) {
	// todo-1 Do we need to also set duration until bidding round activation here.

	const mainPrizeTimeIncrementInMicroSeconds = 3n * 60n * 1_000_000n;
	await cosmicSignatureGame.connect(testingAcct).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds);
	const initialDurationUntilMainPrizeDivisor = (mainPrizeTimeIncrementInMicroSeconds + 60n / 2n) / 60n;
	await cosmicSignatureGame.connect(testingAcct).setInitialDurationUntilMainPrizeDivisor(initialDurationUntilMainPrizeDivisor);
	const timeoutDurationToClaimMainPrize = 60n * 3n / 2n;
	await cosmicSignatureGame.connect(testingAcct).setTimeoutDurationToClaimMainPrize(timeoutDurationToClaimMainPrize);
	console.info("Main prize time increment in microseconds =", mainPrizeTimeIncrementInMicroSeconds);
	console.info("Initial duration until main prize divisor =", initialDurationUntilMainPrizeDivisor);
	console.info("Timeout duration to claim main prize =", timeoutDurationToClaimMainPrize);
}

async function main() {
	let privKey = process.env.PRIVKEY;
	if (privKey == undefined || privKey.length <= 0) {
		console.info(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	await set_parameters(testingAcct, cosmicSignatureGame);

	console.info("Completed.");
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
