// Sets short time intervals to avoid waiting for running tests

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function set_parameters(testingAcct, cosmicSignatureGame) {
	let microSeconds = hre.ethers.BigNumber.from("180000000");
	await cosmicSignatureGame.connect(testingAcct).setMainPrizeTimeIncrementInMicroSeconds(microSeconds);
	let initialSeconds = hre.ethers.BigNumber.from("60");
	await cosmicSignatureGame.connect(testingAcct).setInitialSecondsUntilPrize(initialSeconds);
	let timeoutDuration = hre.ethers.BigNumber.from("90");
	await cosmicSignatureGame.connect(testingAcct).setTimeoutDurationToClaimMainPrize(timeoutDuration);
	console.log("Main prize time increment in microseconds =", microSeconds);
	console.log("Initial duration until main prize =", initialSeconds);
	console.log("Timeout duration to claim main prize =", timeoutDuration);
}

async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
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
