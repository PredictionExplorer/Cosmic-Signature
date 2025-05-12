// PRIVKEY=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba npx hardhat run scripts/deploy-selfdestructable-cosmic-signature-game.js

"use strict";

const hre = require("hardhat");
const { deployContractsAdvanced } = require("../src/ContractDeploymentHelpers.js");

async function main() {
	const privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length === 0) {
		console.log(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	const deployerAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	const contracts =
		await deployContractsAdvanced(
			deployerAcct,
			"SelfDestructibleCosmicSignatureGame",
			"", //"0x1111111111111111111111111111111111111111",
			// "0x1b2E85De21C7CF4bD1787c6Ac4bd505e83b62Ba5",
			"0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
			true,
			0n
		);
	console.log("CosmicSignatureToken address:", contracts.cosmicSignatureTokenAddr);
	console.log("RandomWalkNFT address:", contracts.randomWalkNftAddr);
	console.log("CosmicSignatureNft address:", contracts.cosmicSignatureNftAddr);
	console.log("PrizesWallet address:", contracts.prizesWalletAddr);
	console.log("StakingWalletRandomWalkNft address:", contracts.stakingWalletRandomWalkNftAddr);
	console.log("StakingWalletCosmicSignatureNft address:", contracts.stakingWalletCosmicSignatureNftAddr);
	console.log("MarketingWallet address:", contracts.marketingWalletAddr);
	console.log("CharityWallet address:", contracts.charityWalletAddr);
	console.log("CosmicSignatureDao address:", contracts.cosmicSignatureDaoAddr);
	console.log("CosmicSignatureGame implementation address:", contracts.cosmicSignatureGameImplementationAddr);
	console.log("CosmicSignatureGame proxy address:", contracts.cosmicSignatureGameProxyAddr);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
