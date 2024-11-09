// Sets short time intervals to avoid waiting for running tests

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicGameProxyContract } = require("./helper.js");

async function set_parameters(testingAcct, cosmicGameProxy) {
	let nanoseconds = hre.ethers.BigNumber.from("180000000000");
	await cosmicGameProxy.connect(testingAcct).setNanoSecondsExtra(nanoseconds);
	let initialseconds = hre.ethers.BigNumber.from("60");
	await cosmicGameProxy.connect(testingAcct).setInitialSecondsUntilPrize(initialseconds);
	let timeout = hre.ethers.BigNumber.from("90");
	await cosmicGameProxy.connect(testingAcct).setTimeoutDurationToClaimMainPrize(timeout);
	console.log("Nanoseconds extra = " + nanoseconds);
	console.log("Initial seconds = " + initialseconds);
	console.log("Timeout duration to claim main prize = " + timeout);
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
	let cosmicGameProxy = await getCosmicGameProxyContract();

	await set_parameters(testingAcct, cosmicGameProxy);

	console.log("Completed");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
