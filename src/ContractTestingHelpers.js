// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { parseBooleanEnvironmentVariable, sleepForMilliSeconds, waitForTransactionReceipt } = require("./Helpers.js");
const { MyNonceManager } = require("./MyNonceManager.js");
const { mochaHooks } = require("./MochaHooks.js");
const { deployContractsAdvanced, setRoundActivationTimeIfNeeded } = require("./ContractDeploymentHelpers.js");

// #endregion
// #region

const SKIP_LONG_TESTS = parseBooleanEnvironmentVariable("SKIP_LONG_TESTS", false);

let preparedHardhatCoverage = false;

// #endregion
// #region // `TransactionRevertedExpectedlyError`

// // [Comment-202508253]
// // This is how we can use this:
// //
// // catch (errorObject) {
// // 	if (errorObject instanceof TransactionRevertedExpectedlyError) {} else {throw errorObject;}
// //
// // We don't currently need this.
// // `checkTransactionErrorObject` is a somewhat similar function.
// // [/Comment-202508253]
//
// class TransactionRevertedExpectedlyError extends Error {
// 	constructor (message_) {
// 		super(message_);
// 	}
// }

// #endregion
// #region `loadFixtureDeployContractsForTesting`

/**
 * @param {bigint} roundActivationTime 
 */
async function loadFixtureDeployContractsForTesting(roundActivationTime) {
	const contracts = await loadFixture(deployContractsForTesting);
	contracts.signers.forEach((signer) => { signer.reset(); });
	contracts.treasurerSigner.reset();
	contracts.charitySigner.reset();
	contracts.ownerSigner.reset();
	contracts.deployerSigner.reset();

	// [Comment-202510198]
	// Doing what Comment-202501193, issue 2, option (3) recommends.
	// [/Comment-202510198]
	{
		// [Comment-202510196/]
		const nextBlockDate = new Date(hre.network.config.initialDate);
		
		nextBlockDate.setUTCFullYear(nextBlockDate.getUTCFullYear() + 10);
		const nextBlockTimeStamp = Math.trunc(nextBlockDate.getTime() / 1000);
		// console.info(nextBlockTimeStamp);

		// Issue. Currently, this doesn't fail due to the new timestamp not being in the future from the latest block.
		// Otherwise we would need a loop adding 10 years and trying on each iteration until succeeded.
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [nextBlockTimeStamp,]);
	}

	// // Comment-202507202 applies.
	// if (roundActivationTime > -1_000_000_000n && roundActivationTime < 1_000_000_000n) {
	//
	// 	// Making the timings of immediate calls to the blockchain more deterministic.
	// 	// Since we call this here, a typical test doesn't need to call this
	// 	// immediately after `loadFixtureDeployContractsForTesting` returns,
	// 	// and a quick test doesn't need to call this at all.
	// 	// But most tests don't need this, so let's not do this.
	// 	await makeNextBlockTimeDeterministic();
	// }

	// Comment-202510198 applies.
	await hre.ethers.provider.send("evm_mine");

	await setRoundActivationTimeIfNeeded(contracts.cosmicSignatureGameProxy.connect(contracts.ownerSigner), roundActivationTime);
	return contracts;
}

// #endregion
// #region `deployContractsForTesting`

/**
 * This function is to be used for unit tests.
 * It's OK to pass this function to `loadFixture`.
 */
async function deployContractsForTesting() {
	return deployContractsForTestingAdvanced("CosmicSignatureGame");
}

// #endregion
// #region `deployContractsForTestingAdvanced`

/**
 * This function is to be used for unit tests.
 * @param {string} cosmicSignatureGameContractName 
 */
