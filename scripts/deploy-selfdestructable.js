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
	const {
		cosmicSignatureGameProxy,
		cosmicSignatureNft,
		cosmicSignatureToken,
		cosmicSignatureDao,
		charityWallet,
		prizesWallet,
		randomWalkNft,
		stakingWalletCosmicSignatureNft,
		stakingWalletRandomWalkNft,
		marketingWallet,
		cosmicSignatureGame,
	} = await basicDeploymentAdvanced("SelfDestructibleCosmicSignatureGame", deployerAcct, "", 1, "0x1b2E85De21C7CF4bD1787c6Ac4bd505e83b62Ba5", true);
	console.log("CosmicSignatureGame proxy address:", cosmicSignatureGameProxy.address);
	console.log("CosmicSignatureNft address:", cosmicSignatureNft.address);
	console.log("CosmicSignatureToken address:", cosmicSignatureToken.address);
	console.log("CosmicSignatureDao address:", cosmicSignatureDao.address);
	console.log("CharityWallet address:", charityWallet.address);
	console.log("PrizesWallet address:", prizesWallet.address);
	console.log("RandomWalkNFT address:", randomWalkNft.address);
	console.log("StakingWalletCosmicSignatureNft address:", stakingWalletCosmicSignatureNft.address);
	console.log("StakingWalletRandomWalkNft address:", stakingWalletRandomWalkNft.address);
	console.log("MarketingWallet address:", marketingWallet.address);
	console.log("CosmicSignatureGame address:", cosmicSignatureGame.address);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
