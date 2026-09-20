"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const {
	INITIAL_MAIN_PRIZE_TIME_INCREMENT,
	MICROSECONDS_PER_SECOND,
	DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3,
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER,
	DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR,
	DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR,
	ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER,
	DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT,
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
	expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3);
	expect(await game_.cstBidPriceDeclineMultiplier()).equal(INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER);
	expect(await game_.cstBidPriceDeclineMultiplierChangeDivisor()).equal(DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR);
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
The CST Dutch auction price declines to zero, so walking the remaining auction always finds an affordable spot,
unless a nonzero price is required and the affordable window has already fully passed.
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

/**
JS mirror of the V3 `getBidCstRewardAmountAdvanced` linear formula after a bid has been placed.
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
at `cstBidPriceDeclineMultiplier` CST Wei per second, floored at zero.
*/
function getV3CstBidPrice(cstDutchAuctionBeginningBidPrice_, cstDutchAuctionElapsedDuration_, cstBidPriceDeclineMultiplier_) {
	const price_ = cstDutchAuctionBeginningBidPrice_ - cstDutchAuctionElapsedDuration_ * cstBidPriceDeclineMultiplier_;
	return (price_ <= 0n) ? 0n : price_;
}

/** JS mirror of `BiddingV3._getCstDutchAuctionDuration`. */
function getV3CstDutchAuctionDuration(cstDutchAuctionBeginningBidPrice_, cstBidPriceDeclineMultiplier_) {
	return (cstDutchAuctionBeginningBidPrice_ + (cstBidPriceDeclineMultiplier_ - 1n)) / cstBidPriceDeclineMultiplier_;
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
	addRoundLateBidPricePremiumAmountIfNeeded,
	getV3BidCstRewardAmount,
	getV3CstBidPrice,
	getV3CstDutchAuctionDuration,
	tryIncreaseValueExponentially,
	tryReduceValueExponentially,
};
