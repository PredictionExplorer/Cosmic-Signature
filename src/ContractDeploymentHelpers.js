// #region

"use strict";

// #endregion
// #region

// [Comment-202409255]
// Because "hardhat.config.js" imports us, an attempt to import "hardhat" here would throw an error.
// So we must do things differently here.
// Issue. A better option could be to add the `hre` parameter to functions that need it.
// [/Comment-202409255]
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

const { waitForTransactionReceipt, safeErc1967GetChangedImplementationAddress } = require("./Helpers.js");

// #endregion
// #region `deployContracts`

/**
 * @param {import("hardhat").ethers.AbstractSigner} deployerSigner 
 * @param {string} randomWalkNftAddress 
 * @param {string} charityAddress 
 * @param {boolean} transferContractOwnershipToCosmicSignatureDao 
 * @param {bigint} roundActivationTime 
 */
const deployContracts = async function (
	deployerSigner,
	randomWalkNftAddress,
	charityAddress,
	transferContractOwnershipToCosmicSignatureDao,
	roundActivationTime
) {
	return await deployContractsAdvanced(
		deployerSigner,
		"CosmicSignatureGame",
		randomWalkNftAddress,
		charityAddress,
		transferContractOwnershipToCosmicSignatureDao,
		roundActivationTime
	);
};

// #endregion
// #region `deployContractsAdvanced`

/**
 * @param {import("hardhat").ethers.AbstractSigner} deployerSigner 
 * @param {string} cosmicSignatureGameContractName 
 * @param {string} randomWalkNftAddress May be empty or zero.
 * @param {string} charityAddress May be empty or zero.
 * @param {boolean} transferContractOwnershipToCosmicSignatureDao 
 * @param {bigint} roundActivationTime 
 */
