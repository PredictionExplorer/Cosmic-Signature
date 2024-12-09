// Confirms that deployed contracts are fully operational

// const { expect } = require("chai");
// const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

async function main() {
	// let privKey = process.env.PRIVKEY;
	// if (typeof privKey === "undefined" || privKey.length == 0) {
	// 	console.log(
	// 		"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
	// 	);
	// 	process.exit(1);
	// }
	// let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	const cosmicSignatureGame = await getCosmicSignatureGameContract("SelfDestructibleCosmicSignatureGame");
	await cosmicSignatureGame.finalizeTesting();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
