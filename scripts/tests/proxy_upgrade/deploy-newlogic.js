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
	// let privKey = process.env.PRIVKEY;
	// if (typeof privKey === "undefined" || privKey.length == 0) {
	// 	console.log(
	// 		"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
	// 	);
	// 	process.exit(1);
	// }
	// let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGameProxy = await getCosmicSignatureGameContract();
	let CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
	cosmicSignatureGameProxy = await hre.upgrades.upgradeProxy(
		cosmicSignatureGameProxy,
		CosmicSignatureGameOpenBid,
		opts = {
			kind: "uups"
		}
	);
	let implementationAddr =
		await cosmicSignatureGameProxy.runner.provider.getStorage(
			cosmicSignatureGameProxy,

			// Comment-202412063 applies.
			"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
		);
	console.log("Implementation address:", implementationAddr);

	// [Comment-202412064]
	// because there can't be an initialize() method for proxy upgrade (because contract is already live)
	// we need to do execute any initialization process manually (only for those variables that are added extra)
	// todo-1 So will `initialize` be called on upgrade?
	// [/Comment-202412064]
	await cosmicSignatureGameProxy.setTimesBidPrice(10n);	// initialize timesBidPrice to 10

	// todo-0 This function no longer exists.
	await cosmicSignatureGameProxy.setRuntimeMode();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
