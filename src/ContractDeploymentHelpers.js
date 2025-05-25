// #region

"use strict";

// #endregion
// #region

// [Comment-202409255]
// Because "hardhat.config.js" imports us, an attempt to import "hardhat" here would throw an error.
// So we must do things differently here.
// [/Comment-202409255]
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

// #endregion
// #region `deployContracts`

/**
 * @param {import("ethers").BaseWallet} deployerAcct 
 * @param {string} randomWalkNftAddr 
 * @param {string} charityAddr 
 * @param {boolean} transferOwnershipToCosmicSignatureDao 
 * @param {bigint} roundActivationTime 
 */
const deployContracts = async function (
	deployerAcct,
	randomWalkNftAddr,
	charityAddr,
	transferOwnershipToCosmicSignatureDao,
	roundActivationTime
) {
	return await deployContractsAdvanced(
		deployerAcct,
		"CosmicSignatureGame",
		randomWalkNftAddr,
		charityAddr,
		transferOwnershipToCosmicSignatureDao,
		roundActivationTime
	);
};

// #endregion
// #region `deployContractsAdvanced`

/**
 * @param {import("ethers").BaseWallet} deployerAcct 
 * @param {string} cosmicSignatureGameContractName 
 * @param {string} randomWalkNftAddr May be empty.
 * @param {string} charityAddr 
 * @param {boolean} transferOwnershipToCosmicSignatureDao 
 * @param {bigint} roundActivationTime 
 */
