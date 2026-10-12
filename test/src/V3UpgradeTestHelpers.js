"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { MAX_UINT256 } = require("../../src/BigIntMathHelpers.js");
const {
	INITIAL_MAIN_PRIZE_TIME_INCREMENT,
	MICROSECONDS_PER_SECOND,
	CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER,
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR,
	ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT,
	DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR,
	DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3,
	DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3,
	DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
	DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3,
} = require("../../src/CosmicSignatureConstants.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { completeRoundZero, upgradeToV2, getLatestBlockTimestamp } = require("./V2UpgradeTestHelpers.js");

const DEFAULT_PAID_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 = 50n;

async function deployV1CompleteRoundZeroAndUpgradeToV2AndV3() {
	const contracts_ = { ...await loadFixtureDeployContractsForTesting(2n) };
	await completeRoundZero(contracts_);
	await upgradeToV2(contracts_);
	await upgradeToV3(contracts_);
	return contracts_;
}

// `contracts_` must be a mutable, test-local copy, not the frozen fixture object.
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
	expect(await game_.mainPrizeNumCosmicSignatureNfts()).equal(DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS);
	expect(await game_.mainEthPrizeAmountPercentage()).equal(DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3);
	expect(await game_.charityEthDonationAmountPercentage()).equal(DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3);
	expect(await game_.raffleTotalEthPrizeAmountForBiddersPercentage()).equal(DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3);
	expect(await game_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).equal(DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3);
	expect(await game_.chronoWarriorEthPrizeAmountPercentage()).equal(DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3);
	expect(
		(await game_.mainEthPrizeAmountPercentage()) +
		(await game_.charityEthDonationAmountPercentage()) +
		(await game_.raffleTotalEthPrizeAmountForBiddersPercentage()) +
		(await game_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()) +
		(await game_.chronoWarriorEthPrizeAmountPercentage())
	).equal(DEFAULT_PAID_ETH_PRIZE_AMOUNT_PERCENTAGE_V3);
}

/**
Finds a block timestamp, greater than the latest one and at least `minTimeStamp_`, at which the next CST bid price
is at most `maxPrice_` (and, if `requireNonZeroPrice_`, greater than zero).
Samples the remaining auction through its zero-price endpoint. If a nonzero price is required,
a narrow affordable window may fall between samples or may already have passed.
@returns {Promise<{timeStamp: bigint, price: bigint}>}
*/
async function findTimeStampWithAffordableCstBidPrice(game_, maxPrice_, minTimeStamp_, requireNonZeroPrice_ = false) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
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
JS mirror of `BiddingV3._getRoundLateBidPricePremiumAmountIfNeeded`: the late-bid premium amount
calculated from `premiumBase_`, assuming a bid has already been placed in the current round.
All arguments and the return value are bigints; `durationUntilMainPrize_` may be negative.
The contract body is `unchecked`, but with sane parameters nothing wraps (Comment-202607119).
*/
function getRoundLateBidPricePremiumAmount(
	premiumBase_,
	durationUntilMainPrize_,
	roundLateBidDuration_,
	mainPrizeTimeIncrementInMicroSeconds_,
	roundLateBidPricePremiumAmountBaseMultiplier_ = DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER,
	roundLateBidPricePremiumAmountExponent_ = DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT
) {
	let roundLateBidElapsedDuration_ = roundLateBidDuration_ - durationUntilMainPrize_;
	if (roundLateBidElapsedDuration_ <= 0n) {
		return 0n;
	}
	if (durationUntilMainPrize_ < 0n) {
		roundLateBidElapsedDuration_ = roundLateBidDuration_;
	}
	return (
		(roundLateBidElapsedDuration_ * roundLateBidPricePremiumAmountBaseMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_) **
			roundLateBidPricePremiumAmountExponent_ *
		premiumBase_
	) >>
	(roundLateBidPricePremiumAmountExponent_ * ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT);
}

/**
JS mirror of the V3 ETH bid price with the late-bid premium: `ethBidPriceBase_` plus the premium calculated from it.
Arguments after the first one are the same as in `getRoundLateBidPricePremiumAmount`.
*/
function addRoundLateBidPricePremiumAmountIfNeeded(ethBidPriceBase_, ...premiumArgs_) {
	return ethBidPriceBase_ + getRoundLateBidPricePremiumAmount(ethBidPriceBase_, ...premiumArgs_);
}

/**
JS mirror of the V3 bid CST reward for holding the last bidder position for `elapsedDuration_` seconds
(`BiddingV3._getBidCstRewardAmountForDuration`). Also the amount by which the CST bid price base declines
over the same duration (Comment-202611023).
@param {bigint} elapsedDuration_ May be non-positive.
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
JS mirror of `BiddingV3._getBidCstRewardAmountPerMainPrizeTimeIncrement`:
the bid CST reward for holding the last bidder position during one main prize time increment.
*/
function getV3BidCstRewardAmountPerMainPrizeTimeIncrement(bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER) {
	return bidCstRewardAmountMultiplier_ / MICROSECONDS_PER_SECOND;
}

