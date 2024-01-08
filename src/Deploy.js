//const { ethers } = require("hardhat");

const basicDeployment = async function(deployerAcct,randomWalkAddr,activationTime,charityAddr,transferOwnership) {

	let cosmicGame,cosmicToken,cosmicSignature,charityWallet,cosmicDAO,randomWalkNFT,raffleWallet;

    const CosmicGame = await ethers.getContractFactory("CosmicGame");
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

    const StakingWallet = await hre.ethers.getContractFactory("StakingWallet");
    stakingWallet = await StakingWallet.connect(deployerAcct).deploy(cosmicSignature.address,cosmicGame.address,charityAddr);
	await stakingWallet.deployed();

    const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
    marketingWallet = await MarketingWallet.connect(deployerAcct).deploy(cosmicToken.address);
	await marketingWallet.deployed();

    const RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
	if (randomWalkAddr.length === 0) {
	    randomWalkNFT = await RandomWalkNFT.connect(deployerAcct).deploy();
	    await randomWalkNFT.deployed();
	} else {
		randomWalkNFT = await ethers.getContractAt("RandomWalkNFT",randomWalkAddr)
	}

    const BusinessLogic  = await ethers.getContractFactory("BusinessLogic");
    bLogic = await BusinessLogic.connect(deployerAcct).deploy();
	await bLogic.deployed();

    await cosmicGame.connect(deployerAcct).setTokenContract(cosmicToken.address);
    await cosmicGame.connect(deployerAcct).setNftContract(cosmicSignature.address);
    await cosmicGame.connect(deployerAcct).setCharity(charityWallet.address);
    await cosmicGame.connect(deployerAcct).setBusinessLogicContract(bLogic.address);
    await cosmicGame.connect(deployerAcct).setRandomWalk(randomWalkNFT.address);
    await cosmicGame.connect(deployerAcct).setRaffleWallet(raffleWallet.address);
	await cosmicGame.connect(deployerAcct).setStakingWallet(stakingWallet.address);
	await cosmicGame.connect(deployerAcct).setMarketingWallet(marketingWallet.address);
    await cosmicGame.connect(deployerAcct).setActivationTime(activationTime);

    return {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWallet,marketingWallet,bLogic};
};
module.exports = {basicDeployment};
