const basicDeployment = async function (
	deployerAcct,
	randomWalkAddr,
	activationTime,
	charityAddr,
	transferOwnership,
	switchToRuntime = true,
) {
	return await basicDeploymentAdvanced(
		"CosmicGameProxy",
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
	let cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet;
	if (switchToRuntime === undefined) {
		console.error("switchToRuntime is not set");
		process.exit(1);
	}

	const CosmicGameProxy = await ethers.getContractFactory(cgpName);
	cosmicGameProxy = await CosmicGameProxy.connect(deployerAcct).deploy();
	await cosmicGameProxy.deployed();

	const CosmicToken = await ethers.getContractFactory("CosmicToken");
	cosmicToken = await CosmicToken.connect(deployerAcct).deploy();
	await cosmicToken.deployed();
	await cosmicToken.connect(deployerAcct).transferOwnership(cosmicGameProxy.address);

	const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
	cosmicSignature = await CosmicSignature.connect(deployerAcct).deploy(cosmicGameProxy.address);
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
	raffleWallet = await RaffleWallet.connect(deployerAcct).deploy(cosmicGameProxy.address);
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
		cosmicGameProxy.address,
		charityAddr,
	);
	await stakingWalletCST.deployed();

	const StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
	stakingWalletRWalk = await StakingWalletRWalk.connect(deployerAcct).deploy(randomWalkAddr,cosmicGameProxy.address);
	await stakingWalletRWalk.deployed();

	const CosmicGameImplementation = await ethers.getContractFactory("CosmicGameImplementation");
	let cosmicGameImplementation = await CosmicGameImplementation.connect(deployerAcct).deploy();
	await cosmicGameImplementation.deployed();

	await cosmicGameProxy.connect(deployerAcct).setTokenContract(cosmicToken.address);
	await cosmicGameProxy.connect(deployerAcct).setNftContract(cosmicSignature.address);
	await cosmicGameProxy.connect(deployerAcct).setCharity(charityWallet.address);
	await cosmicGameProxy.connect(deployerAcct).setBusinessLogicContract(cosmicGameImplementation.address);
	await cosmicGameProxy.connect(deployerAcct).setRandomWalk(randomWalkNFT.address);
	await cosmicGameProxy.connect(deployerAcct).setRaffleWallet(raffleWallet.address);
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletCST(stakingWalletCST.address);
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletRWalk(stakingWalletRWalk.address);
	await cosmicGameProxy.connect(deployerAcct).setMarketingWallet(marketingWallet.address);
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
		stakingWalletCST,
		stakingWalletRWalk,
		marketingWallet,
		cosmicGameImplementation,
	};
};
module.exports = { basicDeployment, basicDeploymentAdvanced };