/**
JS mirror of `BiddingV3._getCstDutchAuctionBeginningBidPriceMaxLimit`:
the bid CST reward of the initial duration until main prize, at which every round's first CST Dutch auction begins
and above which no CST Dutch auction begins (Comment-202611025).
*/
function getV3CstDutchAuctionBeginningBidPriceMaxLimit(
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	initialDurationUntilMainPrizeDivisor_ = DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR
) {
	return bidCstRewardAmountMultiplier_ / initialDurationUntilMainPrizeDivisor_;
}

/**
JS mirror of the price the next CST Dutch auction begins at after a CST bid whose price base was `cstBidPriceBase_`
(Comment-202611024).
*/
function getV3NewCstDutchAuctionBeginningBidPrice(
	cstBidPriceBase_,
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	initialDurationUntilMainPrizeDivisor_ = DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR
) {
	const uncapped_ =
		(cstBidPriceBase_ + getV3BidCstRewardAmountPerMainPrizeTimeIncrement(bidCstRewardAmountMultiplier_)) *
		CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
	const maxLimit_ = getV3CstDutchAuctionBeginningBidPriceMaxLimit(bidCstRewardAmountMultiplier_, initialDurationUntilMainPrizeDivisor_);
	return (uncapped_ < maxLimit_) ? uncapped_ : maxLimit_;
}

/**
JS mirror of the premium-free V3 CST bid price (`BiddingV3._getNextCstBidPriceBaseAdvanced`):
the beginning bid price minus the bid CST reward of the elapsed duration, floored at zero (Comment-202611023).
@param {bigint} cstDutchAuctionElapsedDuration_ May be negative.
*/
function getV3CstBidPriceBase(
	cstDutchAuctionBeginningBidPrice_,
	cstDutchAuctionElapsedDuration_,
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	mainPrizeTimeIncrementInMicroSeconds_ = INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND
) {
	const declineAmount_ = getV3BidCstRewardAmount(cstDutchAuctionElapsedDuration_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_);
	return (cstDutchAuctionBeginningBidPrice_ > declineAmount_) ? (cstDutchAuctionBeginningBidPrice_ - declineAmount_) : 0n;
}

/**
JS mirror of the V3 CST bid price with the late-bid premium: `cstBidPriceBase_` plus the premium calculated from
the greater of the base and one main prize time increment of bid CST reward (Comment-202611026).
`premiumArgs_` are the same as the arguments of `getRoundLateBidPricePremiumAmount` after the first one.
*/
function addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded(cstBidPriceBase_, bidCstRewardAmountMultiplier_, ...premiumArgs_) {
	const perIncrement_ = getV3BidCstRewardAmountPerMainPrizeTimeIncrement(bidCstRewardAmountMultiplier_);
	const premiumBase_ = (cstBidPriceBase_ > perIncrement_) ? cstBidPriceBase_ : perIncrement_;
	return cstBidPriceBase_ + getRoundLateBidPricePremiumAmount(premiumBase_, ...premiumArgs_);
}

/** JS mirror of `BiddingV3._getCstDutchAuctionDuration`: the duration until the CST bid price base reaches zero. */
function getV3CstDutchAuctionDuration(
	cstDutchAuctionBeginningBidPrice_,
	bidCstRewardAmountMultiplier_ = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	mainPrizeTimeIncrementInMicroSeconds_ = INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND
) {
	if (bidCstRewardAmountMultiplier_ <= 0n) {
		return MAX_UINT256;
	}
	return (cstDutchAuctionBeginningBidPrice_ * mainPrizeTimeIncrementInMicroSeconds_ + (bidCstRewardAmountMultiplier_ - 1n)) / bidCstRewardAmountMultiplier_;
}

/** JS mirror of the V3 CST bid raffle weight (Comment-202611027). */
function getV3CstBidRaffleWeight(ethBidPriceBase_, cstBidPriceBase_, cstDutchAuctionBeginningBidPrice_) {
	return (cstDutchAuctionBeginningBidPrice_ > 0n) ? (ethBidPriceBase_ * cstBidPriceBase_ / cstDutchAuctionBeginningBidPrice_) : 0n;
}

/** Comment-202606059 applies. */
function tryIncreaseValueExponentially(value_, divisor_) {
	return value_ + value_ / divisor_;
}

/** Comment-202606059 applies. */
function tryReduceValueExponentially(value_, divisor_) {
	return (value_ + 1n) * divisor_ / (divisor_ + 1n);
}

module.exports = {
	DEFAULT_PAID_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
	assertDefaultV3Initialization,
	findTimeStampWithAffordableCstBidPrice,
	getRoundLateBidPricePremiumAmount,
	addRoundLateBidPricePremiumAmountIfNeeded,
	getV3BidCstRewardAmount,
	getV3BidCstRewardAmountPerMainPrizeTimeIncrement,
	getV3CstDutchAuctionBeginningBidPriceMaxLimit,
	getV3NewCstDutchAuctionBeginningBidPrice,
	getV3CstBidPriceBase,
	addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded,
	getV3CstDutchAuctionDuration,
	getV3CstBidRaffleWeight,
	tryIncreaseValueExponentially,
	tryReduceValueExponentially,
};
