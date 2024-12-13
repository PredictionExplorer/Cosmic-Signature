// todo-1 There is no such thing as runtime and maintenance modes any more. Now activation time plays that role.

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
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	// todo-1 Why do we need error handling here?
	try {
		// todo-1 This function no longer exists.
		await cosmicSignatureGame.connect(testingAcct).prepareMaintenance();
	} catch(e) {
		console.log(e);
	}
	// todo-1 This function no longer exists.
	let systemModeCode_ = await cosmicSignatureGame.systemMode();
	console.log("systemMode =", systemModeCode_);
	if (systemModeCode_.toString() == "1") {
		console.log("System is set for maintenance right after next claimPrize() call")
	} else {
		if (systemModeCode_.toString() == "2") {
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
