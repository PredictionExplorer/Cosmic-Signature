"use strict";

const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("../../helpers.js");

/// Comment-202412129 relates.
async function main() {
	// let privKey = process.env.PRIVKEY;
	// if (typeof privKey === "undefined" || privKey.length == 0) {
	// 	console.log(
	// 		// todo-1 "scripts/deploy.js" no longer exists.
	// 		"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
	// 	);
	// 	process.exit(1);
	// }
	// let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGameProxy = await getCosmicSignatureGameContract();
	const CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
	cosmicSignatureGameProxy =
		await hre.upgrades.upgradeProxy(
			cosmicSignatureGameProxy,
			CosmicSignatureGameOpenBid,
			{
				kind: "uups",
				call: "initialize2",
			}
		);
	const implementationAddressAsString_ =
		await cosmicSignatureGameProxy.runner.provider.getStorage(
			await cosmicSignatureGameProxy.getAddress(),

			// Comment-202412063 applies.
			"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
		);
	console.log("Implementation address:", implementationAddressAsString_);
	console.log("timesEthBidPrice =", await cosmicSignatureGameProxy.timesEthBidPrice());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
