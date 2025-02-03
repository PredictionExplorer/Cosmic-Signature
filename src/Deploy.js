"use strict";

// [Comment-202409255]
// Because "hardhat.config.js" imports us, an attempt to import "hardhat" here would throw an error.
// So we must do things differently here.
// [/Comment-202409255]
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

/**
 * @param {import("ethers").Signer} deployerAcct 
 * @param {string} randomWalkNftAddr 
 * @param {string} charityAddr 
 * @param {boolean} transferOwnershipToCosmicSignatureDao 
 * @param {number} roundActivationTime 
 * @returns 
 */
const basicDeployment = async function (
	deployerAcct,
	randomWalkNftAddr,
	charityAddr,
	transferOwnershipToCosmicSignatureDao,
	roundActivationTime
) {
	return await basicDeploymentAdvanced(
		"CosmicSignatureGame",
		deployerAcct,
		randomWalkNftAddr,
		charityAddr,
		transferOwnershipToCosmicSignatureDao,
		roundActivationTime
	);
};

/**
 * @param {string} cosmicSignatureGameContractName 
 * @param {import("ethers").Signer} deployerAcct 
 * todo-1 +++ Test a non-default `deployerAcct`.
 * todo-1 Test that after deployment all restricted functions in all contracts revert for the default signer and work for the given signer.
 * todo-1 There are tests like that in "SystemManagement.js", right? But they deploy as default signer. Change `owner` to be the last signer.
 * @param {string} randomWalkNftAddr May be empty.
 * @param {string} charityAddr 
 * @param {boolean} transferOwnershipToCosmicSignatureDao 
 * @param {number} roundActivationTime 
 * Possible values:
 *    0: leave the default value hardcoded in the contract.
 *    1: use the latest block timestamp.
 *    Any other value: use the given value as is.
 * @returns 
 */
