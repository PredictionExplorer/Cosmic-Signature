"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const {
	getLatestBlockTimestamp,
	completeRoundZero,
	upgradeToV2,
} = require("./V2UpgradeTestHelpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { deployCosmicSignatureGameV3Modules, buildCombinedCosmicSignatureGameV3Abi } = require("../../src/ContractDeploymentHelpers.js");

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
const DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS = 3n;
const DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 = 20n;
const DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3 = 5n;
const DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3 = 5n;
const DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3 = 5n;
const DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 = 15n;
const DEFAULT_PAID_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 = 50n;

// #endregion
// #region Deployment / upgrade helpers.

async function deployV1CompleteRoundZeroAndUpgradeToV2AndV3(roundActivationTime_ = 2n, gameContractName_ = "CosmicSignatureGameV3") {
	const contracts_ = await loadFixtureDeployContractsForTesting(roundActivationTime_);
	await completeRoundZero(contracts_);
	await upgradeToV2(contracts_);
	await upgradeToV3(contracts_, {}, gameContractName_);
	return contracts_;
}

/**
@param {string} gameContractName_ The implementation contract to upgrade to; tests may pass
"SpecialCosmicSignatureGameV3" (a `CosmicSignatureGameV3` subclass with the same-second bid throttle
disabled, Comment-202608265) to exercise multiple bids within a single second.
*/
async function upgradeToV3(contracts_, upgradeOptions_ = {}, gameContractName_ = "CosmicSignatureGameV3") {
	const modules_ = await deployCosmicSignatureGameV3Modules(contracts_.ownerSigner);
	const cosmicSignatureGameV3Factory_ =
		await hre.ethers.getContractFactory(gameContractName_, contracts_.ownerSigner);
	const prevImplementationAddress_ =
		await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
	await hre.upgrades.upgradeProxy(
		contracts_.cosmicSignatureGameProxy,
		cosmicSignatureGameV3Factory_,
		{
			kind: "uups",
			call: "reinitialize",
			constructorArgs: [modules_.cosmicSignatureGameAdminModuleAddress, modules_.cosmicSignatureGamePrizesModuleAddress,],
			...upgradeOptions_,
		}
	);
	const cosmicSignatureGameV3ImplementationAddress_ =
		await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
	expect(cosmicSignatureGameV3ImplementationAddress_).not.equal(prevImplementationAddress_);

	// The full pre-split Game ABI, attached to the proxy. Comment-202608245 applies.
	const combinedAbi_ =
		buildCombinedCosmicSignatureGameV3Abi(
			cosmicSignatureGameV3Factory_.interface,
			[
				modules_.cosmicSignatureGameAdminModuleFactory.interface,
				modules_.cosmicSignatureGamePrizesModuleFactory.interface,
			]
		);
	const cosmicSignatureGameV3Proxy_ =
		new hre.ethers.Contract(contracts_.cosmicSignatureGameProxyAddress, combinedAbi_, contracts_.ownerSigner);

	Object.assign(contracts_, modules_);
	contracts_.cosmicSignatureGameV3Factory = cosmicSignatureGameV3Factory_;
	contracts_.cosmicSignatureGameV3Proxy = cosmicSignatureGameV3Proxy_;
	contracts_.cosmicSignatureGameV3CombinedAbi = combinedAbi_;
	contracts_.cosmicSignatureGameV3ImplementationAddress = cosmicSignatureGameV3ImplementationAddress_;
}

/** Asserts every parameter the V3 `reinitialize` sets, at its default.
Comment-202608301: `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor` are deliberately
NOT re-initialized (they keep their live V2 values), so they are asserted by the carry-over checks instead. */
async function assertDefaultV3Initialization(game_) {
	expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3);
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
JS mirror of the premium-free CST bid price (`BiddingV3._getNextCstBidPriceBase`, which is
the V2 `getNextCstBidPriceAdvanced` math): the price declines linearly from the beginning bid price
to zero over the stored `cstDutchAuctionDuration`.
@param {bigint} cstDutchAuctionBeginningBidPrice_
@param {bigint} cstDutchAuctionElapsedDuration_ May be negative.
@param {bigint} cstDutchAuctionDuration_
*/
function getCstBidPriceBase(cstDutchAuctionBeginningBidPrice_, cstDutchAuctionElapsedDuration_, cstDutchAuctionDuration_) {
	const cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_;
	if (cstDutchAuctionRemainingDuration_ <= 0n) {
		return 0n;
	}
	return cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
}

/** JS mirror of `CosmicSignatureHelpers.tryIncreaseValueExponentially`
(Comment-202606101: a CST bid increases the stored CST Dutch auction duration this way). */
function tryIncreaseValueExponentially(value_, divisor_) {
	return value_ + value_ / divisor_;
}

/** JS mirror of `CosmicSignatureHelpers.tryReduceValueExponentially`
(Comment-202606101: an ETH bid reduces the stored CST Dutch auction duration this way). */
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

	// `getCstDutchAuctionDurations` returns the stored `cstDutchAuctionDuration` (Comment-202606101),
	// over which the price declines to zero.
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
	DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
	DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3,
	DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3,
	DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3,
	DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	DEFAULT_PAID_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
	assertDefaultV3Initialization,
	addRoundLateBidPricePremiumAmountIfNeeded,
	getV3BidCstRewardAmount,
	getCstBidPriceBase,
	tryIncreaseValueExponentially,
	tryReduceValueExponentially,
	findTimeStampWithAffordableCstBidPrice,
};
