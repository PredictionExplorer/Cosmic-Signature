"use strict";

const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts...",
		);
		process.exit(1);
	}
	// todo-1 There is no such thing as the minimum staking period any more, right?
	let period = process.env.STAKE_PERIOD;
	if (typeof period === "undefined" || period.length == 0) {
		console.log(
			"Please provide minimum staking period (seconds) by setting STAKE_PERIOD environment variable on the commandline",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();
	let stakingWalletCosmicSignatureNftAddr = await cosmicSignatureGame.stakingWalletCosmicSignatureNft();
	let stakingWalletCosmicSignatureNft = await hre.ethers.getContractAt("StakingWalletCosmicSignatureNft", stakingWalletCosmicSignatureNftAddr);
	console.log("staking wallet");console.log(stakingWalletCosmicSignatureNftAddr);
	// todo-1 Why do we need this error handling?
	try {
		// todo-1 This function no longer exists.
		await stakingWalletCosmicSignatureNft.connect(testingAcct).setMinStakePeriod(period);
	} catch(e) {
		console.log(e);
	}
	// todo-1 This function no longer exists.
	period = await stakingWalletCosmicSignatureNft.minStakePeriod();
	console.log("Period value: " + period.toString() + " seconds");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
