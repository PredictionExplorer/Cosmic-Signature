"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

const INITIAL_CST_DUTCH_AUCTION_DURATION = 12n * 60n * 60n;
const DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR = 250n;
const DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER = 10800000000000000000000000000000000000000000000n;
const DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2 = 2n * 24n * 60n * 60n;
const TIMESTAMP_9000_01_01 = 221845392000n;

async function mineAt(timestamp_) {
	const latest_ = await getLatestBlockTimestamp();
	// todo-ai-1 If `timestamp_` is not in the future maybe do nothing.
	// todo-ai-1 Then rename `mineAt` to `mineAtIfNeeded` or `setNextBlockTimeToAtLeast`.
	// todo-ai-1 Alternatively, throw if `timestamp_` is not in the future.
	const adjustedTimestamp_ = timestamp_ > latest_ ? timestamp_ : (latest_ + 1n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(adjustedTimestamp_)]);
	await hre.ethers.provider.send("evm_mine");
}

// todo-ai-1 There is already a similar function, named `getBlockTimeStampByBlockNumber`. You can import and use it.
async function getLatestBlockTimestamp() {
	const block_ = await hre.ethers.provider.getBlock("latest");
	return BigInt(block_.timestamp);
}

async function completeRoundZero(contracts_, bidderIndex_ = 1) {
	const bidder_ = contracts_.signers[bidderIndex_];
	await waitForTransactionReceipt(
		contracts_.cosmicSignatureGameProxy.connect(bidder_).bidWithEth(-1n, "", { value: 10n ** 18n })
	);
	const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
	// todo-ai-1 In cases like this, it's unnecessary to mine. It's sufficient to only execute `evm_setNextBlockTimestamp`.
	await mineAt(mainPrizeTime_);
	const receipt_ = await waitForTransactionReceipt(
		contracts_.cosmicSignatureGameProxy.connect(bidder_).claimMainPrize()
	);
	expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(1n);
	expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
	return { bidder_, receipt_, mainPrizeTime_ };
}

async function deployV1CompleteRoundZeroAndUpgradeToV2(roundActivationTime_ = 2n) {
	const contracts_ = await loadFixtureDeployContractsForTesting(roundActivationTime_);
	await completeRoundZero(contracts_);
	return await upgradeToV2(contracts_);
}

async function upgradeToV2(contracts_, upgradeOptions_ = {}) {
	const cosmicSignatureGameV2Factory_ =
		await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
	const prevImplementationAddress_ =
		await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
	const cosmicSignatureGameV2Proxy_ =
		await hre.upgrades.upgradeProxy(
			contracts_.cosmicSignatureGameProxy,
			cosmicSignatureGameV2Factory_,
			{
				kind: "uups",
				call: "initializeV2",
				...upgradeOptions_,
			}
		);
	const cosmicSignatureGameV2ImplementationAddress_ =
		await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
	expect(cosmicSignatureGameV2ImplementationAddress_).not.equal(prevImplementationAddress_);
	contracts_.cosmicSignatureGameV2Factory = cosmicSignatureGameV2Factory_;
	contracts_.cosmicSignatureGameV2Proxy = cosmicSignatureGameV2Proxy_;
	contracts_.cosmicSignatureGameV2ImplementationAddress = cosmicSignatureGameV2ImplementationAddress_;
	// todo-ai-1 Unnecessary to return this?
	return contracts_;
}

// todo-ai-1 Do we really need this function. Can we use the existing `setRoundActivationTimeIfNeeded` instead?
async function activateCurrentRound(game_, ownerSigner_) {
	const now_ = await getLatestBlockTimestamp();
	const activationTime_ = now_ + 2n;
	await waitForTransactionReceipt(game_.connect(ownerSigner_).setRoundActivationTime(activationTime_));
	// todo-ai-1 `evm_mine` is often unnecessary.
	// todo-ai-1 This makes it impossible to mine the next transaction exactly at `roundActivationTime`.
	// todo-ai-1 It will be mined at `roundActivationTime + 1`.
	// todo-ai-1 So maybe pass `activationTime_ - 1` to `mineAt`.
	// todo-ai-1 The same consideration applies in multiple places in the codebase.
	await mineAt(activationTime_);
}

async function assertDefaultV2Initialization(game_) {
	expect(await game_.cstDutchAuctionDuration()).equal(INITIAL_CST_DUTCH_AUCTION_DURATION);
	expect(await game_.cstDutchAuctionDurationChangeDivisor()).equal(DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR);
	expect(await game_.bidCstRewardAmountMultiplier()).equal(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);
	expect(await game_.timeoutDurationToClaimMainPrize()).equal(DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2);
}

function findParsedEvent(receipt_, contract_, eventName_) {
	for (const log_ of receipt_.logs) {
		try {
			const parsed_ = contract_.interface.parseLog(log_);
			if (parsed_?.name === eventName_) {
				return parsed_;
			}
		} catch {
			// Ignore logs belonging to other contracts.
		}
	}
	return undefined;
}

// todo-ai-1 Will this work correct if a method with the given selector exists, but has some params?
async function expectUnknownSelector(contract_, selector_) {
	await expect(
		hre.ethers.provider.call({
			to: await contract_.getAddress(),
			data: selector_,
		})
	).revertedWithoutReason();
}

module.exports = {
	INITIAL_CST_DUTCH_AUCTION_DURATION,
	DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR,
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2,
	TIMESTAMP_9000_01_01,
	mineAt,
	getLatestBlockTimestamp,
	completeRoundZero,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	upgradeToV2,
	activateCurrentRound,
	assertDefaultV2Initialization,
	findParsedEvent,
	expectUnknownSelector,
};
