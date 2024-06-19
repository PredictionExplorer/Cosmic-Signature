const hre = require("hardhat");
const { basicDeploymentAdvanced } = require("../src/Deploy.js");

async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let deployerAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	const {
        cosmicGame,
        cosmicToken,
        cosmicSignature,
        charityWallet,
        cosmicDAO,
        raffleWallet,
        randomWalkNFT,
        stakingWalletCST,
		stakingWalletRWalk,
        marketingWallet,
        bLogic,
	} =
		await basicDeploymentAdvanced("SelfdestructibleCosmicGame",deployerAcct, "", 0, "0x1b2E85De21C7CF4bD1787c6Ac4bd505e83b62Ba5", true);
	console.log("CosmicGame address:", cosmicGame.address);
	console.log("CosmicToken address:", cosmicToken.address);
	console.log("CosmicSignature address:", cosmicSignature.address);
	console.log("CharityWallet address:", charityWallet.address);
	console.log("CosmicDAO address", cosmicDAO.address);
	console.log("RaffleWallet address:", raffleWallet.address);
	console.log("randomWalkNFT address:", randomWalkNFT.address);
	console.log("stakingWalletCST address: ",stakingWalletCST.address);
	console.log("stakingWalletRWalk address: ",stakingWalletRWalk.address);
	console.log("marketingWallet address: ",marketingWallet.address);
	console.log("businessLogic address: ",bLogic.adress);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
