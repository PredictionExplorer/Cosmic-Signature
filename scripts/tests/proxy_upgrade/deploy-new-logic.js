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
	const cosmicSignatureGameProxy = await getCosmicSignatureGameContract();
	const cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();

	// Comment-202502096 applies.
	const cosmicSignatureGameOpenBidFactory = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
	
	const cosmicSignatureGame2Proxy =
		await hre.upgrades.upgradeProxy(
			cosmicSignatureGameProxy,
			cosmicSignatureGameOpenBidFactory,
			{
				kind: "uups",
				call: "initialize2",
			}
		);
	await cosmicSignatureGame2Proxy.waitForDeployment();
	const cosmicSignatureGame2ImplementationAddr = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddr);
	console.log("Implementation address =", cosmicSignatureGame2ImplementationAddr);
	console.log("timesEthBidPrice =", await cosmicSignatureGame2Proxy.timesEthBidPrice());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
