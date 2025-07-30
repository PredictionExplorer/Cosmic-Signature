// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { parseBooleanEnvironmentVariable, sleepForMilliSeconds } = require("./Helpers.js");
const { MyNonceManager } = require("./MyNonceManager.js");
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

/**
 * @param {bigint} roundActivationTime 
 */
async function loadFixtureDeployContractsForUnitTesting(roundActivationTime) {
	const contracts = await loadFixture(deployContractsForUnitTesting);
	contracts.signers.forEach((signer) => { signer.reset(); });
	contracts.treasurerAcct.reset();
	contracts.charityAcct.reset();
	contracts.ownerAcct.reset();
	contracts.deployerAcct.reset();

	// Comment-202507202 applies.
	if (roundActivationTime > -1_000_000_000n && roundActivationTime < 1_000_000_000n) {

		// [Comment-202507204]
		// Making `setRoundActivationTimeIfNeeded` behavior deterministic.
		// [/Comment-202507204]
		// Since we call this here, a typical test doesn't need to call this
		// immediately after `loadFixtureDeployContractsForUnitTesting` returns,
		// and a quick test doesn't need to call this at all.
		await makeNextBlockTimeDeterministic();
	}

	// Given the issue 2 in Comment-202501193, mining a dummy block.
	await hre.ethers.provider.send("evm_mine");

	// Comment-202507204 relates.
	await setRoundActivationTimeIfNeeded(contracts.cosmicSignatureGameProxy.connect(contracts.ownerAcct), roundActivationTime);

	return contracts;
}

// #endregion
// #region `deployContractsForUnitTesting`

/**
 * This function is to be used for unit tests.
 * It's OK to pass ths function to `loadFixture`.
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
	await storeContractDeployedByteCodeAtAddress("FakeArbSys", "0x0000000000000000000000000000000000000064");
	await storeContractDeployedByteCodeAtAddress("FakeArbGasInfo", "0x000000000000000000000000000000000000006C");
	const deployerAcct = new MyNonceManager(new hre.ethers.Wallet("0xa482f69f1d7e46439c6be45fd58d1281f8fd60bd10b34e91898864e22abf4ee0", hre.ethers.provider));
	const ownerAcct = new MyNonceManager(new hre.ethers.Wallet("0x76ca1febfcbf4447a32f397ba08d768582bb8fce17cc434f8b667c2a4c81ea50", hre.ethers.provider));
	const charityAcct = new MyNonceManager(new hre.ethers.Wallet("0x87cc6d37b7d24b0597513b189ab17da83f85a50f4c01490ba356a8603e646410", hre.ethers.provider));
	const treasurerAcct = new MyNonceManager(new hre.ethers.Wallet("0x6614113dc9574a9987b032f1264af4588924f7f03b9141cca2d0adabe4ee38da", hre.ethers.provider));
	// const signers = await hre.ethers.getSigners();
	const signers = (await hre.ethers.getSigners()).map((signer_) => (new MyNonceManager(signer_)));
	const signerAddressToIndexMapping =
		signers.reduce(
			(accumulator, item, itemIndex) => (accumulator[item.address] = itemIndex, accumulator),
			{}
		);
	const signer17 = signers[17];
	const signer18 = signers[18];
	const signer19 = signers[19];
	const ethAmount = 10n ** 18n;
	await (await signer19.sendTransaction({to: deployerAcct.address, value: ethAmount,})).wait();
	await (await signer18.sendTransaction({to: ownerAcct.address, value: ethAmount,})).wait();
	await (await signer17.sendTransaction({to: treasurerAcct.address, value: ethAmount,})).wait();
	const contracts =
		await deployContractsAdvanced(
			deployerAcct,
			cosmicSignatureGameContractName,
			"",
			charityAcct.address,
			false,
			-1_000_000_000n
		);
	contracts.signerAddressToIndexMapping = signerAddressToIndexMapping;
	contracts.signers = signers;
	contracts.treasurerAcct = treasurerAcct;
	contracts.charityAcct = charityAcct;
	contracts.ownerAcct = ownerAcct;
	contracts.deployerAcct = deployerAcct;
	// await (await contracts.cosmicSignatureToken.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.randomWalkNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.cosmicSignatureNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.prizesWallet.transferOwnership(ownerAcct.address)).wait();
	// await (await contracts.stakingWalletRandomWalkNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.stakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.marketingWallet.setTreasurerAddress(treasurerAcct.address)).wait();
	await (await contracts.marketingWallet.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.charityWallet.transferOwnership(ownerAcct.address)).wait();
	// await (await contracts.cosmicSignatureDao.transferOwnership(ownerAcct.address)).wait();
	// await (await contracts.cosmicSignatureGameImplementation.transferOwnership(ownerAcct.address)).wait();
	await (await contracts.cosmicSignatureGameProxy.transferOwnership(ownerAcct.address)).wait();
	return contracts;
}

// #endregion
// #region `storeContractDeployedByteCodeAtAddress`

/**
 * @param {string} contractName 
 * @param {string} address 
 */
