
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
	let cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet;
	if (switchToRuntime === undefined) {
		console.error("switchToRuntime is not set");
		process.exit(1);
	}
	// TODO : because .address changed for getAddress() and now uses 'await' keyword, we have to add validation
	// 		otherwise the setXYZ(address) method may fail or do a set to address(0) (critical issue)
	let CosmicGame = await ethers.getContractFactory(cgpName);
	let cosmicGame = await CosmicGame.connect(deployerAcct).deploy();	// implementation contract (business logic)
	await cosmicGame.waitForDeployment();
	let cosmicGameAddr = await cosmicGame.getAddress();

	cosmicGameProxy = await hre.upgrades.deployProxy(
		CosmicGame,
		args = [deployerAcct.address],
		opts = {
			kind: "uups"
		}
	);
	cosmicGameProxyAddr = await cosmicGameProxy.getAddress();
	let CosmicToken = await ethers.getContractFactory("CosmicToken");
	cosmicToken = await CosmicToken.connect(deployerAcct).deploy();
	await cosmicToken.waitForDeployment();
	await cosmicToken.connect(deployerAcct).transferOwnership(await cosmicGameProxyAddr);

	let CosmicSignature = await ethers.getContractFactory("CosmicSignature");
	cosmicSignature = await CosmicSignature.connect(deployerAcct).deploy(await cosmicGameProxyAddr);
	await cosmicSignature.waitForDeployment();

	let CosmicDAO = await ethers.getContractFactory("CosmicDAO");
	cosmicDAO = await CosmicDAO.connect(deployerAcct).deploy(await cosmicToken.getAddress());
	await cosmicDAO.waitForDeployment();

	let CharityWallet = await ethers.getContractFactory("CharityWallet");
	charityWallet = await CharityWallet.connect(deployerAcct).deploy();
	await charityWallet.waitForDeployment();
	if (charityAddr.length == 0) {
		let [owner, otherAccount] = await ethers.getSigners();
		charityAddr = otherAccount.address;
	}
	await charityWallet.setCharity(charityAddr);
	if (transferOwnership) {
		await charityWallet.connect(deployerAcct).transferOwnership(await cosmicDAO.getAddress());
	}

	let RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
	raffleWallet = await RaffleWallet.connect(deployerAcct).deploy(await cosmicGameProxyAddr);
	await raffleWallet.waitForDeployment();

	let MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
	marketingWallet = await MarketingWallet.connect(deployerAcct).deploy(await cosmicToken.getAddress());
	await marketingWallet.waitForDeployment();

	let RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
	if (randomWalkAddr.length === 0) {
		randomWalkNFT = await RandomWalkNFT.connect(deployerAcct).deploy();
		await randomWalkNFT.waitForDeployment();
		randomWalkAddr = await randomWalkNFT.getAddress();
	} else {
		randomWalkNFT = await ethers.getContractAt("RandomWalkNFT", randomWalkAddr);
	}

	let StakingWalletCST = await hre.ethers.getContractFactory("StakingWalletCST");
	stakingWalletCST = await StakingWalletCST.connect(deployerAcct).deploy(
		await cosmicSignature.getAddress(),
		cosmicGameProxyAddr,
		charityAddr,
	);
	await stakingWalletCST.waitForDeployment();

	let StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
	stakingWalletRWalk = await StakingWalletRWalk.connect(deployerAcct).deploy(randomWalkAddr,cosmicGameProxyAddr);
	await stakingWalletRWalk.waitForDeployment();

	await cosmicGameProxy.connect(deployerAcct).setTokenContract(await cosmicToken.getAddress());
	await cosmicGameProxy.connect(deployerAcct).setNftContract(await cosmicSignature.getAddress());
	await cosmicGameProxy.connect(deployerAcct).setCharity(await charityWallet.getAddress());
	await cosmicGameProxy.connect(deployerAcct).setRandomWalk(await randomWalkNFT.getAddress());
	await cosmicGameProxy.connect(deployerAcct).setRaffleWallet(await raffleWallet.getAddress());
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletCST(await stakingWalletCST.getAddress());
	await cosmicGameProxy.connect(deployerAcct).setStakingWalletRWalk(await stakingWalletRWalk.getAddress());
	await cosmicGameProxy.connect(deployerAcct).setMarketingWallet(await marketingWallet.getAddress());
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
		cosmicGame,
	};
};
module.exports = { basicDeployment, basicDeploymentAdvanced };