async function deployContractsForTestingAdvanced(
	cosmicSignatureGameContractName
) {
	await hackPrepareHardhatCoverageOnceIfNeeded();
	await storeContractDeployedByteCodeAtAddress("FakeArbSys", "0x0000000000000000000000000000000000000064");
	await storeContractDeployedByteCodeAtAddress("FakeArbGasInfo", "0x000000000000000000000000000000000000006C");
	const deployerSigner = new MyNonceManager(new hre.ethers.Wallet("0xa482f69f1d7e46439c6be45fd58d1281f8fd60bd10b34e91898864e22abf4ee0", hre.ethers.provider));
	const ownerSigner = new MyNonceManager(new hre.ethers.Wallet("0x76ca1febfcbf4447a32f397ba08d768582bb8fce17cc434f8b667c2a4c81ea50", hre.ethers.provider));
	const charitySigner = new MyNonceManager(new hre.ethers.Wallet("0x87cc6d37b7d24b0597513b189ab17da83f85a50f4c01490ba356a8603e646410", hre.ethers.provider));
	const treasurerSigner = new MyNonceManager(new hre.ethers.Wallet("0x6614113dc9574a9987b032f1264af4588924f7f03b9141cca2d0adabe4ee38da", hre.ethers.provider));
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
	await waitForTransactionReceipt(signer19.sendTransaction({to: deployerSigner.address, value: ethAmount,}));
	await waitForTransactionReceipt(signer18.sendTransaction({to: ownerSigner.address, value: ethAmount,}));
	await waitForTransactionReceipt(signer17.sendTransaction({to: treasurerSigner.address, value: ethAmount,}));
	const contracts =
		await deployContractsAdvanced(
			deployerSigner,
			cosmicSignatureGameContractName,
			"",
			charitySigner.address,
			false,
			-1_000_000_000n
		);
	contracts.signerAddressToIndexMapping = signerAddressToIndexMapping;
	contracts.signers = signers;
	contracts.treasurerSigner = treasurerSigner;
	contracts.charitySigner = charitySigner;
	contracts.ownerSigner = ownerSigner;
	contracts.deployerSigner = deployerSigner;
	// await waitForTransactionReceipt(contracts.cosmicSignatureToken.transferOwnership(ownerSigner.address));
	await waitForTransactionReceipt(contracts.randomWalkNft.transferOwnership(ownerSigner.address));
	await waitForTransactionReceipt(contracts.cosmicSignatureNft.transferOwnership(ownerSigner.address));
	await waitForTransactionReceipt(contracts.prizesWallet.transferOwnership(ownerSigner.address));
	// await waitForTransactionReceipt(contracts.stakingWalletRandomWalkNft.transferOwnership(ownerSigner.address));
	await waitForTransactionReceipt(contracts.stakingWalletCosmicSignatureNft.transferOwnership(ownerSigner.address));
	await waitForTransactionReceipt(contracts.marketingWallet.setTreasurerAddress(treasurerSigner.address));
	await waitForTransactionReceipt(contracts.marketingWallet.transferOwnership(ownerSigner.address));
	await waitForTransactionReceipt(contracts.charityWallet.transferOwnership(ownerSigner.address));
	// await waitForTransactionReceipt(contracts.cosmicSignatureDao.transferOwnership(ownerSigner.address));
	// await waitForTransactionReceipt(contracts.cosmicSignatureGameImplementation.transferOwnership(ownerSigner.address));
	await waitForTransactionReceipt(contracts.cosmicSignatureGameProxy.transferOwnership(ownerSigner.address));
	return contracts;
}

// #endregion
// #region `hackPrepareHardhatCoverageIfNeeded`

/// [Comment-202508265]
/// Issue. The Hardhat Coverage task ignores parts of Hardhat configuration.
/// This method fixes the issue.
/// The `blockGasLimit` parameter is also ignored, but we are happy with its default value.
/// todo-2 Is the above behavior going to change in a future version of Hardhat? To be revisited.
/// Comment-202505294 relates.
/// Comment-202509185 relates.
/// [/Comment-202508265]
async function hackPrepareHardhatCoverageOnceIfNeeded() {
	// Comment-202508267 applies.
	const gas = 30_000_000;

	if (( ! hre.__SOLIDITY_COVERAGE_RUNNING ) || preparedHardhatCoverage) {
		// console.info("202508262");

		expect(hre.network.config.gas).equal(gas);

		return;
	}
	
	// console.info("202508263");
	preparedHardhatCoverage = true;

	expect(typeof hre.network.config.gas).equal("number");
	expect(hre.network.config.gas).not.equal(gas);
	hre.network.config.gas = gas;

	// This will execute some assertions.
	await mochaHooks.beforeAll();
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
// #region `tryWaitForTransactionReceipt`

/**
 * @param {Promise<import("hardhat").ethers.TransactionResponse>} transactionResponsePromise
 */
async function tryWaitForTransactionReceipt(transactionResponsePromise) {
	try {
		return await waitForTransactionReceipt(transactionResponsePromise);
	} catch (transactionErrorObject) {
		checkTransactionErrorObject(transactionErrorObject);
	}
	return undefined;
}

// #endregion
// #region `checkTransactionErrorObject`

/// Comment-202508253 relates.
function checkTransactionErrorObject(transactionErrorObject) {
	{
		const weExpectThisError = transactionErrorObject.message.startsWith("VM Exception while processing transaction: reverted with ");
		if ( ! weExpectThisError ) {
			throw transactionErrorObject;
		}
	}
	expect(transactionErrorObject.receipt).equal(undefined);
}

// #endregion
// #region `assertEvent`

/**
 * Asserts a `TransactionReceipt.logs` item.
 * @param {import("hardhat").ethers.Log} event
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
 * @param {import("hardhat").ethers.Block} prevBlock
 * @param {import("hardhat").ethers.Block} latestBlock
 */
/*async*/ function generateRandomUInt256Seed(prevBlock, latestBlock/*, blockchainPropertyGetter*/) {
	let randomNumberSeed = BigInt(prevBlock.hash) >> 1n;
	{
		const latestBlockBaseFeePerGas = latestBlock.baseFeePerGas;

		// // Comment-202505294 applies.
		// if ( ! hre.__SOLIDITY_COVERAGE_RUNNING ) {
		// 	expect(latestBlockBaseFeePerGas).greaterThan(0n);
		// } else {
		// 	expect(latestBlockBaseFeePerGas).equal(0n);
		// }

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
	SKIP_LONG_TESTS,
	// TransactionRevertedExpectedlyError,
	loadFixtureDeployContractsForTesting,
	deployContractsForTesting,
	deployContractsForTestingAdvanced,
	storeContractDeployedByteCodeAtAddress,
	assertAddressIsValid,
	tryWaitForTransactionReceipt,
	checkTransactionErrorObject,
	assertEvent,
	makeNextBlockTimeDeterministic,
	generateRandomUInt256Seed,
};

// #endregion
