"use strict";

// Tests `BiddingV3`'s late bid price premium: within a configurable duration before `mainPrizeTime`
// (`getRoundLateBidDuration()`), both the ETH and the CST bid price get an exponentially growing
// premium, reaching a multiplier of ~4x at (and beyond) `mainPrizeTime` with the default parameters.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	activateCurrentRound,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	addRoundLateBidPricePremiumAmountIfNeeded,
} = require("../src/V3UpgradeTestHelpers.js");

/**
JS mirror of the V2 ETH Dutch auction price at a given elapsed-since-activation duration.
@param {bigint} beginningBidPrice_
@param {bigint} elapsedDuration_
@param {bigint} auctionDuration_
@param {bigint} endingBidPriceDivisor_
*/
function ethDutchAuctionPrice(beginningBidPrice_, elapsedDuration_, auctionDuration_, endingBidPriceDivisor_) {
	if (elapsedDuration_ <= 0n) {
		return beginningBidPrice_;
	}
	const endingBidPrice_ = beginningBidPrice_ / endingBidPriceDivisor_ + 1n;
	if (elapsedDuration_ < auctionDuration_) {
		const difference_ = beginningBidPrice_ - endingBidPrice_;
		return beginningBidPrice_ - difference_ * elapsedDuration_ / auctionDuration_;
	}
	return endingBidPrice_;
}

