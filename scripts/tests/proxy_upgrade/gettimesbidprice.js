const hre = require("hardhat");

async function getCosmicSignatureGameContract(contractName) {
	let cosmicSignatureGameAddr = process.env.COSMIC_SIGNATURE_GAME_ADDRESS;
	if (typeof cosmicSignatureGameAddr === "undefined" || cosmicSignatureGameAddr.length != 42) {
		console.log("COSMIC_SIGNATURE_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicSignatureGame = await hre.ethers.getContractAt(contractName, cosmicSignatureGameAddr);
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
	let cosmicSignatureGame = await getCosmicSignatureGameContract("CosmicSignatureGameOpenBid");
	let value = await cosmicSignatureGame.timesBidPrice();
	console.log("timesBidPrice = "+value);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
