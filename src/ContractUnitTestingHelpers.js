// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsAdvanced, setRoundActivationTimeIfNeeded } = require("./ContractDeploymentHelpers.js");

// #endregion
// #region // `TransactionRevertedExpectedlyError`

// // catch (errorObject) {
// //   if (errorObject instanceof TransactionRevertedExpectedlyError) {} else {throw errorObject;}
//
// class TransactionRevertedExpectedlyError extends Error {
// 	constructor (message_) {
// 	  super(message_);
// 	}
//  }

// #endregion
// #region `loadFixtureDeployContractsForUnitTesting`

/**
 * @param {bigint} roundActivationTime 
 */
async function loadFixtureDeployContractsForUnitTesting(roundActivationTime) {
	const contracts = await loadFixture(deployContractsForUnitTesting);

	// [Comment-202501192]
	// todo-0 Call `loadFixtureDeployContractsForUnitTesting` everywhere.
	// todo-0 After calling it, don't force "evm_mine".
	// todo-0 This comment is currently referenced where we force "evm_mine". Don't reference it any more.
	// todo-0 Then this comment will not need to be numbered.
	//
	// todo-1 Improve this comment. See todos.
	// Issue. `loadFixture` doesn't remove blocks generated after it was called for the first time
	// and/or has some other similar issues.
	// Additionally, near Comment-202501193, HardHat is configured for deterministic mined block timing,
	// but that behavior appears to not work stably.
	// todo-1 Or `interval: 0` has fixed it? (No, it got better, but some tests still fail sometimes.)
	// todo-1 But getting latest block timestamp before executing a non-`view` function still doesn't work correct.
	// todo-1 It can return a block like a minute ago.
	// todo-1 Maybe that's the timestamp after the initil call to `loadFixture`.
	// todo-1 >>> A huge number is a bit better?
	// So this hack appears to make block timestamps more deterministic.
	// [/Comment-202501192]
	await hre.ethers.provider.send("evm_mine");

	// todo-1 Comment better and maybe reference Comment-202501192.
	// todo-1 It would be a bad idea to do this in `deployContractsForUnitTesting` because
	// todo-1 `loadFixture` doesn't restore the current time, so unexpected behavior can ocuur
	// todo-1 if a function called by `loadFixture` uses the latest block timestamp.
	setRoundActivationTimeIfNeeded(contracts.cosmicSignatureGameProxy.connect(contracts.ownerAcct), roundActivationTime);

	return contracts;
}

// #endregion
// #region `deployContractsForUnitTesting`

/**
 * This function is to be used for unit tests.
 * It's OK to pass ths function to `loadFixture`.
 * todo-1 Find this function name (not whole word) and make sure the order of desrtructured contracts
 * todo-1 matched their order in the returned object.
 * todo-1 Or better do not destructure.
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
			-1_000_000_000n
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
// #region `assertAddressIsValid`

/**
 * @param {string} address 
 */
function assertAddressIsValid(address) {
	expect(address !== hre.ethers.ZeroAddress);
	expect(address).properAddress;
}

// #endregion
// #region `checkTransactionErrorObject`

function checkTransactionErrorObject(transactionErrorObject) {
	const weExpectThisError = transactionErrorObject.message.startsWith("VM Exception while processing transaction: reverted with ");
	if ( ! weExpectThisError ) {
		throw transactionErrorObject;
	}
	expect(transactionErrorObject.receipt === undefined);
}

// #endregion
// #region `assertEvent`

/**
 * Asserts a `TransactionReceipt.logs` item.
 * @param {import("ethers").Log} event
 */
function assertEvent(event, contract, eventName, eventArgs) {
	const parsedEvent = contract.interface.parseLog(event);
	expect(parsedEvent.name).equal(eventName);
	expect(parsedEvent.args).deep.equal(eventArgs);
}

// #endregion
// #region `generateRandomUInt256Seed`

/**
 * Issue. This is a workaround for Comment-202504071.
 * Comment-202504067 applies.
 * @returns {Promise<bigint>}
 */
async function generateRandomUInt256Seed(latestBlock, blockchainPropertyGetter) {
	const blockPrevRandao = await blockchainPropertyGetter.getBlockPrevRandao();
	// expect(blockPrevRandao > 0n);
	// todo-0 Somehow `blockchainPropertyGetter.getBlockBaseFeePerGas` returns zero, but `latestBlock.baseFeePerGas` provides the correct value.
	// const blockBaseFeePerGas = await blockchainPropertyGetter.getBlockBaseFeePerGas();
	const blockBaseFeePerGas = latestBlock.baseFeePerGas;
	expect(blockBaseFeePerGas > 0n);
	return blockPrevRandao ^ blockBaseFeePerGas;
}

// #endregion
// #region

module.exports = {
	// TransactionRevertedExpectedlyError,
	loadFixtureDeployContractsForUnitTesting,
	deployContractsForUnitTesting,
	deployContractsForUnitTestingAdvanced,
	assertAddressIsValid,
	checkTransactionErrorObject,
	assertEvent,
	generateRandomUInt256Seed,
};

// #endregion
