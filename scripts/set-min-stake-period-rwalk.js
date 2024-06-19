const hre = require("hardhat");

async function getCosmicGameContract() {
	let cosmicGameAddr = process.env.COSMIC_GAME_ADDRESS;
	if (typeof cosmicGameAddr === "undefined" || cosmicGameAddr.length != 42) {
		console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGame = await ethers.getContractAt("CosmicGame", cosmicGameAddr);
	return cosmicGame;
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
	let cosmicGame = await getCosmicGameContract();
	let stakingWalletAddr = await cosmicGame.stakingWalletRWalk();
	let stakingWalletRWalk = await ethers.getContractAt("StakingWalletRWalk",stakingWalletAddr);
	console.log("staking wallet");console.log(stakingWalletAddr);
	try {
		await stakingWalletRWalk.connect(testingAcct).setMinStakePeriod(period);
	} catch(e) {
		console.log(e);
	}
	period = await stakingWalletRWalk.minStakePeriod();
	console.log("Period value: "+period.toNumber()+" seconds");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
