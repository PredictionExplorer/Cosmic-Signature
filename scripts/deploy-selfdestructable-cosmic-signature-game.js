// PRIVKEY=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba npx hardhat run scripts/deploy-selfdestructable-cosmic-signature-game.js

"use strict";

const hre = require("hardhat");
const { basicDeploymentAdvanced } = require("../src/Deploy.js");

async function main() {
	const privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	const deployerAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	const contracts =
		await basicDeploymentAdvanced(
			"SelfDestructibleCosmicSignatureGame",
			deployerAcct,
			"", //"0x1111111111111111111111111111111111111111",
			1,
			"0x1b2E85De21C7CF4bD1787c6Ac4bd505e83b62Ba5",
			true
		);
	console.log("CosmicSignatureGame proxy address:", await contracts.cosmicSignatureGameProxy.getAddress());
	console.log("CosmicSignatureNft address:", await contracts.cosmicSignatureNft.getAddress());
	console.log("CosmicSignatureToken address:", await contracts.cosmicSignatureToken.getAddress());
	console.log("CosmicSignatureDao address:", await contracts.cosmicSignatureDao.getAddress());
	console.log("CharityWallet address:", await contracts.charityWallet.getAddress());
	console.log("PrizesWallet address:", await contracts.prizesWallet.getAddress());
	console.log("RandomWalkNFT address:", await contracts.randomWalkNft.getAddress());
	console.log("StakingWalletCosmicSignatureNft address:", await contracts.stakingWalletCosmicSignatureNft.getAddress());
	console.log("StakingWalletRandomWalkNft address:", await contracts.stakingWalletRandomWalkNft.getAddress());
	// console.log("MarketingWallet address:", await contracts.marketingWallet.getAddress());
	console.log("CosmicSignatureGame address:", await contracts.cosmicSignatureGame.getAddress());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
