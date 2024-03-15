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
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicGame = await getCosmicGameContract();

	try {
		await cosmicGame.connect(testingAcct).prepareMaintenance();
	} catch(e) {
		console.log(e);
	}
	let sysMode = await cosmicGame.systemMode();
	console.log("systemMode = "+sysMode.toString());
	if (sysMode.toString() == "1") {
		console.log("System is set for maintenance right after next claimPrize() call")
	} else {
		if (sysMode.toString() == "2") {
			console.log("System is in maintenance mode already");
		} else {
			console.log("Call failed");
		}
	}
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