const deployContractsAdvanced = async function (
	deployerSigner,
	cosmicSignatureGameContractName,
	randomWalkNftAddress,
	charityAddress,
	transferContractOwnershipToCosmicSignatureDao,
	roundActivationTime
) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const cosmicSignatureGameFactory = await hre.ethers.getContractFactory(cosmicSignatureGameContractName, deployerSigner);

	// Comment-202503132 relates.
	const cosmicSignatureGameProxy =
		await hre.upgrades.deployProxy(
			cosmicSignatureGameFactory,
			[deployerSigner.address,],
			{
				kind: "uups"
			}
		);

	await cosmicSignatureGameProxy.waitForDeployment();
	const cosmicSignatureGameProxyAddress = await cosmicSignatureGameProxy.getAddress();

	const cosmicSignatureGameImplementationAddress = await safeErc1967GetChangedImplementationAddress(cosmicSignatureGameProxyAddress, hre.ethers.ZeroAddress);
	const cosmicSignatureGameImplementation = cosmicSignatureGameFactory.attach(cosmicSignatureGameImplementationAddress);

	const cosmicSignatureTokenFactory = await hre.ethers.getContractFactory("CosmicSignatureToken", deployerSigner);
	const cosmicSignatureToken = await cosmicSignatureTokenFactory.deploy(cosmicSignatureGameProxyAddress);
	await cosmicSignatureToken.waitForDeployment();
	const cosmicSignatureTokenAddress = await cosmicSignatureToken.getAddress();

	const randomWalkNftFactory = await hre.ethers.getContractFactory("RandomWalkNFT", deployerSigner);
	let randomWalkNft;
	if (randomWalkNftAddress.length <= 0 || randomWalkNftAddress == hre.ethers.ZeroAddress) {
		randomWalkNft = await randomWalkNftFactory.deploy();
		await randomWalkNft.waitForDeployment();
		randomWalkNftAddress = await randomWalkNft.getAddress();
	} else {
		randomWalkNft = randomWalkNftFactory.attach(randomWalkNftAddress);
	}

	const cosmicSignatureNftFactory = await hre.ethers.getContractFactory("CosmicSignatureNft", deployerSigner);
	const cosmicSignatureNft = await cosmicSignatureNftFactory.deploy(cosmicSignatureGameProxyAddress);
	await cosmicSignatureNft.waitForDeployment();
	const cosmicSignatureNftAddress = await cosmicSignatureNft.getAddress();

	const prizesWalletFactory = await hre.ethers.getContractFactory("PrizesWallet", deployerSigner);
	const prizesWallet = await prizesWalletFactory.deploy(cosmicSignatureGameProxyAddress);
	await prizesWallet.waitForDeployment();
	const prizesWalletAddress = await prizesWallet.getAddress();

	const stakingWalletRandomWalkNftFactory = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft", deployerSigner);
	const stakingWalletRandomWalkNft = await stakingWalletRandomWalkNftFactory.deploy(randomWalkNftAddress);
	await stakingWalletRandomWalkNft.waitForDeployment();
	const stakingWalletRandomWalkNftAddress = await stakingWalletRandomWalkNft.getAddress();

	const stakingWalletCosmicSignatureNftFactory = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft", deployerSigner);
	const stakingWalletCosmicSignatureNft =
		await stakingWalletCosmicSignatureNftFactory.deploy(cosmicSignatureNftAddress, cosmicSignatureGameProxyAddress);
	await stakingWalletCosmicSignatureNft.waitForDeployment();
	const stakingWalletCosmicSignatureNftAddress = await stakingWalletCosmicSignatureNft.getAddress();

	const marketingWalletFactory = await hre.ethers.getContractFactory("MarketingWallet", deployerSigner);
	const marketingWallet = await marketingWalletFactory.deploy(cosmicSignatureTokenAddress);
	await marketingWallet.waitForDeployment();
	const marketingWalletAddress = await marketingWallet.getAddress();

	const cosmicSignatureDaoFactory = await hre.ethers.getContractFactory("CosmicSignatureDao", deployerSigner);
	const cosmicSignatureDao = await cosmicSignatureDaoFactory.deploy(cosmicSignatureTokenAddress);
	await cosmicSignatureDao.waitForDeployment();
	const cosmicSignatureDaoAddress = await cosmicSignatureDao.getAddress();

	const charityWalletFactory = await hre.ethers.getContractFactory("CharityWallet", deployerSigner);
	const charityWallet = await charityWalletFactory.deploy();
	await charityWallet.waitForDeployment();
	const charityWalletAddress = await charityWallet.getAddress();
	if (charityAddress.length > 0 && charityAddress != hre.ethers.ZeroAddress) {
		await waitForTransactionReceipt(charityWallet.setCharityAddress(charityAddress));
	}
	if (transferContractOwnershipToCosmicSignatureDao) {
		// It appears that it makes no sense to perform this kind of ownership transfer for any other contracts.
		await waitForTransactionReceipt(charityWallet.transferOwnership(cosmicSignatureDaoAddress));
	}

	await waitForTransactionReceipt(cosmicSignatureGameProxy.setCosmicSignatureToken(cosmicSignatureTokenAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setRandomWalkNft(randomWalkNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setCosmicSignatureNft(cosmicSignatureNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setPrizesWallet(prizesWalletAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(stakingWalletRandomWalkNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(stakingWalletCosmicSignatureNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setMarketingWallet(marketingWalletAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setCharityAddress(charityWalletAddress));
	await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, roundActivationTime);

	return {
		cosmicSignatureTokenFactory,
		cosmicSignatureToken,
		cosmicSignatureTokenAddress,
		randomWalkNftFactory,
		randomWalkNft,
		randomWalkNftAddress,
		cosmicSignatureNftFactory,
		cosmicSignatureNft,
		cosmicSignatureNftAddress,
		prizesWalletFactory,
		prizesWallet,
		prizesWalletAddress,
		stakingWalletRandomWalkNftFactory,
		stakingWalletRandomWalkNft,
		stakingWalletRandomWalkNftAddress,
		stakingWalletCosmicSignatureNftFactory,
		stakingWalletCosmicSignatureNft,
		stakingWalletCosmicSignatureNftAddress,
		marketingWalletFactory,
		marketingWallet,
		marketingWalletAddress,
		charityWalletFactory,
		charityWallet,
		charityWalletAddress,
		cosmicSignatureDaoFactory,
		cosmicSignatureDao,
		cosmicSignatureDaoAddress,
		cosmicSignatureGameFactory,
		cosmicSignatureGameImplementation,
		cosmicSignatureGameImplementationAddress,
		cosmicSignatureGameProxy,
		cosmicSignatureGameProxyAddress,
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
 */
async function setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, roundActivationTime) {
	// [Comment-202507202]
	// Similar magic numbers exist in multiple places.
	// [/Comment-202507202]
	if (roundActivationTime > -1_000_000_000n) {

		// Comment-202507202 applies.
		if (roundActivationTime < 1_000_000_000n) {

			// Comment-202409255 applies.
			const hre = HardhatContext.getHardhatContext().environment;

			const latestBlock = await hre.ethers.provider.getBlock("latest");
			roundActivationTime += BigInt(latestBlock.timestamp);
		}
		await waitForTransactionReceipt(cosmicSignatureGameProxy.setRoundActivationTime(roundActivationTime));
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
