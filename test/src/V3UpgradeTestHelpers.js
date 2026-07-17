"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const {
	getLatestBlockTimestamp,
	completeRoundZero,
	upgradeToV2,
} = require("./V2UpgradeTestHelpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

// JS mirrors of the V3 `reinitialize` defaults in `CosmicSignatureConstants`.
const INITIAL_ROUND_LATE_BID_DURATION = 20n * 60n;
const DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR =
	(60n * 60n * 1_000_000n + INITIAL_ROUND_LATE_BID_DURATION / 2n) / INITIAL_ROUND_LATE_BID_DURATION;
const ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT = 13n;
const DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER = 3567993n << ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT;
const DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT = 8n;
const DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER = (10n ** 18n * (60n * 60n * 1_000_000n) + 30n) / 60n;
const DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE = 90n;
const DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS = 3n;
const CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_INCREMENT_REWARD_MULTIPLE = 3n;
const CST_DUTCH_AUCTION_DURATION_INCREMENT_MAX_MULTIPLE = 12n;

// `mainPrizeTimeIncrementInMicroSeconds` after `completeRoundZero` (the initial 1 hour, stretched by 1%).
const MAIN_PRIZE_TIME_INCREMENT_US_AFTER_ROUND_ZERO = 3_600n * 1_000_000n + 3_600n * 1_000_000n / 100n;

async function deployV1CompleteRoundZeroAndUpgradeToV2AndV3(roundActivationTime_ = 2n) {
	const contracts_ = await loadFixtureDeployContractsForTesting(roundActivationTime_);
	await completeRoundZero(contracts_);
	await upgradeToV2(contracts_);
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
				call: "reinitialize",
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

async function assertDefaultV3Initialization(game_) {
	expect(await game_.roundLateBidDurationDivisor()).equal(DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR);
	expect(await game_.roundLateBidPricePremiumAmountBaseMultiplier()).equal(DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER);
	expect(await game_.roundLateBidPricePremiumAmountExponent()).equal(DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT);
	expect(await game_.bidCstRewardAmountMultiplier()).equal(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);
	expect(await game_.lastBidderBidCstRewardAmountPercentage()).equal(DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE);
	expect(await game_.mainPrizeNumCosmicSignatureNfts()).equal(DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS);
}

/**
Calculates the `bidCstRewardAmountMultiplier` at which the bid CST reward accrues at exactly
`ratePerMinute_` CST Wei per minute, given the current `mainPrizeTimeIncrementInMicroSeconds`.
The division is exact for any whole-Wei rate as long as the increment is a multiple of 60 microseconds,
which it is in all our test scenarios; the mirror formulas below rely on that exactness.
@param {bigint} ratePerMinute_
@param {bigint} mainPrizeTimeIncrementInMicroSeconds_
*/
function bidCstRewardMultiplierForRatePerMinute(ratePerMinute_, mainPrizeTimeIncrementInMicroSeconds_ = MAIN_PRIZE_TIME_INCREMENT_US_AFTER_ROUND_ZERO) {
	expect(mainPrizeTimeIncrementInMicroSeconds_ % 60n).equal(0n);
	return ratePerMinute_ * (mainPrizeTimeIncrementInMicroSeconds_ / 60n);
}

/**
JS mirror of the V3 CST accrual formula (Comment-202607165), which is both the bid CST reward
(`getBidCstRewardAmountAdvanced`) and the CST bid price decline amount.
@param {bigint} elapsedDuration_ Seconds since the last bid (or the round activation). May be non-positive.
@param {bigint} bidCstRewardAmountMultiplier_
@param {bigint} mainPrizeTimeIncrementInMicroSeconds_
*/
function getV3BidCstRewardAmount(
	elapsedDuration_,
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	mainPrizeTimeIncrementInMicroSeconds_ = MAIN_PRIZE_TIME_INCREMENT_US_AFTER_ROUND_ZERO
) {
	if (elapsedDuration_ <= 0n) {
		return 0n;
	}
	return elapsedDuration_ * bidCstRewardAmountMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_;
}

/**
JS mirror of the V3 CST Dutch auction duration max limit (Comment-202607170): 12 increments, in seconds.
*/
function getV3CstDutchAuctionDurationMaxLimit(mainPrizeTimeIncrementInMicroSeconds_ = MAIN_PRIZE_TIME_INCREMENT_US_AFTER_ROUND_ZERO) {
	return CST_DUTCH_AUCTION_DURATION_INCREMENT_MAX_MULTIPLE * mainPrizeTimeIncrementInMicroSeconds_ / 1_000_000n;
}

/**
JS mirror of the V3 CST Dutch auction base price (Comment-202607165), before the late bid premium:
`max(0, beginningBidPrice - accruedSinceAuctionBeginning)`, or, above the duration cap
(Comment-202607170), the proportionally faster `beginningBidPrice * remaining / maxLimit` decline.
@param {bigint} beginningBidPrice_
@param {bigint} elapsedDuration_ Seconds since the CST Dutch auction beginning. Must be non-negative.
@param {bigint} bidCstRewardAmountMultiplier_
@param {bigint} mainPrizeTimeIncrementInMicroSeconds_
*/
function getV3CstBidPriceBase(
	beginningBidPrice_,
	elapsedDuration_,
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	mainPrizeTimeIncrementInMicroSeconds_ = MAIN_PRIZE_TIME_INCREMENT_US_AFTER_ROUND_ZERO
) {
	expect(elapsedDuration_).greaterThanOrEqual(0n);
	const durationMaxLimit_ = getV3CstDutchAuctionDurationMaxLimit(mainPrizeTimeIncrementInMicroSeconds_);
	if (beginningBidPrice_ > durationMaxLimit_ * bidCstRewardAmountMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_) {
		const remainingDuration_ = durationMaxLimit_ - elapsedDuration_;
		return (remainingDuration_ > 0n) ? (beginningBidPrice_ * remainingDuration_ / durationMaxLimit_) : 0n;
	}
	const declineAmount_ = elapsedDuration_ * bidCstRewardAmountMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_;
	return (declineAmount_ < beginningBidPrice_) ? (beginningBidPrice_ - declineAmount_) : 0n;
}

/**
JS mirror of the V3 emergent CST Dutch auction duration (`_getCstDutchAuctionDuration`):
the exact number of seconds from the auction beginning until the price declines to zero,
capped at 12 increments (Comment-202607170).
*/
function getV3CstDutchAuctionDuration(
	beginningBidPrice_,
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	mainPrizeTimeIncrementInMicroSeconds_ = MAIN_PRIZE_TIME_INCREMENT_US_AFTER_ROUND_ZERO
) {
	if (beginningBidPrice_ === 0n) {
		return 0n;
	}
	const durationMaxLimit_ = getV3CstDutchAuctionDurationMaxLimit(mainPrizeTimeIncrementInMicroSeconds_);
	if (bidCstRewardAmountMultiplier_ === 0n) {
		return durationMaxLimit_;
	}
	const uncappedDuration_ =
		(beginningBidPrice_ * mainPrizeTimeIncrementInMicroSeconds_ + (bidCstRewardAmountMultiplier_ - 1n)) / bidCstRewardAmountMultiplier_;
	return (uncappedDuration_ < durationMaxLimit_) ? uncappedDuration_ : durationMaxLimit_;
}

/**
JS mirror of the V3 derived CST Dutch auction beginning bid price min limit (Comment-202607166):
3 main prize time increments' worth of CST accrual.
*/
function getV3CstDutchAuctionBeginningBidPriceMinLimit(bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER) {
	return CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_INCREMENT_REWARD_MULTIPLE * bidCstRewardAmountMultiplier_ / 1_000_000n;
}

/**
JS mirror of the V3 bid CST reward split (Comment-202607161).
@param {bigint} bidCstRewardAmount_ The total reward.
@param {bigint} lastBidderBidCstRewardAmountPercentage_
@returns {{lastBidderAmount: bigint, newBidderAmount: bigint}}
*/
function splitV3BidCstRewardAmount(bidCstRewardAmount_, lastBidderBidCstRewardAmountPercentage_ = DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE) {
	const lastBidderAmount_ = bidCstRewardAmount_ * lastBidderBidCstRewardAmountPercentage_ / 100n;
	return { lastBidderAmount: lastBidderAmount_, newBidderAmount: bidCstRewardAmount_ - lastBidderAmount_ };
}

/**
Finds a block timestamp, greater than the latest one and at least `minTimeStamp_`, at which the next CST bid price
is at most `maxPrice_` (and, if `requireNonZeroPrice_`, greater than zero).
The CST Dutch auction price declines to zero, so walking the remaining auction always finds an affordable spot,
unless a nonzero price is required and the affordable window has already fully passed.
@returns {Promise<{timeStamp: bigint, price: bigint}>}
*/
async function findTimeStampWithAffordableCstBidPrice(game_, maxPrice_, minTimeStamp_, requireNonZeroPrice_ = false) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();

	// In V3+, the returned duration is emergent (Comment-202607165), so this works both before and after the redesign.
	const [cstDutchAuctionDuration_,] = await game_.getCstDutchAuctionDurations();

	const auctionEndTimeStamp_ = beginningTimeStamp_ + cstDutchAuctionDuration_;
	const numSteps_ = 128n;
	for (let step_ = 0n; step_ <= numSteps_; ++ step_) {
		const candidateTimeStamp_ =
			minTimeStamp_ +
			((auctionEndTimeStamp_ > minTimeStamp_) ? ((auctionEndTimeStamp_ - minTimeStamp_) * step_ / numSteps_) : 0n);
		if (candidateTimeStamp_ <= latestTimeStamp_) {
			continue;
		}
		const price_ = await game_.getNextCstBidPriceAdvanced(candidateTimeStamp_ - latestTimeStamp_);
		if (price_ <= maxPrice_ && ( ! requireNonZeroPrice_ || price_ > 0n)) {
			return { timeStamp: candidateTimeStamp_, price: price_ };
		}
	}
	throw new Error("Found no timestamp with an affordable CST bid price.");
}

/**
JS mirror of `BiddingV3._addRoundLateBidPricePremiumAmountIfNeeded`.
All arguments and the return value are bigints; `durationUntilMainPrize_` may be negative.
The contract body is `unchecked`, but with sane parameters nothing wraps (Comment-202607119).
*/
function addRoundLateBidPricePremiumAmountIfNeeded(
	bidPrice_,
	durationUntilMainPrize_,
	roundLateBidDuration_,
	mainPrizeTimeIncrementInMicroSeconds_,
	roundLateBidPricePremiumAmountBaseMultiplier_ = DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER,
	roundLateBidPricePremiumAmountExponent_ = DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT
) {
	let roundLateBidElapsedDuration_ = roundLateBidDuration_ - durationUntilMainPrize_;
	if (roundLateBidElapsedDuration_ <= 0n) {
		return bidPrice_;
	}
	if (durationUntilMainPrize_ < 0n) {
		roundLateBidElapsedDuration_ = roundLateBidDuration_;
	}
	const premiumAmount_ =
		(
			(roundLateBidElapsedDuration_ * roundLateBidPricePremiumAmountBaseMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_) **
				roundLateBidPricePremiumAmountExponent_ *
			bidPrice_
		) >>
		(roundLateBidPricePremiumAmountExponent_ * ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT);
	return bidPrice_ + premiumAmount_;
}

module.exports = {
	INITIAL_ROUND_LATE_BID_DURATION,
	DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR,
	ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT,
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE,
	DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
	CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_INCREMENT_REWARD_MULTIPLE,
	CST_DUTCH_AUCTION_DURATION_INCREMENT_MAX_MULTIPLE,
	MAIN_PRIZE_TIME_INCREMENT_US_AFTER_ROUND_ZERO,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
	assertDefaultV3Initialization,
	addRoundLateBidPricePremiumAmountIfNeeded,
	bidCstRewardMultiplierForRatePerMinute,
	getV3BidCstRewardAmount,
	getV3CstDutchAuctionDurationMaxLimit,
	getV3CstBidPriceBase,
	getV3CstDutchAuctionDuration,
	getV3CstDutchAuctionBeginningBidPriceMinLimit,
	splitV3BidCstRewardAmount,
	findTimeStampWithAffordableCstBidPrice,
};
