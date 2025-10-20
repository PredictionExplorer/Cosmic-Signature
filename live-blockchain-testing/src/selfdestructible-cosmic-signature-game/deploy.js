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
// 			"%s",
// 			// todo-9 "scripts/deploy.js" no longer exists.
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
// 	console.info(/*"%s",*/ "CosmicSignatureToken address:", contracts.cosmicSignatureTokenAddress);
// 	console.info(/*"%s",*/ "RandomWalkNFT address:", contracts.randomWalkNftAddress);
// 	console.info(/*"%s",*/ "CosmicSignatureNft address:", contracts.cosmicSignatureNftAddress);
// 	console.info(/*"%s",*/ "PrizesWallet address:", contracts.prizesWalletAddress);
// 	console.info(/*"%s",*/ "StakingWalletRandomWalkNft address:", contracts.stakingWalletRandomWalkNftAddress);
// 	console.info(/*"%s",*/ "StakingWalletCosmicSignatureNft address:", contracts.stakingWalletCosmicSignatureNftAddress);
// 	console.info(/*"%s",*/ "MarketingWallet address:", contracts.marketingWalletAddress);
// 	console.info(/*"%s",*/ "CharityWallet address:", contracts.charityWalletAddress);
// 	console.info(/*"%s",*/ "CosmicSignatureDao address:", contracts.cosmicSignatureDaoAddress);
// 	console.info(/*"%s",*/ "CosmicSignatureGame implementation address:", contracts.cosmicSignatureGameImplementationAddress);
// 	console.info(/*"%s",*/ "CosmicSignatureGame proxy address:", contracts.cosmicSignatureGameProxyAddress);
// }

// main()
// 	.then(() => {})
// 	.catch((errorObject_) => {
// 		console.error("%o", errorObject_);
// 		process.exitCode = 1;
// 	});
