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
	// TODO : because .address changed for getAddress() and now uses 'await' keyword, we have to add validation
	// 		otherwise the setXYZ(address) method may fail or do a set to address(0) (critical issue)
	const CosmicGameProxy = await ethers.getContractFactory(cgpName);
	cosmicGameProxy = await CosmicGameProxy.connect(deployerAcct).deploy();
	await cosmicGameProxy.waitForDeployment();

	const CosmicToken = await ethers.getContractFactory("CosmicToken");
	cosmicToken = await CosmicToken.connect(deployerAcct).deploy();
	await cosmicToken.waitForDeployment();
	await cosmicToken.connect(deployerAcct).transferOwnership(await cosmicGameProxy.getAddress());

	const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
	cosmicSignature = await CosmicSignature.connect(deployerAcct).deploy(await cosmicGameProxy.getAddress());
	await cosmicSignature.waitForDeployment();

	const CosmicDAO = await ethers.getContractFactory("CosmicDAO");
	cosmicDAO = await CosmicDAO.connect(deployerAcct).deploy(await cosmicToken.getAddress());
	await cosmicDAO.waitForDeployment();

	const CharityWallet = await ethers.getContractFactory("CharityWallet");
	charityWallet = await CharityWallet.connect(deployerAcct).deploy();
	await charityWallet.waitForDeployment();
	if (charityAddr.length == 0) {
		const [owner, otherAccount] = await ethers.getSigners();
		charityAddr = otherAccount.address;
	}
	await charityWallet.setCharity(charityAddr);
	if (transferOwnership) {
		await charityWallet.connect(deployerAcct).transferOwnership(await cosmicDAO.getAddress());
	}

	const RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
	raffleWallet = await RaffleWallet.connect(deployerAcct).deploy(await cosmicGameProxy.getAddress());
	await raffleWallet.waitForDeployment();

	const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
	marketingWallet = await MarketingWallet.connect(deployerAcct).deploy(await cosmicToken.getAddress());
	await marketingWallet.waitForDeployment();

	const RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
	if (randomWalkAddr.length === 0) {
		randomWalkNFT = await RandomWalkNFT.connect(deployerAcct).deploy();
		await randomWalkNFT.waitForDeployment();
		randomWalkAddr = await randomWalkNFT.getAddress();
	} else {
		randomWalkNFT = await ethers.getContractAt("RandomWalkNFT", randomWalkAddr);
	}

	const StakingWalletCST = await hre.ethers.getContractFactory("StakingWalletCST");
	stakingWalletCST = await StakingWalletCST.connect(deployerAcct).deploy(
		await cosmicSignature.getAddress(),
		await cosmicGameProxy.getAddress(),
		charityAddr,
	);
	await stakingWalletCST.waitForDeployment();

	const StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
	stakingWalletRWalk = await StakingWalletRWalk.connect(deployerAcct).deploy(randomWalkAddr,await cosmicGameProxy.getAddress());
	await stakingWalletRWalk.waitForDeployment();

	const CosmicGame = await ethers.getContractFactory("CosmicGame");
	let cosmicGame = await CosmicGame.connect(deployerAcct).deploy();
	await cosmicGame.waitForDeployment();

	let gamec = await ethers.getContractAt("CosmicGame", await cosmicGameProxy.getAddress());
	await gamec.connect(deployerAcct).setTokenContract(gamec);
	await gamec.connect(deployerAcct).setNftContract(cosmicSignature.getAddress());
	await gamec.connect(deployerAcct).setCharity(charityWallet.getAddress());
	await gamec.connect(deployerAcct).setRandomWalk(randomWalkNFT.getAddress());
	await gamec.connect(deployerAcct).setRaffleWallet(raffleWallet.getAddress());
	await gamec.connect(deployerAcct).setStakingWalletCST(stakingWalletCST.getAddress());
	await gamec.connect(deployerAcct).setStakingWalletRWalk(stakingWalletRWalk.getAddress());
	await gamec.connect(deployerAcct).setMarketingWallet(marketingWallet.getAddress());
	if (activationTime == 0) {
		let latestBlock = await hre.ethers.provider.getBlock("latest");
		await gamec.connect(deployerAcct).setActivationTime(latestBlock.timestamp);
	} else {
		await gamec.connect(deployerAcct).setActivationTime(activationTime);
	}
	if (switchToRuntime) {
		await gamec.connect(deployerAcct).setRuntimeMode();
	}

	return {
		gamec,
		cosmicToken,
		cosmicSignature,
		charityWallet,
		cosmicDAO,
		raffleWallet,
		randomWalkNFT,
		stakingWalletCST,
		stakingWalletRWalk,
		marketingWallet,
		gamec,
	};
};
module.exports = { basicDeployment, basicDeploymentAdvanced };
