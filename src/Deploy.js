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
	cgName,
	deployerAcct,
	randomWalkAddr,
	activationTime,
	charityAddr,
	transferOwnership,
	switchToRuntime,
) {
	let cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet;
	if (switchToRuntime === undefined) {
		console.error("switchToRuntime is not set");
		process.exit(1);
	}

	const CosmicGame = await ethers.getContractFactory(cgName);
	cosmicGame = await CosmicGame.connect(deployerAcct).deploy();
	await cosmicGame.deployed();

	const CosmicToken = await ethers.getContractFactory("CosmicToken");
	cosmicToken = await CosmicToken.connect(deployerAcct).deploy();
	await cosmicToken.deployed();
	await cosmicToken.connect(deployerAcct).transferOwnership(cosmicGame.address);

	const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
	cosmicSignature = await CosmicSignature.connect(deployerAcct).deploy(cosmicGame.address);
	await cosmicSignature.deployed();

	const CosmicDAO = await ethers.getContractFactory("CosmicDAO");
	cosmicDAO = await CosmicDAO.connect(deployerAcct).deploy(cosmicToken.address);
	await cosmicDAO.deployed();

	const CharityWallet = await ethers.getContractFactory("CharityWallet");
	charityWallet = await CharityWallet.connect(deployerAcct).deploy();
	await charityWallet.deployed();
	if (charityAddr.length == 0) {
		const [owner, otherAccount] = await ethers.getSigners();
		charityAddr = otherAccount.address;
	}
	await charityWallet.setCharity(charityAddr);
	if (transferOwnership) {
		await charityWallet.connect(deployerAcct).transferOwnership(cosmicDAO.address);
	}

	const RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
	raffleWallet = await RaffleWallet.connect(deployerAcct).deploy(cosmicGame.address);
	await raffleWallet.deployed();

	const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
	marketingWallet = await MarketingWallet.connect(deployerAcct).deploy(cosmicToken.address);
	await marketingWallet.deployed();

	const RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
	if (randomWalkAddr.length === 0) {
		randomWalkNFT = await RandomWalkNFT.connect(deployerAcct).deploy();
		randomWalkAddr = randomWalkNFT.address;
		await randomWalkNFT.deployed();
	} else {
		randomWalkNFT = await ethers.getContractAt("RandomWalkNFT", randomWalkAddr);
	}

	const StakingWalletCST = await hre.ethers.getContractFactory("StakingWalletCST");
	stakingWalletCST = await StakingWalletCST.connect(deployerAcct).deploy(
		cosmicSignature.address,
		cosmicGame.address,
		charityAddr,
	);
	await stakingWalletCST.deployed();

	const StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
	stakingWalletRWalk = await StakingWalletRWalk.connect(deployerAcct).deploy(	randomWalkAddr);
	await stakingWalletRWalk.deployed();

	const BusinessLogic = await ethers.getContractFactory("BusinessLogic");
	bLogic = await BusinessLogic.connect(deployerAcct).deploy();
	await bLogic.deployed();

	await cosmicGame.connect(deployerAcct).setTokenContract(cosmicToken.address);
	await cosmicGame.connect(deployerAcct).setNftContract(cosmicSignature.address);
	await cosmicGame.connect(deployerAcct).setCharity(charityWallet.address);
	await cosmicGame.connect(deployerAcct).setBusinessLogicContract(bLogic.address);
	await cosmicGame.connect(deployerAcct).setRandomWalk(randomWalkNFT.address);
	await cosmicGame.connect(deployerAcct).setRaffleWallet(raffleWallet.address);
	await cosmicGame.connect(deployerAcct).setStakingWalletCST(stakingWalletCST.address);
	await cosmicGame.connect(deployerAcct).setStakingWalletRWalk(stakingWalletRWalk.address);
	await cosmicGame.connect(deployerAcct).setMarketingWallet(marketingWallet.address);
	await cosmicGame.connect(deployerAcct).setActivationTime(activationTime);
	if (switchToRuntime) {
		await cosmicGame.connect(deployerAcct).setRuntimeMode();
	}

	return {
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
	};
};
module.exports = { basicDeployment, basicDeploymentAdvanced };
