// [Comment-202409255]
// Because "hardhat.config.js" imports us, an attempt to import "hardhat" here would throw an error.
// So we must do things differently here.
// [/Comment-202409255]
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

const basicDeployment = async function (
	deployerAcct,
	randomWalkAddr,
	activationTime,
	charityAddr,
	transferOwnership,
	switchToRuntime = true,
) {
	return await basicDeploymentAdvanced(
		"CosmicGame",
		deployerAcct,
		randomWalkAddr,
		activationTime,
		charityAddr,
		transferOwnership,
		switchToRuntime,
	);
};
const basicDeploymentAdvanced = async function (
	cgpName,
	deployerAcct,
	randomWalkAddr,
	activationTime,
	charityAddr,
	transferOwnership,
	switchToRuntime,
) {
	if (switchToRuntime === undefined) {
		console.error("switchToRuntime is not set");
		process.exit(1);
	}

	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	let cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet;
	let CosmicGame = await hre.ethers.getContractFactory(cgpName);
	cosmicGameProxy = await hre.upgrades.deployProxy(
		CosmicGame,
		args = [deployerAcct.address],
		opts = {
			kind: "uups"
		}
	);
	const cosmicGameProxyAddr = await cosmicGameProxy.getAddress();
	let cosmicGameAddr = await cosmicGameProxy.runner.provider.getStorage(cosmicGameProxyAddr,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc');
	let cosmicGame = await CosmicGame.attach(cosmicGameProxyAddr);
	let CosmicToken = await hre.ethers.getContractFactory("CosmicToken");
	cosmicToken = await CosmicToken.connect(deployerAcct).deploy();
	await cosmicToken.waitForDeployment();
	let cosmicTokenAddr = await cosmicToken.getAddress();
	await cosmicToken.connect(deployerAcct).transferOwnership(cosmicGameProxyAddr);

	let CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
	cosmicSignature = await CosmicSignature.connect(deployerAcct).deploy(cosmicGameProxyAddr);
	await cosmicSignature.waitForDeployment();
	let cosmicSignatureAddr = await cosmicSignature.getAddress();

	let CosmicDAO = await hre.ethers.getContractFactory("CosmicDAO");
	cosmicDAO = await CosmicDAO.connect(deployerAcct).deploy(cosmicTokenAddr);
	await cosmicDAO.waitForDeployment();
	let cosmicDAOAddr = await cosmicDAO.getAddress();

	let CharityWallet = await hre.ethers.getContractFactory("CharityWallet");
	charityWallet = await CharityWallet.connect(deployerAcct).deploy();
	await charityWallet.waitForDeployment();
	let charityWalletAddr = await charityWallet.getAddress();
	if (charityAddr.length == 0) {
		const [owner, otherAccount] = await hre.ethers.getSigners();
		charityAddr = otherAccount.address;
	}
	await charityWallet.setCharity(charityAddr);
	if (transferOwnership) {
		await charityWallet.connect(deployerAcct).transferOwnership(cosmicDAOAddr);
	}

	let RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
	raffleWallet = await RaffleWallet.connect(deployerAcct).deploy(cosmicGameProxyAddr);
	await raffleWallet.waitForDeployment();
	let raffleWalletAddr = await raffleWallet.getAddress();

	let MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
	const marketingWallet = await MarketingWallet.connect(deployerAcct).deploy(cosmicToken);
	await marketingWallet.waitForDeployment();
	let marketingWalletAddr = await marketingWallet.getAddress();

	let RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
	if (randomWalkAddr.length === 0) {
		randomWalkNFT = await RandomWalkNFT.connect(deployerAcct).deploy();
		await randomWalkNFT.waitForDeployment();
		randomWalkAddr = await randomWalkNFT.getAddress();
	} else {
		randomWalkNFT = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkAddr);
	}
	let randomWalkNFTAddr = await randomWalkNFT.getAddress();

	let StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft");
	let stakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.connect(deployerAcct).deploy(
		await cosmicSignature.getAddress(),
		cosmicGameProxyAddr
		// charityAddr
	);
	await stakingWalletCosmicSignatureNft.waitForDeployment();
	let stakingWalletCosmicSignatureNftAddr = await stakingWalletCosmicSignatureNft.getAddress();

	let StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
	const stakingWalletRWalk = await StakingWalletRWalk.connect(deployerAcct).deploy(randomWalkAddr);
	await stakingWalletRWalk.waitForDeployment();
	let stakingWalletRWalkAddr = await stakingWalletRWalk.getAddress();

	await cosmicGameProxy.connect(deployerAcct).setTokenContract(cosmicTokenAddr);
	await cosmicGameProxy.connect(deployerAcct).setNftContract(cosmicSignatureAddr);
	await cosmicGameProxy.connect(deployerAcct).setCharity(charityWalletAddr);
	await cosmicGameProxy.connect(deployerAcct).setRandomWalk(randomWalkNFTAddr);
	await cosmicGameProxy.connect(deployerAcct).setRaffleWallet(raffleWalletAddr);
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletCosmicSignatureNft(stakingWalletCosmicSignatureNftAddr);
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletRWalk(stakingWalletRWalkAddr);
	await cosmicGameProxy.connect(deployerAcct).setMarketingWallet(marketingWalletAddr);
	if (activationTime == 0) {
		let latestBlock = await hre.ethers.provider.getBlock("latest");
		await cosmicGameProxy.connect(deployerAcct).setActivationTime(latestBlock.timestamp);
	} else {
		await cosmicGameProxy.connect(deployerAcct).setActivationTime(activationTime);
	}
	if (switchToRuntime) {
		await cosmicGameProxy.connect(deployerAcct).setRuntimeMode();
	}
	return {
		cosmicGameProxy,
		cosmicToken,
		cosmicSignature,
		charityWallet,
		cosmicDAO,
		raffleWallet,
		randomWalkNFT,
		stakingWalletCosmicSignatureNft,
		stakingWalletRWalk,
		marketingWallet,
		cosmicGame,
	};
};
module.exports = { basicDeployment, basicDeploymentAdvanced };