const deployContractsAdvanced = async function (
	deployerAcct,
	cosmicSignatureGameContractName,
	randomWalkNftAddr,
	charityAddr,
	transferOwnershipToCosmicSignatureDao,
	roundActivationTime
) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const cosmicSignatureGameFactory = await hre.ethers.getContractFactory(cosmicSignatureGameContractName, deployerAcct);

	// Comment-202503132 relates.
	const cosmicSignatureGameProxy =
		await hre.upgrades.deployProxy(
			cosmicSignatureGameFactory,
			[deployerAcct.address],
			{
				kind: "uups"
			}
		);

	await cosmicSignatureGameProxy.waitForDeployment();
	const cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();

	const cosmicSignatureGameImplementationAddr = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddr);
	const cosmicSignatureGameImplementation = cosmicSignatureGameFactory.attach(cosmicSignatureGameImplementationAddr);

	const cosmicSignatureTokenFactory = await hre.ethers.getContractFactory("CosmicSignatureToken", deployerAcct);
	const cosmicSignatureToken = await cosmicSignatureTokenFactory.deploy(cosmicSignatureGameProxyAddr);
	await cosmicSignatureToken.waitForDeployment();
	const cosmicSignatureTokenAddr = await cosmicSignatureToken.getAddress();

	const randomWalkNftFactory = await hre.ethers.getContractFactory("RandomWalkNFT", deployerAcct);
	let randomWalkNft;
	if (randomWalkNftAddr.length <= 0) {
		randomWalkNft = await randomWalkNftFactory.deploy();
		await randomWalkNft.waitForDeployment();
		randomWalkNftAddr = await randomWalkNft.getAddress();
	} else {
		randomWalkNft = randomWalkNftFactory.attach(randomWalkNftAddr);
	}

	const cosmicSignatureNftFactory = await hre.ethers.getContractFactory("CosmicSignatureNft", deployerAcct);
	const cosmicSignatureNft = await cosmicSignatureNftFactory.deploy(cosmicSignatureGameProxyAddr);
	await cosmicSignatureNft.waitForDeployment();
	const cosmicSignatureNftAddr = await cosmicSignatureNft.getAddress();

	const prizesWalletFactory = await hre.ethers.getContractFactory("PrizesWallet", deployerAcct);
	const prizesWallet = await prizesWalletFactory.deploy(cosmicSignatureGameProxyAddr);
	await prizesWallet.waitForDeployment();
	const prizesWalletAddr = await prizesWallet.getAddress();

	const stakingWalletRandomWalkNftFactory = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft", deployerAcct);
	const stakingWalletRandomWalkNft = await stakingWalletRandomWalkNftFactory.deploy(randomWalkNftAddr);
	await stakingWalletRandomWalkNft.waitForDeployment();
	const stakingWalletRandomWalkNftAddr = await stakingWalletRandomWalkNft.getAddress();

	const stakingWalletCosmicSignatureNftFactory = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft", deployerAcct);
	const stakingWalletCosmicSignatureNft =
		await stakingWalletCosmicSignatureNftFactory.deploy(cosmicSignatureNftAddr, cosmicSignatureGameProxyAddr);
	await stakingWalletCosmicSignatureNft.waitForDeployment();
	const stakingWalletCosmicSignatureNftAddr = await stakingWalletCosmicSignatureNft.getAddress();

	const marketingWalletFactory = await hre.ethers.getContractFactory("MarketingWallet", deployerAcct);
	const marketingWallet = await marketingWalletFactory.deploy(cosmicSignatureTokenAddr);
	await marketingWallet.waitForDeployment();
	const marketingWalletAddr = await marketingWallet.getAddress();

	const cosmicSignatureDaoFactory = await hre.ethers.getContractFactory("CosmicSignatureDao", deployerAcct);
	const cosmicSignatureDao = await cosmicSignatureDaoFactory.deploy(cosmicSignatureTokenAddr);
	await cosmicSignatureDao.waitForDeployment();
	const cosmicSignatureDaoAddr = await cosmicSignatureDao.getAddress();

	const charityWalletFactory = await hre.ethers.getContractFactory("CharityWallet", deployerAcct);
	const charityWallet = await charityWalletFactory.deploy();
	await charityWallet.waitForDeployment();
	const charityWalletAddr = await charityWallet.getAddress();
	await (await charityWallet.setCharityAddress(charityAddr)).wait();
	if (transferOwnershipToCosmicSignatureDao) {
		// It appears that it makes no sense to perform this kind of ownership transfer for any other contracts.
		await (await charityWallet.transferOwnership(cosmicSignatureDaoAddr)).wait();
	}

	await (await cosmicSignatureGameProxy.setCosmicSignatureToken(cosmicSignatureTokenAddr)).wait();
	await (await cosmicSignatureGameProxy.setRandomWalkNft(randomWalkNftAddr)).wait();
	await (await cosmicSignatureGameProxy.setCosmicSignatureNft(cosmicSignatureNftAddr)).wait();
	await (await cosmicSignatureGameProxy.setPrizesWallet(prizesWalletAddr)).wait();
	await (await cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(stakingWalletRandomWalkNftAddr)).wait();
	await (await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(stakingWalletCosmicSignatureNftAddr)).wait();
	await (await cosmicSignatureGameProxy.setMarketingWallet(marketingWalletAddr)).wait();
	await (await cosmicSignatureGameProxy.setCharityAddress(charityWalletAddr)).wait();
	await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, roundActivationTime);

	return {
		cosmicSignatureTokenFactory,
		cosmicSignatureToken,
		cosmicSignatureTokenAddr,
		randomWalkNftFactory,
		randomWalkNft,
		randomWalkNftAddr,
		cosmicSignatureNftFactory,
		cosmicSignatureNft,
		cosmicSignatureNftAddr,
		prizesWalletFactory,
		prizesWallet,
		prizesWalletAddr,
		stakingWalletRandomWalkNftFactory,
		stakingWalletRandomWalkNft,
		stakingWalletRandomWalkNftAddr,
		stakingWalletCosmicSignatureNftFactory,
		stakingWalletCosmicSignatureNft,
		stakingWalletCosmicSignatureNftAddr,
		marketingWalletFactory,
		marketingWallet,
		marketingWalletAddr,
		charityWalletFactory,
		charityWallet,
		charityWalletAddr,
		cosmicSignatureDaoFactory,
		cosmicSignatureDao,
		cosmicSignatureDaoAddr,
		cosmicSignatureGameFactory,
		cosmicSignatureGameImplementation,
		cosmicSignatureGameImplementationAddr,
		cosmicSignatureGameProxy,
		cosmicSignatureGameProxyAddr,
	};
};

// #endregion
// #region `setRoundActivationTimeIfNeeded`

/**
 * @param {bigint} roundActivationTime 
 * Possible values:
 *    less than or equal negative 1 billion: do nothing (on deployment, the value hardcoded in the contract will stay unchanged).
 *    greater than or equal 1 billion: use the given value as is.
 *    any other value: use the latest mined block timestamp plus the given value.
 * @returns 
 */
async function setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, roundActivationTime) {
	if (roundActivationTime > -1_000_000_000n) {
		if (roundActivationTime < 1_000_000_000n) {
			// Comment-202409255 applies.
			const hre = HardhatContext.getHardhatContext().environment;

			const latestBlock = await hre.ethers.provider.getBlock("latest");
			roundActivationTime += BigInt(latestBlock.timestamp);
		}
		//try {
			await (await cosmicSignatureGameProxy.setRoundActivationTime(roundActivationTime)).wait();
		// } catch (e) {
		// 	console.log(e);
		// }
	}
}

// #endregion
// #region

module.exports = {
	deployContracts,
	deployContractsAdvanced,
	setRoundActivationTimeIfNeeded,
};

// #endregion