describe("CosmicSignatureGameV3-LateBidPremium", function () {
	it("adds an exponentially growing, capped premium to ETH and CST bid prices near mainPrizeTime", async function () {
		// #region Setup: V1 -> V2 -> V3, then activate the round.

		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const bidder_ = contracts_.signers[1];

		// Slow the CST price decline down (the round is inactive right after the upgrade, so the owner can),
		// so that the 200 CST beginning bid price carried over from V1 declines to zero only after ~55 hours.
		// That makes the CST bid price still nonzero within the late bid premium window,
		// which opens ~24 hours into the round, so the CST premium section below can sample nonzero prices.
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstBidPriceDeclineMultiplier(10n ** 15n));

		await activateCurrentRound(game_, contracts_.ownerSigner);

		// #endregion
		// #region No bid in the round yet: no premium, even though the stale `mainPrizeTime` is in the past.

		{
			expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
			expect(await game_.getDurationUntilMainPrizeRaw()).lessThan(0n);
			const ts_ = await getLatestBlockTimestamp();
			const elapsed_ = ts_ - await game_.roundActivationTime();
			const expectedPurePrice_ = ethDutchAuctionPrice(
				await game_.ethDutchAuctionBeginningBidPrice(),
				elapsed_,
				(await game_.mainPrizeTimeIncrementInMicroSeconds()) / (await game_.ethDutchAuctionDurationDivisor()),
				await game_.ethDutchAuctionEndingBidPriceDivisor()
			);
			expect(await game_.getNextEthBidPrice()).equal(expectedPurePrice_);
		}

		// #endregion
		// #region First bid; collect the parameters that drive the premium curve.

		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));

		/** @type {bigint} */
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		/** @type {bigint} */
		const roundLateBidDurationDivisor_ = await game_.roundLateBidDurationDivisor();
		const roundLateBidDuration_ = mainPrizeTimeIncrementInMicroSeconds_ / roundLateBidDurationDivisor_;
		expect(await game_.getRoundLateBidDuration()).equal(roundLateBidDuration_);

		// With the defaults, the premium window is 20 minutes, exponentially stretched by ~1% per completed round.
		expect(roundLateBidDuration_).greaterThanOrEqual(20n * 60n);
		expect(roundLateBidDuration_).lessThan(21n * 60n);

		const baseMultiplier_ = await game_.roundLateBidPricePremiumAmountBaseMultiplier();
		const exponent_ = await game_.roundLateBidPricePremiumAmountExponent();
		const ethBidPriceBase_ = await game_.nextEthBidPrice();

		// #endregion
		// #region ETH premium curve: exact mirror, zero outside the window, monotonic and convex inside, ~4x cap.

		{
			/** @type {bigint} */
			const mainPrizeTime_ = await game_.mainPrizeTime();
			const ts_ = await getLatestBlockTimestamp();
			const adjustedPriceAt_ = (durationUntilMainPrize_) => addRoundLateBidPricePremiumAmountIfNeeded(
				ethBidPriceBase_,
				durationUntilMainPrize_,
				roundLateBidDuration_,
				mainPrizeTimeIncrementInMicroSeconds_,
				baseMultiplier_,
				exponent_
			);

			// Exact-mirror sweep of the curve; `durationUntilMainPrize` decreases left to right.
			for (const durationUntilMainPrize_ of [
				roundLateBidDuration_ + 3_600n,
				roundLateBidDuration_ + 1n,
				roundLateBidDuration_,
				roundLateBidDuration_ / 3n,
				7n,
				1n,
				0n,
				-1n,
				-3_600n,
				-roundLateBidDuration_ * 10n,
			]) {
				const currentTimeOffset_ = mainPrizeTime_ - durationUntilMainPrize_ - ts_;
				expect(
					await game_.getNextEthBidPriceAdvanced(currentTimeOffset_),
					`ETH premium mismatch at durationUntilMainPrize == ${durationUntilMainPrize_}`
				).equal(adjustedPriceAt_(durationUntilMainPrize_));
			}

			// No premium at or before the window opening.
			expect(adjustedPriceAt_(roundLateBidDuration_ + 3_600n)).equal(ethBidPriceBase_);
			expect(adjustedPriceAt_(roundLateBidDuration_)).equal(ethBidPriceBase_);

			// Uniform sweep across the window: on-chain values match the mirror, and the premium growth
			// is monotonically nondecreasing and convex (exponential acceleration).
			{
				const numUniformSamples_ = 8n;
				let prevIncrement_ = 0n;
				let prevPrice_ = ethBidPriceBase_;
				for (let sampleIndex_ = 1n; sampleIndex_ <= numUniformSamples_; ++ sampleIndex_) {
					const durationUntilMainPrize_ = roundLateBidDuration_ * (numUniformSamples_ - sampleIndex_) / numUniformSamples_;
					const currentTimeOffset_ = mainPrizeTime_ - durationUntilMainPrize_ - ts_;
					const onChainPrice_ = await game_.getNextEthBidPriceAdvanced(currentTimeOffset_);
					expect(onChainPrice_, `ETH premium mismatch at uniform sample ${sampleIndex_}`)
						.equal(adjustedPriceAt_(durationUntilMainPrize_));
					const increment_ = onChainPrice_ - prevPrice_;
					expect(increment_, `premium must not decrease at uniform sample ${sampleIndex_}`).greaterThanOrEqual(0n);
					expect(increment_, `premium growth must accelerate at uniform sample ${sampleIndex_}`).greaterThanOrEqual(prevIncrement_);
					prevIncrement_ = increment_;
					prevPrice_ = onChainPrice_;
				}
			}

			// The maximum premium AMOUNT is ~4x the price (Comment-202607119), so the adjusted price
			// is ~5x the price, and it stays constant after `mainPrizeTime`.
			const maxAdjustedPrice_ = adjustedPriceAt_(0n);
			expect(maxAdjustedPrice_ - ethBidPriceBase_).greaterThan(ethBidPriceBase_ * 4n * 99n / 100n);
			expect(maxAdjustedPrice_ - ethBidPriceBase_).lessThan(ethBidPriceBase_ * 4n * 101n / 100n);
			expect(adjustedPriceAt_(-1n)).equal(maxAdjustedPrice_);
			expect(adjustedPriceAt_(-3_600n)).equal(maxAdjustedPrice_);
			expect(adjustedPriceAt_(-roundLateBidDuration_ * 10n)).equal(maxAdjustedPrice_);
		}

		// #endregion
		// #region A real ETH bid within the window must pay the premium-adjusted price.

		{
			/** @type {bigint} */
			const mainPrizeTime_ = await game_.mainPrizeTime();

			// Underpaying with the premium-free price must revert.
			{
				const bidTs_ = mainPrizeTime_ - roundLateBidDuration_ / 2n;
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTs_),]);
				await expect(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: ethBidPriceBase_,}))
					.revertedWithCustomError(game_, "InsufficientReceivedBidAmount");
			}

			// Paying the premium-adjusted price at the next timestamp must succeed.
			{
				const bidTs_ = mainPrizeTime_ - roundLateBidDuration_ / 2n + 1n;
				const durationUntilMainPrize_ = mainPrizeTime_ - bidTs_;
				const adjustedPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
					ethBidPriceBase_,
					durationUntilMainPrize_,
					roundLateBidDuration_,
					mainPrizeTimeIncrementInMicroSeconds_,
					baseMultiplier_,
					exponent_
				);
				expect(adjustedPrice_).greaterThan(ethBidPriceBase_);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTs_),]);
				const transactionReceipt_ =
					await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: adjustedPrice_,}));
				let bidPlacedLog_;
				for (const log_ of transactionReceipt_.logs) {
					const parsedLog_ = game_.interface.parseLog(log_);
					if (parsedLog_?.name === "BidPlaced") {
						bidPlacedLog_ = parsedLog_;
						break;
					}
				}
				expect(bidPlacedLog_.args.paidEthPrice).equal(adjustedPrice_);

				// The premium-adjusted price feeds the exponential next-bid price ladder.
				const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();
				expect(await game_.nextEthBidPrice()).equal(adjustedPrice_ + adjustedPrice_ / ethBidPriceIncreaseDivisor_ + 1n);
			}
		}

		// #endregion
		// #region CST premium curve: exact mirror on top of the V3 linear CST price decline.

		{
			// No CST bid has been placed in this round, so the CST price declines from
			// `nextRoundFirstCstDutchAuctionBeginningBidPrice` (200 CST carried over from V1's initialization)
			// since the first bid of the round. With the slowed-down decline rate configured above,
			// that decline covers the whole premium window with nonzero prices.
			expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
			const cstDutchAuctionBeginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const cstDutchAuctionBeginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
			const cstBidPriceDeclineMultiplier_ = await game_.cstBidPriceDeclineMultiplier();
			/** @type {bigint} */
			const mainPrizeTime_ = await game_.mainPrizeTime();
			const ts_ = await getLatestBlockTimestamp();
			expect(mainPrizeTime_ - roundLateBidDuration_).greaterThan(ts_);

			// The decline must overlap the whole premium window, and its derived duration getter must agree.
			{
				const cstDutchAuctionDerivedDuration_ =
					(cstDutchAuctionBeginningBidPrice_ + (cstBidPriceDeclineMultiplier_ - 1n)) / cstBidPriceDeclineMultiplier_;
				expect(cstDutchAuctionBeginningTimeStamp_ + cstDutchAuctionDerivedDuration_).greaterThan(mainPrizeTime_ + 60n);
				expect((await game_.getCstDutchAuctionDurations())[0]).equal(cstDutchAuctionDerivedDuration_);
			}

			for (const durationUntilMainPrize_ of [
				roundLateBidDuration_ + 60n,
				roundLateBidDuration_,
				roundLateBidDuration_ * 3n / 4n,
				roundLateBidDuration_ / 2n,
				roundLateBidDuration_ / 8n,
				0n,
				-60n,
			]) {
				const sampleTs_ = mainPrizeTime_ - durationUntilMainPrize_;

				// The V3 premium-free CST bid price declines linearly at `cstBidPriceDeclineMultiplier` per second.
				const cstBidPriceBase_ =
					cstDutchAuctionBeginningBidPrice_ - (sampleTs_ - cstDutchAuctionBeginningTimeStamp_) * cstBidPriceDeclineMultiplier_;
				expect(cstBidPriceBase_).greaterThan(0n);

				const adjustedCstPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
					cstBidPriceBase_,
					durationUntilMainPrize_,
					roundLateBidDuration_,
					mainPrizeTimeIncrementInMicroSeconds_,
					baseMultiplier_,
					exponent_
				);
				expect(
					await game_.getNextCstBidPriceAdvanced(sampleTs_ - ts_),
					`CST premium mismatch at durationUntilMainPrize == ${durationUntilMainPrize_}`
				).equal(adjustedCstPrice_);
				if (durationUntilMainPrize_ <= 0n) {
					// The maximum premium AMOUNT is ~4x the price (Comment-202607119).
					expect(adjustedCstPrice_ - cstBidPriceBase_).greaterThan(cstBidPriceBase_ * 4n * 99n / 100n);
				}
			}
		}

		// #endregion
	});
});
