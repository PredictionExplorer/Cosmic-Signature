const hre = require("hardhat");

async function getCosmicSignatureGameContract() {
	let cosmicSignatureGameAddr = process.env.COSMIC_SIGNATURE_GAME_ADDRESS;
	if (typeof cosmicSignatureGameAddr === "undefined" || cosmicSignatureGameAddr.length != 42) {
		console.log("COSMIC_SIGNATURE_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicSignatureGame = await hre.ethers.getContractAt("CosmicSignatureGame", cosmicSignatureGameAddr);
	return cosmicSignatureGame;
}

async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts...",
		);
		process.exit(1);
	}
	let period = process.env.STAKE_PERIOD;
	if (typeof period === "undefined" || period.length == 0) {
		console.log(
			"Please provide minimum staking period (seconds) by setting STAKE_PERIOD environment variable on the commandline",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();
	let stakingWalletRandomWalkNftAddr = await cosmicSignatureGame.stakingWalletRandomWalkNft();
	let stakingWalletRandomWalkNft = await hre.ethers.getContractAt("StakingWalletRandomWalkNft", stakingWalletRandomWalkNftAddr);
	console.log("staking wallet");console.log(stakingWalletRandomWalkNftAddr);
	try {
		// todo-1 This function no longer exists.
		await stakingWalletRandomWalkNft.connect(testingAcct).setMinStakePeriod(period);
	} catch(e) {
		console.log(e);
	}
	// todo-1 This function no longer exists.
	period = await stakingWalletRandomWalkNft.minStakePeriod();
	console.log("Period value: "+period.toNumber()+" seconds");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
