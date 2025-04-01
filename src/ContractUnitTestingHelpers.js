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
 * It's OK to pass ths function to `loadFixture`.
 * todo-1 Find this function name (not whole word) and make sure the order of desrtructured contracts
 * todo-1 matched their order in the returned object.
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
	// await (await contracts.cosmicSignatureToken.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.randomWalkNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.cosmicSignatureNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.prizesWallet.transferOwnership(ownerAcct.address)).wait();
	// await (await contracts.stakingWalletRandomWalkNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.stakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.marketingWallet.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.charityWallet.transferOwnership(ownerAcct.address)).wait();
	// await (await contracts.cosmicSignatureDao.transferOwnership(ownerAcct.address)).wait();
	// await (await contracts.cosmicSignatureGameImplementation.transferOwnership(ownerAcct.address)).wait();
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
