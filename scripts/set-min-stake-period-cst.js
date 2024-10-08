const hre = require("hardhat");

async function getCosmicGameProxyContract() {
	let cosmicGameProxyAddr = process.env.COSMIC_GAME_ADDRESS;
	if (typeof cosmicGameProxyAddr === "undefined" || cosmicGameProxyAddr.length != 42) {
		console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGameProxy = await hre.ethers.getContractAt("CosmicGame", cosmicGameProxyAddr);
	return cosmicGameProxy;
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
	let cosmicGameProxy = await getCosmicGameProxyContract();
	let stakingWalletCSTAddr = await cosmicGameProxy.stakingWalletCST();
	let stakingWalletCST = await hre.ethers.getContractAt("StakingWalletCST", stakingWalletCSTAddr);
	console.log("staking wallet");console.log(stakingWalletCSTAddr);
	try {
		// todo-1 This function no longer exists.
		await stakingWalletCST.connect(testingAcct).setMinStakePeriod(period);
	} catch(e) {
		console.log(e);
	}
	// todo-1 This function no longer exists.
	period = await stakingWalletCST.minStakePeriod();
	console.log("Period value: "+period.toNumber()+" seconds");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
