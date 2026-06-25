"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	activateCurrentRound,
	blockTimestampOfReceipt,
	completeRoundZero,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	expectUnknownSelector,
	findParsedEvent,
	getLatestBlockTimestamp,
	mineAtOrAfter,
	setNextBlockTimeToAtLeast,
	upgradeToV2,
} = require("./V2UpgradeTestHelpers.js");

const LATE_ROUND_BID_PRICE_INCREASE_DURATION = 20n * 60n;
const LATE_ROUND_BID_PRICE_INCREASE_PREMIUM_MULTIPLIER = 9n;
const LATE_ROUND_BID_PRICE_INCREASE_DENOMINATOR = 4_299_816_960_000_000_000_000_000n;

async function deployV1CompleteRoundZeroUpgradeToV2AndV3(roundActivationTime_ = 2n) {
	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(roundActivationTime_);
	await upgradeToV3(contracts_);
	return contracts_;
}

async function upgradeToV3(contracts_, upgradeOptions_ = {}) {
	const cosmicSignatureGameV3Factory_ =
		await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
	const prevImplementationAddress_ =
		await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
	const cosmicSignatureGameV3Proxy_ =
		await hre.upgrades.upgradeProxy(
			contracts_.cosmicSignatureGameProxy,
			cosmicSignatureGameV3Factory_,
			{
				kind: "uups",
				call: "initializeV3",
				...upgradeOptions_,
			}
		);
	const cosmicSignatureGameV3ImplementationAddress_ =
		await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
	expect(cosmicSignatureGameV3ImplementationAddress_).not.equal(prevImplementationAddress_);
	contracts_.cosmicSignatureGameV3Factory = cosmicSignatureGameV3Factory_;
	contracts_.cosmicSignatureGameV3Proxy = cosmicSignatureGameV3Proxy_;
	contracts_.cosmicSignatureGameV3ImplementationAddress = cosmicSignatureGameV3ImplementationAddress_;
}

function secondsTo8thPower(seconds_) {
	const seconds2_ = seconds_ * seconds_;
	const seconds4_ = seconds2_ * seconds2_;
	return seconds4_ * seconds4_;
}

function lateRoundElapsedFromRemaining(remainingSeconds_) {
	if (remainingSeconds_ >= LATE_ROUND_BID_PRICE_INCREASE_DURATION) {
		return 0n;
	}
	if (remainingSeconds_ <= 0n) {
		return LATE_ROUND_BID_PRICE_INCREASE_DURATION;
	}
	return LATE_ROUND_BID_PRICE_INCREASE_DURATION - remainingSeconds_;
}

function applyLateRoundBidPriceIncrease(basePrice_, elapsedSeconds_) {
	const clampedElapsedSeconds_ =
		(elapsedSeconds_ >= LATE_ROUND_BID_PRICE_INCREASE_DURATION) ?
		LATE_ROUND_BID_PRICE_INCREASE_DURATION :
		elapsedSeconds_;
	const premiumAmount_ =
		basePrice_ *
		LATE_ROUND_BID_PRICE_INCREASE_PREMIUM_MULTIPLIER *
		secondsTo8thPower(clampedElapsedSeconds_) /
		LATE_ROUND_BID_PRICE_INCREASE_DENOMINATOR;
	return basePrice_ + premiumAmount_;
}

async function mineAtLateRoundElapsed(game_, elapsedSeconds_) {
	const mainPrizeTime_ = await game_.mainPrizeTime();
	const remainingSeconds_ =
		(elapsedSeconds_ >= LATE_ROUND_BID_PRICE_INCREASE_DURATION) ?
		0n :
		(LATE_ROUND_BID_PRICE_INCREASE_DURATION - elapsedSeconds_);
	await mineAtOrAfter(mainPrizeTime_ - remainingSeconds_);
}

async function loadFixtureDeployV3ForTesting(roundActivationTime_ = 2n) {
	const contracts_ = await loadFixtureDeployContractsForTesting(roundActivationTime_);
	await completeRoundZero(contracts_);
	await upgradeToV2(contracts_);
	await upgradeToV3(contracts_);
	return contracts_;
}

module.exports = {
	LATE_ROUND_BID_PRICE_INCREASE_DENOMINATOR,
	LATE_ROUND_BID_PRICE_INCREASE_DURATION,
	LATE_ROUND_BID_PRICE_INCREASE_PREMIUM_MULTIPLIER,
	activateCurrentRound,
	applyLateRoundBidPriceIncrease,
	blockTimestampOfReceipt,
	completeRoundZero,
	deployV1CompleteRoundZeroUpgradeToV2AndV3,
	expectUnknownSelector,
	findParsedEvent,
	getLatestBlockTimestamp,
	lateRoundElapsedFromRemaining,
	loadFixtureDeployV3ForTesting,
	mineAtLateRoundElapsed,
	mineAtOrAfter,
	secondsTo8thPower,
	setNextBlockTimeToAtLeast,
	upgradeToV2,
	upgradeToV3,
};
