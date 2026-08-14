"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const {
	getLatestBlockTimestamp,
	completeRoundZero,
	upgradeToV2,
} = require("./V2UpgradeTestHelpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

// #region JS mirrors of the V3 `reinitialize` defaults in `CosmicSignatureConstants`.

const MICROSECONDS_PER_SECOND = 1_000_000n;
const INITIAL_MAIN_PRIZE_TIME_INCREMENT = 60n * 60n;
const INITIAL_ROUND_LATE_BID_DURATION = 20n * 60n;
const DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR =
	(INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND + INITIAL_ROUND_LATE_BID_DURATION / 2n) / INITIAL_ROUND_LATE_BID_DURATION;
const ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT = 13n;
const DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER = 3567993n << ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT;
const DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT = 8n;
const INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE = 10n ** 18n;

// `(1 CST per minute) * mainPrizeTimeIncrementInMicroSeconds`, expressed per second.
// The reward formula is `elapsedDuration * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds`,
// so with the INITIAL (not yet exponentially increased) main prize time increment the reward accrues
// at exactly 1 CST per minute; in later bidding rounds slightly slower.
const DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER =
	(INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE * INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND + 60n / 2n) / 60n;

const DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3 = INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE;
const INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER =
	(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER + INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND / 2n) /
	(INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND);
const DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR = 100n;
const DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS = 3n;

// #endregion
// #region Deployment / upgrade helpers.

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

/** Asserts every parameter the V3 `reinitialize` sets, at its default. */
async function assertDefaultV3Initialization(game_) {
	expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3);
	expect(await game_.cstBidPriceDeclineMultiplier()).equal(INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER);
	expect(await game_.cstBidPriceDeclineMultiplierChangeDivisor()).equal(DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR);
	expect(await game_.roundLateBidDurationDivisor()).equal(DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR);
	expect(await game_.roundLateBidPricePremiumAmountBaseMultiplier()).equal(DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER);
	expect(await game_.roundLateBidPricePremiumAmountExponent()).equal(DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT);
	expect(await game_.bidCstRewardAmountMultiplier()).equal(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);
	expect(await game_.mainPrizeNumCosmicSignatureNfts()).equal(DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS);
}

// #endregion
// #region JS mirrors of the V3 formulas.

/**
JS mirror of the V3 `getBidCstRewardAmountAdvanced` linear formula (with a bid already placed
in the current bidding round; with no bids the on-chain getter returns zero, Comment-202608176).
In V3+, the whole reward is minted to the previous bidder; nothing is minted on the first bid in a round.
@param {bigint} elapsedDuration_ Seconds since the last bid. May be non-positive.
@param {bigint} bidCstRewardAmountMultiplier_
@param {bigint} mainPrizeTimeIncrementInMicroSeconds_
*/
function getV3BidCstRewardAmount(
	elapsedDuration_,
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	mainPrizeTimeIncrementInMicroSeconds_ = INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND
) {
	if (elapsedDuration_ <= 0n) {
		return 0n;
	}
	return elapsedDuration_ * bidCstRewardAmountMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_;
}

/**
JS mirror of the premium-free V3 CST bid price: a linear decline from the beginning bid price
at `cstBidPriceDeclineMultiplier` CST Wei per second, floored at zero
(`BiddingV3.getNextCstBidPriceAdvanced`).
@param {bigint} cstDutchAuctionBeginningBidPrice_
@param {bigint} cstDutchAuctionElapsedDuration_ May be negative.
@param {bigint} cstBidPriceDeclineMultiplier_
*/
function getV3CstBidPrice(cstDutchAuctionBeginningBidPrice_, cstDutchAuctionElapsedDuration_, cstBidPriceDeclineMultiplier_) {
	const price_ = cstDutchAuctionBeginningBidPrice_ - cstDutchAuctionElapsedDuration_ * cstBidPriceDeclineMultiplier_;
	return (price_ <= 0n) ? 0n : price_;
}

/**
JS mirror of `BiddingV3._getCstDutchAuctionDuration`: the duration in which the CST bid price
declines from the beginning bid price to zero.
*/
function getV3CstDutchAuctionDuration(cstDutchAuctionBeginningBidPrice_, cstBidPriceDeclineMultiplier_) {
	return (cstDutchAuctionBeginningBidPrice_ + (cstBidPriceDeclineMultiplier_ - 1n)) / cstBidPriceDeclineMultiplier_;
}

/** JS mirror of `CosmicSignatureHelpers.tryIncreaseValueExponentially` (an ETH bid increases the decline multiplier). */
function tryIncreaseValueExponentially(value_, divisor_) {
	return value_ + value_ / divisor_;
}

/** JS mirror of `CosmicSignatureHelpers.tryReduceValueExponentially` (a CST bid reduces the decline multiplier). */
function tryReduceValueExponentially(value_, divisor_) {
	return (value_ + 1n) * divisor_ / (divisor_ + 1n);
}

/**
Finds a block timestamp, greater than the latest one and at least `minTimeStamp_`, at which the next CST bid price
is at most `maxPrice_` (and, if `requireNonZeroPrice_`, greater than zero).
The CST bid price declines to zero, so walking the remaining decline always finds an affordable spot,
unless a nonzero price is required and the affordable window has already fully passed.
@returns {Promise<{timeStamp: bigint, price: bigint}>}
*/
async function findTimeStampWithAffordableCstBidPrice(game_, maxPrice_, minTimeStamp_, requireNonZeroPrice_ = false) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();

	// In V3, `getCstDutchAuctionDurations` derives the duration from the beginning bid price
	// and `cstBidPriceDeclineMultiplier`.
	const auctionEndTimeStamp_ = beginningTimeStamp_ + (await game_.getCstDutchAuctionDurations())[0];

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

// #endregion

module.exports = {
	MICROSECONDS_PER_SECOND,
	INITIAL_MAIN_PRIZE_TIME_INCREMENT,
	INITIAL_ROUND_LATE_BID_DURATION,
	DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR,
	ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT,
	INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE,
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3,
	INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER,
	DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR,
	DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
	assertDefaultV3Initialization,
	addRoundLateBidPricePremiumAmountIfNeeded,
	getV3BidCstRewardAmount,
	getV3CstBidPrice,
	getV3CstDutchAuctionDuration,
	tryIncreaseValueExponentially,
	tryReduceValueExponentially,
	findTimeStampWithAffordableCstBidPrice,
};
