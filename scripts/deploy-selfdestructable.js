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
		cosmicGameProxy,
		cosmicSignature,
		cosmicToken,
		cosmicDAO,
		charityWallet,
		prizesWallet,
		randomWalkNft,
		stakingWalletCosmicSignatureNft,
		stakingWalletRandomWalkNft,
		marketingWallet,
		cosmicGame,
	} = await basicDeploymentAdvanced("SelfdestructibleCosmicGameProxy", deployerAcct, "", 1, "0x1b2E85De21C7CF4bD1787c6Ac4bd505e83b62Ba5", true);
	console.log("CosmicGameProxy address:", cosmicGameProxy.address);
	console.log("CosmicSignature address:", cosmicSignature.address);
	console.log("CosmicToken address:", cosmicToken.address);
	console.log("CosmicDAO address:", cosmicDAO.address);
	console.log("CharityWallet address:", charityWallet.address);
	console.log("PrizesWallet address:", prizesWallet.address);
	console.log("RandomWalkNFT address:", randomWalkNft.address);
	console.log("StakingWalletCosmicSignatureNft address:", stakingWalletCosmicSignatureNft.address);
	console.log("StakingWalletRandomWalkNft address:", stakingWalletRandomWalkNft.address);
	console.log("MarketingWallet address:", marketingWallet.address);
	console.log("CosmicGame address:", cosmicGame.adress);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
