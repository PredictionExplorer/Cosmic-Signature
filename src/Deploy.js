// [Comment-202409255]
// Because "hardhat.config.js" imports us, an attempt to import "hardhat" here would throw an error.
// So we must do things differently here.
// [/Comment-202409255]
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

/**
 * @param {import("@nomicfoundation/hardhat-ethers/signers").HardhatEthersSigner?} deployerAcct 
 * @param {string} randomWalkNftAddr 
 * @param {number} activationTime 
 * @param {string} charityAddr 
 * @param {boolean} transferOwnership 
 * @returns 
 */
const basicDeployment = async function (
	deployerAcct,
	randomWalkNftAddr,
	activationTime,
	charityAddr,
	transferOwnership
	// switchToRuntime = true
) {
	return await basicDeploymentAdvanced(
		"CosmicGame",
		deployerAcct,
		randomWalkNftAddr,
		activationTime,
		charityAddr,
		transferOwnership
		// switchToRuntime
	);
};

/**
 * @param {string} cosmicSignatureGameContractName 
 * @param {import("@nomicfoundation/hardhat-ethers/signers").HardhatEthersSigner?} deployerAcct 
 * @param {string} randomWalkNftAddr May be empty.
 * @param {number} activationTime 
 * Possible values:
 *    0: leave the default value hardcoded in the contract.
 *    1: use the latest block timestamp.
 *    Any other value: use the given value as is.
 * @param {string} charityAddr May be empty.
 * @param {boolean} transferOwnership 
 * @returns 
 */
const basicDeploymentAdvanced = async function (
	cosmicSignatureGameContractName,
	deployerAcct,
	randomWalkNftAddr,
	activationTime,
	charityAddr,
	transferOwnership
	// switchToRuntime
) {
	// if (switchToRuntime === undefined) {
	// 	console.error("switchToRuntime is not set");
	// 	process.exit(1);
	// }

	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const signers = await hre.ethers.getSigners();

	if (deployerAcct === null ) {
		deployerAcct = signers[0];
	}

	const CosmicGame = await hre.ethers.getContractFactory(cosmicSignatureGameContractName);
	const cosmicGameProxy = await hre.upgrades.deployProxy(
		CosmicGame,
		args = [deployerAcct.address],
		opts = {
			kind: "uups"
		}
	);
	const cosmicGameProxyAddr = await cosmicGameProxy.getAddress();
	// todo-1 This is not used. Do we need this?
	const cosmicGameAddr =
		await cosmicGameProxy.runner.provider.getStorage(
			cosmicGameProxyAddr,
			// todo-1 Magic number hardcoded. Is it correct?
			"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
		);
	const cosmicGame = await CosmicGame.attach(cosmicGameProxyAddr);

	const CosmicToken = await hre.ethers.getContractFactory("CosmicToken");
	const cosmicToken = await CosmicToken.connect(deployerAcct).deploy();
	await cosmicToken.waitForDeployment();
	const cosmicTokenAddr = await cosmicToken.getAddress();
	await cosmicToken.connect(deployerAcct).transferOwnership(cosmicGameProxyAddr);

	const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
	const cosmicSignature = await CosmicSignature.connect(deployerAcct).deploy(cosmicGameProxyAddr);
	await cosmicSignature.waitForDeployment();
	const cosmicSignatureAddr = await cosmicSignature.getAddress();

	const CosmicDAO = await hre.ethers.getContractFactory("CosmicDAO");
	const cosmicDAO = await CosmicDAO.connect(deployerAcct).deploy(cosmicTokenAddr);
	await cosmicDAO.waitForDeployment();
	const cosmicDAOAddr = await cosmicDAO.getAddress();

	const CharityWallet = await hre.ethers.getContractFactory("CharityWallet");
	const charityWallet = await CharityWallet.connect(deployerAcct).deploy();
	await charityWallet.waitForDeployment();
	const charityWalletAddr = await charityWallet.getAddress();
	if (charityAddr.length === 0) {
		charityAddr = signers[1].address;
	}
	await charityWallet.setCharity(charityAddr);
	if (transferOwnership) {
		await charityWallet.connect(deployerAcct).transferOwnership(cosmicDAOAddr);
	}

	const EthPrizesWallet = await hre.ethers.getContractFactory("EthPrizesWallet");
	const ethPrizesWallet = await EthPrizesWallet.connect(deployerAcct).deploy(cosmicGameProxyAddr);
	await ethPrizesWallet.waitForDeployment();
	const ethPrizesWalletAddr = await ethPrizesWallet.getAddress();

	const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
	const marketingWallet = await MarketingWallet.connect(deployerAcct).deploy(cosmicToken);
	await marketingWallet.waitForDeployment();
	const marketingWalletAddr = await marketingWallet.getAddress();

	let randomWalkNFT;
	if (randomWalkNftAddr.length === 0) {
		const RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
		randomWalkNFT = await RandomWalkNFT.connect(deployerAcct).deploy();
		await randomWalkNFT.waitForDeployment();
		randomWalkNftAddr = await randomWalkNFT.getAddress();
	} else {
		randomWalkNFT = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr);
		if (await randomWalkNFT.getAddress() !== randomWalkNftAddr) {
			throw new Error("Error 202411196.");
		}
	}

	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft");
	const stakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.connect(deployerAcct).deploy(
		cosmicSignatureAddr,
		cosmicGameProxyAddr

		// // Issue. It could make sense to use `charityWalletAddr` instead.
		// charityAddr
	);
	await stakingWalletCosmicSignatureNft.waitForDeployment();
	const stakingWalletCosmicSignatureNftAddr = await stakingWalletCosmicSignatureNft.getAddress();

	const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
	const stakingWalletRandomWalkNft = await StakingWalletRandomWalkNft.connect(deployerAcct).deploy(randomWalkNftAddr);
	await stakingWalletRandomWalkNft.waitForDeployment();
	const stakingWalletRandomWalkNftAddr = await stakingWalletRandomWalkNft.getAddress();

	await cosmicGameProxy.connect(deployerAcct).setEthPrizesWallet(ethPrizesWalletAddr);
	await cosmicGameProxy.connect(deployerAcct).setTokenContract(cosmicTokenAddr);
	await cosmicGameProxy.connect(deployerAcct).setMarketingWallet(marketingWalletAddr);
	await cosmicGameProxy.connect(deployerAcct).setNftContract(cosmicSignatureAddr);
	await cosmicGameProxy.connect(deployerAcct).setRandomWalkNft(randomWalkNftAddr);
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletCosmicSignatureNft(stakingWalletCosmicSignatureNftAddr);
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletRandomWalkNft(stakingWalletRandomWalkNftAddr);
	await cosmicGameProxy.connect(deployerAcct).setCharity(charityWalletAddr);
	if (activationTime !== 0) {
		if (activationTime === 1) {
			const latestBlock = await hre.ethers.provider.getBlock("latest");
			activationTime = latestBlock.timestamp;
		}
		await cosmicGameProxy.connect(deployerAcct).setActivationTime(activationTime);
	}
	// if (switchToRuntime) {
	// 	await cosmicGameProxy.connect(deployerAcct).setRuntimeMode();
	// }

	return {
		signers,
		cosmicGameProxy,
		cosmicToken,
		cosmicSignature,
		charityWallet,
		cosmicDAO,
		ethPrizesWallet,
		randomWalkNFT,
		stakingWalletCosmicSignatureNft,
		stakingWalletRandomWalkNft,
		marketingWallet,
		cosmicGame,
	};
};

module.exports = { basicDeployment, basicDeploymentAdvanced };
