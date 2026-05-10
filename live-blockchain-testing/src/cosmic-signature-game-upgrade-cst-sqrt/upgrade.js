"use strict";

const hre = require("hardhat");

async function main() {
	const proxyAddress_ = process.env.COSMIC_SIGNATURE_GAME_PROXY_ADDRESS;
	if (proxyAddress_ == undefined || proxyAddress_.length <= 0) {
		throw new Error("COSMIC_SIGNATURE_GAME_PROXY_ADDRESS is required.");
	}
	const privateKey_ = process.env.PRIVKEY;
	if (privateKey_ == undefined || privateKey_.length <= 0) {
		throw new Error("PRIVKEY is required.");
	}

	const ownerSigner_ = new hre.ethers.Wallet(privateKey_, hre.ethers.provider);
	const cosmicSignatureGameProxy_ = await hre.ethers.getContractAt("CosmicSignatureGame", proxyAddress_, ownerSigner_);
	const cosmicSignatureGameV2Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", ownerSigner_);

	console.info("%s", `Upgrading CosmicSignatureGame proxy ${proxyAddress_} to CosmicSignatureGameV2.`);
	const upgradedProxy_ =
		await hre.upgrades.upgradeProxy(
			cosmicSignatureGameProxy_,
			cosmicSignatureGameV2Factory_,
			{
				kind: "uups",
				call: "initialize2",
			}
		);
	await upgradedProxy_.waitForDeployment();

	const implementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_);
	console.info("%s", `CosmicSignatureGameV2 implementation address: ${implementationAddress_}`);
	console.info("%s", "Upgrade complete.");
}

main()
	.catch((errorObject_) => {
		console.error("%o", errorObject_);
		process.exitCode = 1;
	});
