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
@param {import("ethers").Signer} deployerSigner 
@param {string} cosmicSignatureGameContractName 
@param {string} randomWalkNftAddress May be empty or zero.
@param {string} charityAddress May be empty or zero.
@param {boolean} transferContractOwnershipToCosmicSignatureDao 
@param {bigint} roundActivationTime See `setRoundActivationTimeIfNeeded`.
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
	const cosmicSignatureGameProxy =
		await hre.upgrades.deployProxy(
			cosmicSignatureGameFactory,
			[deployerSigner.address,],
			{
				kind: "uups",
				// initializer: "initialize",
			}
		);
	await cosmicSignatureGameProxy.waitForDeployment();
	const cosmicSignatureGameProxyAddress = await cosmicSignatureGameProxy.getAddress();

	const cosmicSignatureGameImplementationAddress = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddress);
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

	const charityWalletFactory = await hre.ethers.getContractFactory("CharityWallet", deployerSigner);
	const charityWallet = await charityWalletFactory.deploy();
	await charityWallet.waitForDeployment();
	const charityWalletAddress = await charityWallet.getAddress();
	if (charityAddress.length > 0 && charityAddress != hre.ethers.ZeroAddress) {
		await waitForTransactionReceipt(charityWallet.setCharityAddress(charityAddress));
	}

	const cosmicSignatureDaoFactory = await hre.ethers.getContractFactory("CosmicSignatureDao", deployerSigner);
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
// #region `deployCosmicSignatureGameV3Modules`

/**
Deploys the 2 delegatecall modules of the V3 Game (Comment-202608245), in the reverse of
the fallback forwarding chain order (Comment-202608246): prizes (the chain tail),
then admin (forwarding to prizes).
The admin module address plus the prizes module address are the `CosmicSignatureGameV3` implementation
constructor arguments.
@param {import("ethers").Signer} deployerSigner_
*/
async function deployCosmicSignatureGameV3Modules(deployerSigner_) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const cosmicSignatureGamePrizesModuleFactory_ =
		await hre.ethers.getContractFactory("CosmicSignatureGamePrizesModuleV3", deployerSigner_);
	const cosmicSignatureGamePrizesModule_ = await cosmicSignatureGamePrizesModuleFactory_.deploy();
	await cosmicSignatureGamePrizesModule_.waitForDeployment();
	const cosmicSignatureGamePrizesModuleAddress_ = await cosmicSignatureGamePrizesModule_.getAddress();

	const cosmicSignatureGameAdminModuleFactory_ =
		await hre.ethers.getContractFactory("CosmicSignatureGameAdminModuleV3", deployerSigner_);
	const cosmicSignatureGameAdminModule_ = await cosmicSignatureGameAdminModuleFactory_.deploy(cosmicSignatureGamePrizesModuleAddress_);
	await cosmicSignatureGameAdminModule_.waitForDeployment();
	const cosmicSignatureGameAdminModuleAddress_ = await cosmicSignatureGameAdminModule_.getAddress();

	return {
		cosmicSignatureGamePrizesModuleFactory: cosmicSignatureGamePrizesModuleFactory_,
		cosmicSignatureGamePrizesModule: cosmicSignatureGamePrizesModule_,
		cosmicSignatureGamePrizesModuleAddress: cosmicSignatureGamePrizesModuleAddress_,
		cosmicSignatureGameAdminModuleFactory: cosmicSignatureGameAdminModuleFactory_,
		cosmicSignatureGameAdminModule: cosmicSignatureGameAdminModule_,
		cosmicSignatureGameAdminModuleAddress: cosmicSignatureGameAdminModuleAddress_,
	};
}

// #endregion
// #region `buildCombinedCosmicSignatureGameV3Abi`

/**
Builds the combined ABI of the modular V3 Game as observed at the proxy: the implementation's own ABI
plus everything the modules serve through the fallback forwarding chain (Comment-202608246),
deduplicated in chain-precedence order. `test/tests-src/CosmicSignatureGameV3-ModularEquality.js` asserts
that this equals the recorded pre-split monolith ABI baseline.
@param {import("ethers").Interface} implementationInterface_
@param {import("ethers").Interface[]} moduleInterfaces_ In the fallback forwarding chain order.
*/
function buildCombinedCosmicSignatureGameV3Abi(implementationInterface_, moduleInterfaces_) {
	const seenFragmentKeys_ = new Set();
	const combinedAbiFragments_ = [];
	const addFragmentIfNew_ = (fragment_) => {
		const fragmentKey_ = fragment_.type + ":" + fragment_.format("sighash");
		if ( ! seenFragmentKeys_.has(fragmentKey_) ) {
			seenFragmentKeys_.add(fragmentKey_);
			combinedAbiFragments_.push(JSON.parse(fragment_.format("json")));
		}
	};
	for (const interface_ of [implementationInterface_, ...moduleInterfaces_,]) {
		interface_.forEachFunction(addFragmentIfNew_);
		interface_.forEachEvent(addFragmentIfNew_);
		interface_.forEachError(addFragmentIfNew_);
	}
	return combinedAbiFragments_;
}

// #endregion
// #region `getCosmicSignatureGameV3CombinedAbiContract`

/**
Returns an ethers `Contract` bound to the given V3 Game proxy address with the full combined ABI
of the modular V3 Game. Comment-202608245 applies.
@param {string} cosmicSignatureGameProxyAddress_
@param {import("ethers").Signer | import("ethers").Provider} signerOrProvider_
*/
async function getCosmicSignatureGameV3CombinedAbiContract(cosmicSignatureGameProxyAddress_, signerOrProvider_) {
	// Comment-202409255 applies.
	const hre = HardhatContext.getHardhatContext().environment;

	const combinedAbi_ =
		buildCombinedCosmicSignatureGameV3Abi(
			(await hre.ethers.getContractFactory("CosmicSignatureGameV3")).interface,
			[
				(await hre.ethers.getContractFactory("CosmicSignatureGameAdminModuleV3")).interface,
				(await hre.ethers.getContractFactory("CosmicSignatureGamePrizesModuleV3")).interface,
			]
		);
	return new hre.ethers.Contract(cosmicSignatureGameProxyAddress_, combinedAbi_, signerOrProvider_);
}

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
	deployCosmicSignatureGameV3Modules,
	buildCombinedCosmicSignatureGameV3Abi,
	getCosmicSignatureGameV3CombinedAbiContract,
	setRoundActivationTimeIfNeeded,
};

// #endregion
