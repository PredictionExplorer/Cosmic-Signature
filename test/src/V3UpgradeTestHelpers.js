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
const INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE = 10n ** 18n;
const DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE = 90n;
const DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS = 3n;

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
	expect(await game_.bidCstRewardAmountPerMinute()).equal(INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE);
	expect(await game_.mainPrizeNumCosmicSignatureNfts()).equal(DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS);
}

/**
JS mirror of the V3 `getBidCstRewardAmountAdvanced` linear formula.
@param {bigint} elapsedDuration_ Seconds since the last bid (or the round activation). May be non-positive.
@param {bigint} bidCstRewardAmountPerMinute_
*/
function getV3BidCstRewardAmount(elapsedDuration_, bidCstRewardAmountPerMinute_ = INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE) {
	if (elapsedDuration_ <= 0n) {
		return 0n;
	}
	return elapsedDuration_ * bidCstRewardAmountPerMinute_ / 60n;
}

/**
JS mirror of the V3 bid CST reward 90/10 split (Comment-202607161).
todo-ai-0 I have now deleted Comment-202607161. Don't mention it. Rewrite other related things.
@param {bigint} bidCstRewardAmount_ The total reward.
@returns {{lastBidderAmount: bigint, newBidderAmount: bigint}}
*/
function splitV3BidCstRewardAmount(bidCstRewardAmount_) {
	const lastBidderAmount_ = bidCstRewardAmount_ * DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE / 100n;
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
	const auctionEndTimeStamp_ = beginningTimeStamp_ + await game_.cstDutchAuctionDuration();
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
	INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE,
	DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE,
	DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
	assertDefaultV3Initialization,
	addRoundLateBidPricePremiumAmountIfNeeded,
	getV3BidCstRewardAmount,
	splitV3BidCstRewardAmount,
	findTimeStampWithAffordableCstBidPrice,
};