const basicDeploymentAdvanced = async function (
	cosmicSignatureGameContractName,
	deployerAcct,
	randomWalkNftAddr,
	charityAddr,
	transferOwnershipToCosmicSignatureDao,
	roundActivationTime
) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const CosmicSignatureGame = await hre.ethers.getContractFactory(cosmicSignatureGameContractName);

	// Comment-202412129 relates.
	const cosmicSignatureGameProxy =
		await hre.upgrades.deployProxy(
			CosmicSignatureGame.connect(deployerAcct),
			[deployerAcct.address],
			{
				kind: "uups"
			}
		);
		
	const cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();

	// // [Comment-202412061]
	// // Issue. This is not used. So I have commehted this out.
	// // Comment-202412059 relates.
	// // [/Comment-202412061]
	// const cosmicSignatureGameAddressAsString_ =
	// 	await cosmicSignatureGameProxy.runner.provider.getStorage(
	// 		cosmicSignatureGameProxyAddr,
	//
	// 		// [Comment-202412063]
	// 		// This is a documented magic number that in Solidity code is stored in `ERC1967Utils.IMPLEMENTATION_SLOT`.
	// 		// [/Comment-202412063]
	// 		"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
	// 	);

	// [Comment-202412059]
	// Issue. This points at the same address as `cosmicSignatureGameProxy`.
	// That makes sense because it would be incorrect to use the actual contract rather than its proxy
	// because the actual contract state is not meant to be used.
	// Few, if any callers use this.
	// So it could make sense to not even create or return this object, but let's leave it alone for now.
	// Comment-202412061 relates.
	// [/Comment-202412059]
	const cosmicSignatureGame = await CosmicSignatureGame.connect(deployerAcct).attach(cosmicSignatureGameProxyAddr);

	const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
	const cosmicSignatureNft = await CosmicSignatureNft.connect(deployerAcct).deploy(cosmicSignatureGameProxyAddr);
	await cosmicSignatureNft.waitForDeployment();
	const cosmicSignatureNftAddr = await cosmicSignatureNft.getAddress();

	const CosmicSignatureToken = await hre.ethers.getContractFactory("CosmicSignatureToken");
	// const cosmicSignatureToken = await CosmicSignatureToken.connect(deployerAcct).deploy();
	const cosmicSignatureToken = await CosmicSignatureToken.connect(deployerAcct).deploy(cosmicSignatureGameProxyAddr);
	await cosmicSignatureToken.waitForDeployment();
	const cosmicSignatureTokenAddr = await cosmicSignatureToken.getAddress();
	// await cosmicSignatureToken.connect(deployerAcct).transferOwnership(cosmicSignatureGameProxyAddr);

	const CosmicSignatureDao = await hre.ethers.getContractFactory("CosmicSignatureDao");
	const cosmicSignatureDao = await CosmicSignatureDao.connect(deployerAcct).deploy(cosmicSignatureTokenAddr);
	await cosmicSignatureDao.waitForDeployment();
	const cosmicSignatureDaoAddr = await cosmicSignatureDao.getAddress();

	const CharityWallet = await hre.ethers.getContractFactory("CharityWallet");
	const charityWallet = await CharityWallet.connect(deployerAcct).deploy();
	await charityWallet.waitForDeployment();
	const charityWalletAddr = await charityWallet.getAddress();
	await charityWallet.connect(deployerAcct).setCharityAddress(charityAddr);
	if (transferOwnershipToCosmicSignatureDao) {
		// It appears that it makes no sense to perform this kind of ownership transfer for any other contracts.
		await charityWallet.connect(deployerAcct).transferOwnership(cosmicSignatureDaoAddr);
	}

	const PrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
	const prizesWallet = await PrizesWallet.connect(deployerAcct).deploy(cosmicSignatureGameProxyAddr);
	await prizesWallet.waitForDeployment();
	const prizesWalletAddr = await prizesWallet.getAddress();

	let randomWalkNft;
	if (randomWalkNftAddr.length === 0) {
		const RandomWalkNFT = await hre.ethers.getContractFactory("RandomWalkNFT");
		randomWalkNft = await RandomWalkNFT.connect(deployerAcct).deploy();
		await randomWalkNft.waitForDeployment();
		randomWalkNftAddr = await randomWalkNft.getAddress();
	} else {
		randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr, deployerAcct);
		if (await randomWalkNft.getAddress() !== randomWalkNftAddr) {
			throw new Error("Error 202411196.");
		}
	}

	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft");
	const stakingWalletCosmicSignatureNft =
		await StakingWalletCosmicSignatureNft.connect(deployerAcct).deploy(
			cosmicSignatureNftAddr,
			cosmicSignatureGameProxyAddr

			// // Issue. It could make sense to use `charityWalletAddr` instead.
			// charityAddr
		);
	await stakingWalletCosmicSignatureNft.waitForDeployment();
	const stakingWalletCosmicSignatureNftAddr = await stakingWalletCosmicSignatureNft.getAddress();

	const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
	const stakingWalletRandomWalkNft = await StakingWalletRandomWalkNft.connect(deployerAcct).deploy(randomWalkNftAddr);
	await stakingWalletRandomWalkNft.waitForDeployment();
	const stakingWalletRandomWalkNftAddr = await stakingWalletRandomWalkNft.getAddress();

	const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
	const marketingWallet = await MarketingWallet.connect(deployerAcct).deploy(cosmicSignatureTokenAddr);
	await marketingWallet.waitForDeployment();
	const marketingWalletAddr = await marketingWallet.getAddress();

	await cosmicSignatureGameProxy.connect(deployerAcct).setCosmicSignatureToken(cosmicSignatureTokenAddr);
	await cosmicSignatureGameProxy.connect(deployerAcct).setRandomWalkNft(randomWalkNftAddr);
	await cosmicSignatureGameProxy.connect(deployerAcct).setCosmicSignatureNft(cosmicSignatureNftAddr);
	await cosmicSignatureGameProxy.connect(deployerAcct).setPrizesWallet(prizesWalletAddr);
	await cosmicSignatureGameProxy.connect(deployerAcct).setStakingWalletRandomWalkNft(stakingWalletRandomWalkNftAddr);
	await cosmicSignatureGameProxy.connect(deployerAcct).setStakingWalletCosmicSignatureNft(stakingWalletCosmicSignatureNftAddr);
	await cosmicSignatureGameProxy.connect(deployerAcct).setMarketingWallet(marketingWalletAddr);
	await cosmicSignatureGameProxy.connect(deployerAcct).setCharityAddress(charityWalletAddr);
	if (roundActivationTime != 0) {
		if (roundActivationTime == 1) {
			const latestBlock = await hre.ethers.provider.getBlock("latest");
			roundActivationTime = latestBlock.timestamp + 1;
		}
		await cosmicSignatureGameProxy.connect(deployerAcct).setRoundActivationTime(roundActivationTime);
	}

	return {
		cosmicSignatureGameProxy,
		cosmicSignatureNft,
		cosmicSignatureToken,
		cosmicSignatureDao,
		charityWallet,
		prizesWallet,
		randomWalkNft,
		stakingWalletCosmicSignatureNft,
		stakingWalletRandomWalkNft,
		marketingWallet,
		cosmicSignatureGame,
	};
};

module.exports = { basicDeployment, basicDeploymentAdvanced };