async function storeContractDeployedByteCodeAtAddress(contractName, address) {
	const artifact = await hre.artifacts.readArtifact(contractName);
	await hre.ethers.provider.send("hardhat_setCode", [address, artifact.deployedBytecode,]);
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
 * To (almost) guaranteed that, call this function before mining the last block.
 * @param {number} currentSecondRemainingDurationMinLimitInMilliSeconds
 */
async function makeNextBlockTimeDeterministic(currentSecondRemainingDurationMinLimitInMilliSeconds = 200) {
	const currentDateTime = Date.now();
	const currentSecondElapsedDurationInMilliSeconds = currentDateTime % 1000;
	const currentSecondRemainingDurationInMilliSeconds = 1000 - currentSecondElapsedDurationInMilliSeconds;
	let secondBeginningReachCount;
	if (currentSecondRemainingDurationInMilliSeconds < currentSecondRemainingDurationMinLimitInMilliSeconds) {
		// [Comment-202506264]
		// Telling it to sleep for 1 ms longer because sometimes it sleeps for 1 ms less than requested,
		// possibly due to rounding errors.
		// [/Comment-202506264]
		await sleepForMilliSeconds(currentSecondRemainingDurationInMilliSeconds + 1);

		// console.info(Date.now().toString());
		secondBeginningReachCount = 1;
	} else {
		secondBeginningReachCount = 0;
	}
	return secondBeginningReachCount;
}

// #endregion
// #region `generateRandomUInt256Seed`

/**
 * Comment-202504067 applies.
 * This is the test function that Comment-202504071 mentions.
 * Comment-202506282 applies.
 * Comment-202506284 applies.
 * @param {import("ethers").Block} prevBlock
 * @param {import("ethers").Block} latestBlock
 */
/*async*/ function generateRandomUInt256Seed(prevBlock, latestBlock/*, blockchainPropertyGetter*/) {
	let randomNumberSeed = BigInt(prevBlock.hash) >> 1n;
	{
		const latestBlockBaseFeePerGas = latestBlock.baseFeePerGas;
		if ( ! IS_HARDHAT_COVERAGE ) {
			expect(latestBlockBaseFeePerGas).greaterThan(0n);
		} else {
			expect(latestBlockBaseFeePerGas).equal(0n);
		}
		randomNumberSeed ^= latestBlockBaseFeePerGas << 64n;
	}
	{
		const arbBlockNumber = BigInt(latestBlock.number * 100 - 1);
		const arbBlockHash = arbBlockNumber * 1_000_003n;
		randomNumberSeed ^= arbBlockHash;
	}
	{
		const gasBacklog = BigInt(latestBlock.number * 211);
		randomNumberSeed ^= gasBacklog << (64n * 2n);
	}
	{
		const l1PricingUnitsSinceUpdate = BigInt(latestBlock.number * 307);
		randomNumberSeed ^= l1PricingUnitsSinceUpdate << (64n * 3n);
	}
	expect(randomNumberSeed).equal(BigInt.asUintN(256, randomNumberSeed));
	return randomNumberSeed;
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
	storeContractDeployedByteCodeAtAddress,
	assertAddressIsValid,
	checkTransactionErrorObject,
	assertEvent,
	makeNextBlockTimeDeterministic,
	generateRandomUInt256Seed,
};

// #endregion
