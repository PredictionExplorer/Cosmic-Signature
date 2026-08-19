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
	getCstBidPriceBase,
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

		// Stretch the CST Dutch auction (the round is inactive right after the upgrade, so the owner can),
		// so that the 200 CST beginning bid price carried over from V1 declines to zero only after ~55 hours.
		// That makes the CST bid price still nonzero within the late bid premium window,
		// which opens ~24 hours into the round, so the CST premium section below can sample nonzero prices.
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(55n * 3_600n));

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

				// Comment-202608271: the premium is a one-time toll on the bid that paid it.
				// The exponential next-bid price ladder grows from the premium-free base,
				// NOT from the premium-adjusted paid price.
				const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();
				const newEthBidPriceBase_ = ethBidPriceBase_ + ethBidPriceBase_ / ethBidPriceIncreaseDivisor_ + 1n;
				expect(await game_.nextEthBidPrice()).equal(newEthBidPriceBase_);

				// The bid also pushed `mainPrizeTime` a full increment out, which closed the premium window,
				// so the posted price right now is exactly the premium-free ladder value --
				// as if the premium logic did not exist.
				expect((await game_.mainPrizeTime()) - (await getLatestBlockTimestamp())).greaterThan(roundLateBidDuration_);
				expect(await game_.getNextEthBidPrice()).equal(newEthBidPriceBase_);
			}
		}

		// #endregion
		// #region CST premium curve: exact mirror on top of the V2 CST Dutch auction price decline.

		{
			// No CST bid has been placed in this round, so the CST price declines from
			// `nextRoundFirstCstDutchAuctionBeginningBidPrice` (200 CST carried over from V1's initialization)
			// since the first bid of the round. With the stretched auction duration configured above,
			// that decline covers the whole premium window with nonzero prices.
			expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
			const cstDutchAuctionBeginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const cstDutchAuctionBeginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
			const cstDutchAuctionDuration_ = await game_.cstDutchAuctionDuration();
			/** @type {bigint} */
			const mainPrizeTime_ = await game_.mainPrizeTime();
			const ts_ = await getLatestBlockTimestamp();
			expect(mainPrizeTime_ - roundLateBidDuration_).greaterThan(ts_);

			// The auction must overlap the whole premium window, and the durations getter
			// must report the stored duration (Comment-202606101).
			{
				expect(cstDutchAuctionBeginningTimeStamp_ + cstDutchAuctionDuration_).greaterThan(mainPrizeTime_ + 60n);
				expect((await game_.getCstDutchAuctionDurations())[0]).equal(cstDutchAuctionDuration_);
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

				// The premium-free CST bid price declines linearly to zero over `cstDutchAuctionDuration` (the V2 math).
				const cstBidPriceBase_ = getCstBidPriceBase(
					cstDutchAuctionBeginningBidPrice_,
					sampleTs_ - cstDutchAuctionBeginningTimeStamp_,
					cstDutchAuctionDuration_
				);
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

	it("keeps the premium a one-time toll: no stored price ever absorbs it (Comment-202608271)", async function () {
		// #region Setup: V1 -> V2 -> V3; stretch the CST Dutch auction (like the test above); activate; first bid.

		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const [bidder1_, bidder2_,] = contracts_.signers.slice(1, 3);
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(55n * 3_600n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		// `bidder2_` mints a Random Walk NFT for the discounted maximum-premium bid below.
		await waitForTransactionReceipt(
			contracts_.randomWalkNft.connect(bidder2_).mint({value: await contracts_.randomWalkNft.getMintPrice(),})
		);
		const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;

		const roundNum_ = await game_.roundNum();
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));

		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		const roundLateBidDuration_ = await game_.getRoundLateBidDuration();
		const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();

		const findBidPlacedLog_ = (transactionReceipt_) => {
			for (const log_ of transactionReceipt_.logs) {
				let parsedLog_;
				try { parsedLog_ = game_.interface.parseLog(log_); } catch { continue; }
				if (parsedLog_?.name === "BidPlaced") {
					return parsedLog_;
				}
			}
			throw new Error("No BidPlaced event found.");
		};

		/** The JS premium mirror at the given absolute bid timestamp, against the current `mainPrizeTime`. */
		const premiumAdjustedPriceAt_ = async (basePrice_, bidTimeStamp_) => addRoundLateBidPricePremiumAmountIfNeeded(
			basePrice_,
			(await game_.mainPrizeTime()) - bidTimeStamp_,
			roundLateBidDuration_,
			mainPrizeTimeIncrementInMicroSeconds_
		);

		// #endregion
		// #region A plain ETH bid deep in the window pays a steep premium; the ladder ignores it.

		{
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const bidTimeStamp_ = (await game_.mainPrizeTime()) - roundLateBidDuration_ / 8n;
			const adjustedPrice_ = await premiumAdjustedPriceAt_(ethBidPriceBase_, bidTimeStamp_);

			// Sanity: deep in the window, this is a real premium (over 2x the base in total).
			expect(adjustedPrice_).greaterThan(ethBidPriceBase_ * 2n);

			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			const transactionReceipt_ =
				await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: adjustedPrice_,}));
			expect(findBidPlacedLog_(transactionReceipt_).args.paidEthPrice).equal(adjustedPrice_);

			// The ladder grew from the premium-free base...
			const newEthBidPriceBase_ = ethBidPriceBase_ + ethBidPriceBase_ / ethBidPriceIncreaseDivisor_ + 1n;
			expect(await game_.nextEthBidPrice()).equal(newEthBidPriceBase_);

			// ...and with the premium window closed by the bid's `mainPrizeTime` extension,
			// that is exactly the posted price -- as if the premium logic did not exist.
			expect(await game_.getNextEthBidPrice()).equal(newEthBidPriceBase_);

			// The bid's raffle weight is the premium-free base too (Comment-202608262): the premium
			// buys no raffle odds, so this bid paid over 2x per unit of raffle weight.
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, 1n)) - (await game_.bidRaffleCumulativeWeights(roundNum_, 0n))
			).equal(ethBidPriceBase_);
		}

		// #endregion
		// #region An ETH + Random Walk NFT bid past the deadline pays half the maximum premium; same ladder rule.

		{
			const ethBidPriceBase_ = await game_.nextEthBidPrice();

			// Past `mainPrizeTime`, the premium is clamped at its maximum: the amount is ~4x the price.
			const bidTimeStamp_ = (await game_.mainPrizeTime()) + 123n;
			const adjustedPrice_ = await premiumAdjustedPriceAt_(ethBidPriceBase_, bidTimeStamp_);
			expect(adjustedPrice_ - ethBidPriceBase_).greaterThan(ethBidPriceBase_ * 4n * 99n / 100n);
			expect(adjustedPrice_ - ethBidPriceBase_).lessThan(ethBidPriceBase_ * 4n * 101n / 100n);

			// The Random Walk NFT discount halves the premium-inclusive posted price.
			const discountedPrice_ = await game_.getEthPlusRandomWalkNftBidPrice(adjustedPrice_);
			expect(discountedPrice_).equal((adjustedPrice_ + 1n) / 2n);

			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithEth(randomWalkNftId_, "", 0n, {value: discountedPrice_,})
			);
			expect(findBidPlacedLog_(transactionReceipt_).args.paidEthPrice).equal(discountedPrice_);

			// Even a maximum-premium bid leaves only the plain exponential step behind.
			expect(await game_.nextEthBidPrice()).equal(ethBidPriceBase_ + ethBidPriceBase_ / ethBidPriceIncreaseDivisor_ + 1n);

			// The raffle weight is the undiscounted premium-free base: neither the ~5x premium
			// nor the Random Walk NFT discount shows up in it (Comment-202608262).
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, 2n)) - (await game_.bidRaffleCumulativeWeights(roundNum_, 1n))
			).equal(ethBidPriceBase_);
		}

		// #endregion
		// #region A CST bid in the window burns the premium price, but the auction resets from the base.

		{
			const ethBidPriceLadderBefore_ = await game_.nextEthBidPrice();
			const bidTimeStamp_ = (await game_.mainPrizeTime()) - roundLateBidDuration_ / 4n;

			// This is the round's first CST bid, so the price declines from
			// `nextRoundFirstCstDutchAuctionBeginningBidPrice` since the round's first bid.
			expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
			const cstBidPriceBase_ = getCstBidPriceBase(
				await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice(),
				bidTimeStamp_ - await game_.cstDutchAuctionBeginningTimeStamp(),
				await game_.cstDutchAuctionDuration()
			);
			expect(cstBidPriceBase_).greaterThan(0n);
			const adjustedCstPrice_ = await premiumAdjustedPriceAt_(cstBidPriceBase_, bidTimeStamp_);
			expect(adjustedCstPrice_).greaterThan(cstBidPriceBase_);

			// `bidder1_` has been minted bid CST rewards for being outbid (over a day elapsed), enough to pay.
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			const transactionReceipt_ =
				await waitForTransactionReceipt(game_.connect(bidder1_).bidWithCst(adjustedCstPrice_, "", 0n));
			expect(findBidPlacedLog_(transactionReceipt_).args.paidCstPrice).equal(adjustedCstPrice_);

			// The bidder was really charged (and statistics record) the premium-inclusive price...
			expect((await game_.getBidderTotalSpentAmounts(roundNum_, bidder1_.address))[1]).equal(adjustedCstPrice_);

			// ...but the next CST Dutch auction begins from the doubled premium-free base...
			const cstDutchAuctionBeginningBidPriceMinLimit_ = await game_.cstDutchAuctionBeginningBidPriceMinLimit();
			const doubledCstBidPriceBase_ = cstBidPriceBase_ * 2n;
			const expectedNewCstDutchAuctionBeginningBidPrice_ =
				(doubledCstBidPriceBase_ >= cstDutchAuctionBeginningBidPriceMinLimit_) ?
				doubledCstBidPriceBase_ :
				cstDutchAuctionBeginningBidPriceMinLimit_;
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedNewCstDutchAuctionBeginningBidPrice_);
			expect(expectedNewCstDutchAuctionBeginningBidPrice_).lessThan(adjustedCstPrice_ * 2n);

			// ...and so does the next round's first CST auction anchor (this was the round's first CST bid),
			// so the premium cannot leak into the next bidding round either.
			expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(expectedNewCstDutchAuctionBeginningBidPrice_);

			// A CST bid never touches the ETH price ladder.
			expect(await game_.nextEthBidPrice()).equal(ethBidPriceLadderBefore_);

			// A late CST bid weighs the concurrent premium-free ETH bid price base
			// (the stored ladder value), with no premium in the weight (Comment-202608262).
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, 3n)) - (await game_.bidRaffleCumulativeWeights(roundNum_, 2n))
			).equal(ethBidPriceLadderBefore_);
		}

		// #endregion
	});
});
