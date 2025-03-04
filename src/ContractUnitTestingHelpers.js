// #region

"use strict";

// #endregion
// #region

const hre = require("hardhat");
const { deployContractsAdvanced } = require("./ContractDeploymentHelpers.js");

// #endregion
// #region `deployContractsForUnitTesting`

/**
 * This function is to be used for unit tests.
 * It's OK to pass ths function to to `loadFixture`.
 */
async function deployContractsForUnitTesting() {
	return deployContractsForUnitTestingAdvanced("CosmicSignatureGame");
}

// #endregion
// #region `deployContractsForUnitTestingAdvanced`

/**
 * This function is to be used for unit tests.
 * @param {string} cosmicSignatureGameContractName 
 */
async function deployContractsForUnitTestingAdvanced(
	cosmicSignatureGameContractName
) {
	const deployerAcct = hre.ethers.Wallet.createRandom(hre.ethers.provider);
	const ownerAcct = hre.ethers.Wallet.createRandom(hre.ethers.provider);
	const charityAcct = hre.ethers.Wallet.createRandom(hre.ethers.provider);
	const signers = await hre.ethers.getSigners();
	const signer18 = signers[18];
	const signer19 = signers[19];
	const ethAmount = 10n ** 18n;
	await (await signer18.sendTransaction({to: deployerAcct.address, value: ethAmount,})).wait();
	await (await signer19.sendTransaction({to: ownerAcct.address, value: ethAmount,})).wait();
	const contracts =
		await deployContractsAdvanced(
			deployerAcct,
			cosmicSignatureGameContractName,
			"",
			charityAcct.address,
			false,
			1
		);
	contracts.signers = signers;
	contracts.charityAcct = charityAcct;
	contracts.ownerAcct = ownerAcct;
	contracts.deployerAcct = deployerAcct;
	// todo-1 Reorder these calls better?
	// todo-1 Is this now going to become `Ownable`? Maybe not.
	// await (await contracts.cosmicSignatureToken.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.randomWalkNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.cosmicSignatureNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.charityWallet.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.marketingWallet.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.prizesWallet.transferOwnership(ownerAcct.address)).wait();
	// todo-1 Is this now going to become `Ownable`? Maybe not.
	// await (await contracts.stakingWalletRandomWalkNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.stakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address)).wait();
	// todo-1 Is this now going to become `Ownable`? Maybe not.
	// await (await contracts.cosmicSignatureDao.transferOwnership(ownerAcct.address)).wait();
	// await (await contracts.cosmicSignatureGameImplementationAddr.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.cosmicSignatureGameProxy.transferOwnership(ownerAcct.address)).wait();
	return contracts;
}

// #endregion
// #region

module.exports = {
	deployContractsForUnitTesting,
	deployContractsForUnitTestingAdvanced,
};

// #endregion
