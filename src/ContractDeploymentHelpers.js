// #region

"use strict";

// #endregion
// #region

// Comment-202409255 applies.
// const hre = require("hardhat");
const { HardhatContext } = require("hardhat/internal/context");

// Comment-202409255 relates.
const { HARDHAT_MODE_CODE, getBlockTimeStampByBlockNumber, waitForTransactionReceipt } = require("./Helpers.js");

// #endregion
// #region `deployContracts`

/**
@param {import("ethers").Signer} deployerSigner 
@param {string} randomWalkNftAddress 
@param {string} charityAddress 
@param {boolean} transferContractOwnershipToCosmicSignatureDao 
@param {bigint} roundActivationTime 
*/
const deployContracts = async function (
	deployerSigner,
	randomWalkNftAddress,
	charityAddress,
	transferContractOwnershipToCosmicSignatureDao,
	roundActivationTime
) {
	return /*await*/ deployContractsAdvanced(
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
@param {import("ethers").Signer} deployerSigner 
@param {string} cosmicSignatureGameContractName 
@param {string} randomWalkNftAddress May be empty or zero.
@param {string} charityAddress May be empty or zero.
@param {boolean} transferContractOwnershipToCosmicSignatureDao 
@param {bigint} roundActivationTime See `setRoundActivationTimeIfNeeded`.
@param {<ActionReturnValue_>(contractName: string, action: () => Promise<ActionReturnValue_>) => Promise<ActionReturnValue_>} [withArtifactsForContract] Tests select the snapshot that supplies each contract.
*/
const deployContractsAdvanced = async function (
	deployerSigner,
	cosmicSignatureGameContractName,
	randomWalkNftAddress,
	charityAddress,
	transferContractOwnershipToCosmicSignatureDao,
	roundActivationTime,
	withArtifactsForContract = (_contractName, action) => action()
) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const getContractFactory = (name) => withArtifactsForContract(name, () => hre.ethers.getContractFactory(name, deployerSigner));
	const {cosmicSignatureGameFactory, cosmicSignatureGameProxy,} =
		await withArtifactsForContract(
			cosmicSignatureGameContractName,
			async () => {
				const cosmicSignatureGameFactory = await hre.ethers.getContractFactory(cosmicSignatureGameContractName, deployerSigner);
				const cosmicSignatureGameProxy =
					await hre.upgrades.deployProxy(
						cosmicSignatureGameFactory,
						[deployerSigner.address,],
						{
							kind: "uups",
							// initializer: "initialize",
						}
					);
				return { cosmicSignatureGameFactory, cosmicSignatureGameProxy };
			}
		);
	await cosmicSignatureGameProxy.waitForDeployment();
	const cosmicSignatureGameProxyAddress = await cosmicSignatureGameProxy.getAddress();

	const cosmicSignatureGameImplementationAddress = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddress);
	const cosmicSignatureGameImplementation = cosmicSignatureGameFactory.attach(cosmicSignatureGameImplementationAddress);

	const cosmicSignatureTokenFactory = await getContractFactory("CosmicSignatureToken");
	const cosmicSignatureToken = await cosmicSignatureTokenFactory.deploy(cosmicSignatureGameProxyAddress);
	await cosmicSignatureToken.waitForDeployment();
	const cosmicSignatureTokenAddress = await cosmicSignatureToken.getAddress();

	const randomWalkNftFactory = await getContractFactory("RandomWalkNFT");
	let randomWalkNft;
	if (randomWalkNftAddress.length <= 0 || randomWalkNftAddress == hre.ethers.ZeroAddress) {
		randomWalkNft = await randomWalkNftFactory.deploy();
		await randomWalkNft.waitForDeployment();
		randomWalkNftAddress = await randomWalkNft.getAddress();
	} else {
		randomWalkNft = randomWalkNftFactory.attach(randomWalkNftAddress);
	}

	const cosmicSignatureNftFactory = await getContractFactory("CosmicSignatureNft");
	const cosmicSignatureNft = await cosmicSignatureNftFactory.deploy(cosmicSignatureGameProxyAddress);
	await cosmicSignatureNft.waitForDeployment();
	const cosmicSignatureNftAddress = await cosmicSignatureNft.getAddress();

	const prizesWalletFactory = await getContractFactory("PrizesWallet");
	const prizesWallet = await prizesWalletFactory.deploy(cosmicSignatureGameProxyAddress);
	await prizesWallet.waitForDeployment();
	const prizesWalletAddress = await prizesWallet.getAddress();

	const stakingWalletRandomWalkNftFactory = await getContractFactory("StakingWalletRandomWalkNft");
	const stakingWalletRandomWalkNft = await stakingWalletRandomWalkNftFactory.deploy(randomWalkNftAddress);
	await stakingWalletRandomWalkNft.waitForDeployment();
	const stakingWalletRandomWalkNftAddress = await stakingWalletRandomWalkNft.getAddress();

	const stakingWalletCosmicSignatureNftFactory = await getContractFactory("StakingWalletCosmicSignatureNft");
	const stakingWalletCosmicSignatureNft =
		await stakingWalletCosmicSignatureNftFactory.deploy(cosmicSignatureNftAddress, cosmicSignatureGameProxyAddress);
	await stakingWalletCosmicSignatureNft.waitForDeployment();
	const stakingWalletCosmicSignatureNftAddress = await stakingWalletCosmicSignatureNft.getAddress();

	const marketingWalletFactory = await getContractFactory("MarketingWallet");
	const marketingWallet = await marketingWalletFactory.deploy(cosmicSignatureTokenAddress);
	await marketingWallet.waitForDeployment();
	const marketingWalletAddress = await marketingWallet.getAddress();

	const charityWalletFactory = await getContractFactory("CharityWallet");
	const charityWallet = await charityWalletFactory.deploy();
	await charityWallet.waitForDeployment();
	const charityWalletAddress = await charityWallet.getAddress();
	if (charityAddress.length > 0 && charityAddress != hre.ethers.ZeroAddress) {
		await waitForTransactionReceipt(charityWallet.setCharityAddress(charityAddress));
	}

	const cosmicSignatureDaoFactory = await getContractFactory("CosmicSignatureDao");
	const cosmicSignatureDao = await cosmicSignatureDaoFactory.deploy(cosmicSignatureTokenAddress);
	await cosmicSignatureDao.waitForDeployment();
	const cosmicSignatureDaoAddress = await cosmicSignatureDao.getAddress();

	await waitForTransactionReceipt(cosmicSignatureGameProxy.setCosmicSignatureToken(cosmicSignatureTokenAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setRandomWalkNft(randomWalkNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setCosmicSignatureNft(cosmicSignatureNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setPrizesWallet(prizesWalletAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(stakingWalletRandomWalkNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(stakingWalletCosmicSignatureNftAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setMarketingWallet(marketingWalletAddress));
	await waitForTransactionReceipt(cosmicSignatureGameProxy.setCharityAddress(charityWalletAddress));
	await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, roundActivationTime);
	if (transferContractOwnershipToCosmicSignatureDao) {
		await waitForTransactionReceipt(marketingWallet.transferOwnership(cosmicSignatureDaoAddress));
		await waitForTransactionReceipt(charityWallet.transferOwnership(cosmicSignatureDaoAddress));
	}

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
@param {bigint} roundActivationTime 
Possible values:
   less than or equal negative 1 billion: do nothing (on deployment, the value hardcoded in the contract will stay unchanged).
   greater than or equal 1 billion: use the given value as is.
   any other value: use the "current" block timestamp plus the given value.
Which block is the "current", we choose near Comment-202510206.
*/
async function setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, roundActivationTime) {
	// [Comment-202507202]
	// Similar magic numbers exist in multiple places.
	// [/Comment-202507202]
	if (roundActivationTime > -1_000_000_000n) {

		// Comment-202507202 applies.
		if (roundActivationTime < 1_000_000_000n) {

			// [Comment-202510206/]
			const currentBlockTag = (HARDHAT_MODE_CODE == 1) ? "latest" : "pending";

			const currentBlockTimeStamp = await getBlockTimeStampByBlockNumber(currentBlockTag);
			// console.info("%s", currentBlockTimeStamp);
			roundActivationTime += currentBlockTimeStamp;
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
