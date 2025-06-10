// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { parseBooleanEnvironmentVariable, sleepForMilliSeconds } = require("./Helpers.js");
const { deployContractsAdvanced, setRoundActivationTimeIfNeeded } = require("./ContractDeploymentHelpers.js");

// #endregion
// #region

// Comment-202505294 applies.
const IS_HARDHAT_COVERAGE = parseBooleanEnvironmentVariable("IS_HARDHAT_COVERAGE", false);

const SKIP_LONG_TESTS = parseBooleanEnvironmentVariable("SKIP_LONG_TESTS", false);

// #endregion
// #region // `TransactionRevertedExpectedlyError`

// // catch (errorObject) {
// // 	if (errorObject instanceof TransactionRevertedExpectedlyError) {} else {throw errorObject;}
//
// class TransactionRevertedExpectedlyError extends Error {
// 	constructor (message_) {
// 		super(message_);
// 	}
// }

// #endregion
// #region `loadFixtureDeployContractsForUnitTesting`

// todo-0 Call `loadFixtureDeployContractsForUnitTesting` everywhere.
// todo-0 After calling it, don't force "evm_mine".
/**
 * @param {bigint} roundActivationTime 
 */
async function loadFixtureDeployContractsForUnitTesting(roundActivationTime) {
	const contracts = await loadFixture(deployContractsForUnitTesting);

	// Since we call this here, a typical test doesn't need to call this
	// immediately after `loadFixtureDeployContractsForUnitTesting` returns
	// and a fast test doesn't need to call this at all.
	await makeNextBlockTimeDeterministic();

	// Issue. Given issue 2 in Comment-202501193, mining a dummy block.
	await hre.ethers.provider.send("evm_mine");

	await setRoundActivationTimeIfNeeded(contracts.cosmicSignatureGameProxy.connect(contracts.ownerAcct), roundActivationTime);
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
	expect(address).not.equal(hre.ethers.ZeroAddress);
	expect(address).properAddress;
}

// #endregion
// #region `checkTransactionErrorObject`

function checkTransactionErrorObject(transactionErrorObject) {
	const weExpectThisError = transactionErrorObject.message.startsWith("VM Exception while processing transaction: reverted with ");
	if ( ! weExpectThisError ) {
		throw transactionErrorObject;
	}
	expect(transactionErrorObject.receipt).equal(undefined);
}

// #endregion
// #region `assertEvent`

/**
 * Asserts a `TransactionReceipt.logs` item.
 * @param {import("ethers").Log} event
 */
function assertEvent(event, contract, eventName, eventArgs) {
	// Issue. Is this parsing really necessary?
	// Near Comment-202506051, we get by without it.
	// todo-0 Revisit the above.
	const parsedEvent = contract.interface.parseLog(event);

	expect(parsedEvent.name).equal(eventName);
	expect(parsedEvent.args).deep.equal(eventArgs);
}

// #endregion
// #region `makeNextBlockTimeDeterministic`

/**
 * This function does what issue 3 in Comment-202501193 recommends.
 * A simple way to use this function is to subtract its return value
 * from the value to be passed to the "evm_increaseTime" JSON RPC method.
 * But it's correct to do so only if the last block was mined within the current, possibly ending second.
 * To (almost) guaranteed that, call this function before mining the previous block.
 * @param {number} currentSecondRemainingDurationMinLimitInMilliSeconds
 */
async function makeNextBlockTimeDeterministic(currentSecondRemainingDurationMinLimitInMilliSeconds = 200) {
	const currentDateTime = Date.now();
	const currentSecondElapsedDurationInMilliSeconds = currentDateTime % 1000;
	const currentSecondRemainingDurationInMilliSeconds = 1000 - currentSecondElapsedDurationInMilliSeconds;
	if (currentSecondRemainingDurationInMilliSeconds >= currentSecondRemainingDurationMinLimitInMilliSeconds) {
		return 0;
	}

	// Telling it to sleep for 1 ms longer because sometimes it sleeps for 1 ms less than requested,
	// possibly due to rounding errors.
	await sleepForMilliSeconds(currentSecondRemainingDurationInMilliSeconds + 1);

	// console.info(Date.now().toString());
	return 1;
}

// #endregion
// #region `generateRandomUInt256Seed`

/**
 * Comment-202504067 applies.
 * Comment-202505293 applies.
 * @returns {Promise<bigint>}
 */
async function generateRandomUInt256Seed(latestBlock, blockchainPropertyGetter) {
	const latestBlockPrevRandao = await blockchainPropertyGetter.getBlockPrevRandao();

	// // This has already been asserted in Solidity.
	// expect(latestBlockPrevRandao).greaterThanOrEqual(2n);

	const latestBlockBaseFeePerGas = latestBlock.baseFeePerGas;
	if ( ! IS_HARDHAT_COVERAGE ) {
		expect(latestBlockBaseFeePerGas).greaterThan(0n);
	} else {
		expect(latestBlockBaseFeePerGas).equal(0n);
	}
	return latestBlockPrevRandao ^ latestBlockBaseFeePerGas;
}

// #endregion
// #region

module.exports = {
	IS_HARDHAT_COVERAGE,
	SKIP_LONG_TESTS,
	// TransactionRevertedExpectedlyError,
	loadFixtureDeployContractsForUnitTesting,
	deployContractsForUnitTesting,
	deployContractsForUnitTestingAdvanced,
	assertAddressIsValid,
	checkTransactionErrorObject,
	assertEvent,
	makeNextBlockTimeDeterministic,
	generateRandomUInt256Seed,
};

// #endregion
