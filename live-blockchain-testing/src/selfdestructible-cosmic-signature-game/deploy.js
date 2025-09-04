// // Comment-202509229 applies.

// // Invocation example:
// // PRIVKEY=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba npx hardhat run scripts/selfdestructible-cosmic-signature-game/deploy.js

// "use strict";

// const hre = require("hardhat");
// const { deployContractsAdvanced } = require("../../../src/ContractDeploymentHelpers.js");

// async function main() {
// 	const privKey = process.env.PRIVKEY;
// 	if (privKey == undefined || privKey.length <= 0) {
// 		console.info(
// 			// todo-1 "scripts/deploy.js" no longer exists.
// 			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
// 		);
// 		process.exit(1);
// 	}
// 	const deployerSigner = new hre.ethers.Wallet(privKey, hre.ethers.provider);
// 	const contracts =
// 		await deployContractsAdvanced(
// 			deployerSigner,
// 			"SelfDestructibleCosmicSignatureGame",
// 			"", //"0x1111111111111111111111111111111111111111",
// 			// "0x1b2E85De21C7CF4bD1787c6Ac4bd505e83b62Ba5",
// 			"0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
// 			true,
// 			0n
// 		);
// 	console.info("CosmicSignatureToken address:", contracts.cosmicSignatureTokenAddress);
// 	console.info("RandomWalkNFT address:", contracts.randomWalkNftAddress);
// 	console.info("CosmicSignatureNft address:", contracts.cosmicSignatureNftAddress);
// 	console.info("PrizesWallet address:", contracts.prizesWalletAddress);
// 	console.info("StakingWalletRandomWalkNft address:", contracts.stakingWalletRandomWalkNftAddress);
// 	console.info("StakingWalletCosmicSignatureNft address:", contracts.stakingWalletCosmicSignatureNftAddress);
// 	console.info("MarketingWallet address:", contracts.marketingWalletAddress);
// 	console.info("CharityWallet address:", contracts.charityWalletAddress);
// 	console.info("CosmicSignatureDao address:", contracts.cosmicSignatureDaoAddress);
// 	console.info("CosmicSignatureGame implementation address:", contracts.cosmicSignatureGameImplementationAddress);
// 	console.info("CosmicSignatureGame proxy address:", contracts.cosmicSignatureGameProxyAddress);
// }

// main()
// 	.then(() => { process.exit(0); })
// 	.catch((errorObject_) => {
// 		console.error(errorObject_);
// 		process.exit(1);
// 	});
