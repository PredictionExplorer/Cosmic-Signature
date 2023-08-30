const { ethers } = require("hardhat");

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
	if (typeof charityAddr === 'undefined') {
    	const [owner, otherAccount] = await ethers.getSigners();
		charityAddr = otherAccount.address;
	}
	await charityWallet.setCharity(charityAddr);
	if (transferOwnership) {
	    await charityWallet.connect(deployerAcct).transferOwnership(cosmicDAO.address);
	}

    const RaffleWallet = await hre.ethers.getContractFactory("RaffleWallet");
    raffleWallet = await RaffleWallet.connect(deployerAcct).deploy();
	await raffleWallet.deployed();

    const RandomWalkNFT = await ethers.getContractFactory("RandomWalkNFT");
	if (typeof random_walk_addr === 'undefined') {
	    randomWalkNFT = await RandomWalkNFT.connect(deployerAcct).deploy();
	    await randomWalkNFT.deployed();
	} else {
		randomWalkNFT = await ethers.getContractAt("RandomWalkNFT",randomWalkAddr)
	}

    await cosmicGame.setTokenContract(cosmicToken.address);
    await cosmicGame.setNftContract(cosmicSignature.address);
    await cosmicGame.setCharity(charityWallet.address);
    await cosmicGame.setRandomWalk(randomWalkNFT.address);
    await cosmicGame.setRaffleWallet(raffleWallet.address);
    await cosmicGame.setActivationTime(activationTime);

    return {cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT};
};
module.exports = {basicDeployment};
