// Sets short time intervals to avoid waiting for running tests
const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameContract } = require("./helper.js");

async function set_parameters(testingAcct, cosmicGame) {
	let rafflePercentage = ethers.BigNumber.from("12");
	await cosmicGame.connect(testingAcct).setRafflePercentage(rafflePercentage);
	console.log("rafflePercentage= " + rafflePercentage);
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
	let cosmicGame = await getCosmicGameContract();

	await set_parameters(testingAcct, cosmicGame);

	console.log("Completed");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
