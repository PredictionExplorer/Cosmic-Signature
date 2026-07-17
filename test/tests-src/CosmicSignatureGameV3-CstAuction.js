"use strict";

// Tests `BiddingV3`'s CST time standard (Comment-202607165): the CST Dutch auction price declines at
// exactly the bid CST reward accrual rate, the auction restart floor is derived as 3 main prize time
// increments' worth of accrual (Comment-202607166), the auction duration is emergent, and the V2
// duration-drift machinery is retired. See "docs/round-termination-proof.md" for why the mechanism
// is shaped this way.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
	activateCurrentRound,
	findParsedEvent,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	bidCstRewardMultiplierForRatePerMinute,
	getV3CstBidPriceBase,
	getV3CstDutchAuctionDurationMaxLimit,
	getV3CstDutchAuctionDuration,
	getV3CstDutchAuctionBeginningBidPriceMinLimit,
	addRoundLateBidPricePremiumAmountIfNeeded,
	findTimeStampWithAffordableCstBidPrice,
} = require("../src/V3UpgradeTestHelpers.js");

// #region Local helpers.

/** Executes an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function bidWithEthAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_,})
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return { receipt_, ethBidPrice_ };
}

/** Executes a CST bid at exactly the given block timestamp, with `priceMaxLimit_` equal the exact bid price. */
async function bidWithCstAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const cstBidPrice_ = await game_.getNextCstBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithCst(cstBidPrice_, "", 0n)
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return { receipt_, cstBidPrice_ };
}

/** Reads the game parameters the CST time standard formulas need. */
async function readCstTimeStandardParams(game_) {
	const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
	return {
		mainPrizeTimeIncrementInMicroSeconds_,
		mainPrizeTimeIncrement_: mainPrizeTimeIncrementInMicroSeconds_ / 1_000_000n,
		bidCstRewardAmountMultiplier_: await game_.bidCstRewardAmountMultiplier(),
	};
}

// #endregion

describe("CosmicSignatureGameV3-CstAuction", function () {
	it("the price declines at exactly the reward accrual rate, clamping at zero at the emergent duration", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const { mainPrizeTimeIncrementInMicroSeconds_, mainPrizeTimeIncrement_, bidCstRewardAmountMultiplier_ } =
			await readCstTimeStandardParams(game_);

		// The first bid of the round starts the CST Dutch auction. No CST bid has been placed in this game yet,
		// so the beginning bid price is the initial `nextRoundFirstCstDutchAuctionBeginningBidPrice` = 200 CST.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, contracts_.signers[1], firstBidTimeStamp_);
		const beginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		expect(beginningBidPrice_).equal(200n * 10n ** 18n);
		expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(firstBidTimeStamp_);

		// The emergent duration: the exact second at which the price reaches zero.
		const emergentDuration_ =
			getV3CstDutchAuctionDuration(beginningBidPrice_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_);
		{
			const [reportedDuration_, reportedElapsedDuration_] = await game_.getCstDutchAuctionDurations();
			expect(reportedDuration_).equal(emergentDuration_);
			expect(reportedElapsedDuration_).equal((await getLatestBlockTimestamp()) - firstBidTimeStamp_);
		}

		// Exact price decline curve. All offsets stay far below `mainPrizeTime` (~1 day), so no premium applies.
		for (const elapsedDuration_ of [
			0n, 1n, 59n, 60n, 61n, 600n,
			mainPrizeTimeIncrement_,
			2n * mainPrizeTimeIncrement_,
			emergentDuration_ - 1n,
			emergentDuration_,
			emergentDuration_ + 1n,
			emergentDuration_ + 3_600n,
		]) {
			expect(
				await game_.getNextCstBidPriceAdvanced(elapsedDuration_),
				`price mismatch at elapsed duration ${elapsedDuration_}`
			).equal(getV3CstBidPriceBase(beginningBidPrice_, elapsedDuration_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_));
		}

		// The zero crossing is exact: nonzero 1 second before the emergent duration, zero at it.
		expect(await game_.getNextCstBidPriceAdvanced(emergentDuration_ - 1n)).greaterThan(0n);
		expect(await game_.getNextCstBidPriceAdvanced(emergentDuration_)).equal(0n);

		// The one-formula identity (Comment-202607165), purely on-chain: right after a bid, the reward clock and
		// the auction clock coincide, so the price decline over any duration equals the reward accrual over it.
		{
			const priceNow_ = await game_.getNextCstBidPriceAdvanced(0n);
			for (const elapsedDuration_ of [1n, 60n, 3_600n, mainPrizeTimeIncrement_, emergentDuration_ / 2n,]) {
				const priceLater_ = await game_.getNextCstBidPriceAdvanced(elapsedDuration_);
				expect(priceLater_).greaterThan(0n);
				expect(
					priceNow_ - priceLater_,
					`price decline != reward accrual at elapsed duration ${elapsedDuration_}`
				).equal(await game_.getBidCstRewardAmountAdvanced(elapsedDuration_));
			}
		}
	});

	it("a free CST bid re-arms the auction at the derived floor: 3 increments of accrual, lasting 3 increments", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const { mainPrizeTimeIncrementInMicroSeconds_, mainPrizeTimeIncrement_, bidCstRewardAmountMultiplier_ } =
			await readCstTimeStandardParams(game_);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
		const openingAuctionDuration_ = (await game_.getCstDutchAuctionDurations())[0];

		// Wait past the opening auction's end and place a free CST bid.
		const freeBidTimeStamp_ = firstBidTimeStamp_ + openingAuctionDuration_ + 100n;
		const { receipt_, cstBidPrice_ } = await bidWithCstAt(game_, bidder2_, freeBidTimeStamp_);
		expect(cstBidPrice_).equal(0n);

		// The new auction begins at the derived floor...
		const expectedFloor_ = getV3CstDutchAuctionBeginningBidPriceMinLimit(bidCstRewardAmountMultiplier_);
		expect(expectedFloor_).equal(3n * bidCstRewardAmountMultiplier_ / 1_000_000n);
		expect(await game_.getCstDutchAuctionBeginningBidPriceMinLimit()).equal(expectedFloor_);
		expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedFloor_);
		expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(freeBidTimeStamp_);

		// ...which is exactly 3 increments' worth of accrual, so the emergent duration is exactly 3 increments
		// (at the default multiplier, where the division is exact)...
		expect(expectedFloor_).equal(3n * (await game_.getBidCstRewardAmountPerMainPrizeTimeIncrement()));
		const newAuctionDuration_ =
			getV3CstDutchAuctionDuration(expectedFloor_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_);
		expect(newAuctionDuration_).equal(3n * mainPrizeTimeIncrement_);
		expect((await game_.getCstDutchAuctionDurations())[0]).equal(newAuctionDuration_);

		// ...and `BidPlaced` reports the new auction's emergent duration.
		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.cstDutchAuctionDuration).equal(newAuctionDuration_);
		expect(bidPlaced_.args.paidCstPrice).equal(0n);

		// This was the round's first CST bid, so the floor also seeds the next round's first auction.
		expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(expectedFloor_);

		// A free bid burns nothing.
		expect(await game_.getBidderTotalSpentAmounts(await game_.roundNum(), bidder2_.address).then((r_) => r_[1])).equal(0n);
		expect(await token_.balanceOf(bidder2_.address)).greaterThan(0n);
	});

	it("a paid CST bid re-arms the auction at max(2x the paid price, the floor); the premium feeds the restart", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const { mainPrizeTimeIncrementInMicroSeconds_, bidCstRewardAmountMultiplier_ } = await readCstTimeStandardParams(game_);
		const expectedFloor_ = getV3CstDutchAuctionBeginningBidPriceMinLimit(bidCstRewardAmountMultiplier_);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		// Accumulate CST for the bidders: two ETH bids an increment apart mint ~54 + ~6 CST,
		// then a free CST bid after the opening auction fully decays.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
		await bidWithEthAt(game_, bidder2_, firstBidTimeStamp_ + 3_600n);
		{
			const openingAuctionEnd_ = firstBidTimeStamp_ + (await game_.getCstDutchAuctionDurations())[0];
			const freeBidTimeStamp_ = openingAuctionEnd_ + 3_600n;
			await bidWithCstAt(game_, bidder1_, freeBidTimeStamp_);
		}

		// #region The above-the-floor branch: pay more than half the floor, so `2 * paid > floor`.

		{
			// The auction now runs from the floor (180 CST over 3 increments). Bid early: after ~1/12 of the
			// auction, the price is ~165 CST -- more than half the floor. Both bidders hold enough CST by now?
			// bidder1 got 90% of the free bid's accrual plus earlier rewards; use whoever can afford it.
			const restartTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const bidTimeStamp_ = restartTimeStamp_ + (await game_.getCstDutchAuctionDurations())[0] / 12n;
			const price_ = await game_.getNextCstBidPriceAdvanced(bidTimeStamp_ - (await getLatestBlockTimestamp()));
			expect(price_ * 2n).greaterThan(expectedFloor_);
			const richBidder_ = (await token_.balanceOf(bidder1_.address)) >= price_ ? bidder1_ : bidder2_;
			expect(await token_.balanceOf(richBidder_.address)).greaterThanOrEqual(price_);

			const { receipt_, cstBidPrice_ } = await bidWithCstAt(game_, richBidder_, bidTimeStamp_);
			expect(cstBidPrice_).equal(price_);
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(price_ * 2n);

			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.cstDutchAuctionDuration)
				.equal(getV3CstDutchAuctionDuration(price_ * 2n, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_));
		}

		// #endregion
		// #region The floor branch: pay less than half the floor, so the floor wins.

		{
			// Wait until the price declines below half the floor (but stays nonzero).
			const restartTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const auctionDuration_ = (await game_.getCstDutchAuctionDurations())[0];
			const bidTimeStamp_ = restartTimeStamp_ + auctionDuration_ - auctionDuration_ / 20n;
			const price_ = await game_.getNextCstBidPriceAdvanced(bidTimeStamp_ - (await getLatestBlockTimestamp()));
			expect(price_).greaterThan(0n);
			expect(price_ * 2n).lessThan(expectedFloor_);
			const richBidder_ = (await token_.balanceOf(bidder1_.address)) >= price_ ? bidder1_ : bidder2_;

			await bidWithCstAt(game_, richBidder_, bidTimeStamp_);
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedFloor_);
		}

		// #endregion
		// #region The late-bid premium inflates the paid price, and the inflated price feeds the restart.

		{
			// Walk the round close to `mainPrizeTime` with ETH bids, then re-arm the CST auction with a free
			// bid 30 minutes before it, so the fresh auction's nonzero range overlaps the premium window.
			/** @type {bigint} */
			let mainPrizeTime_ = await game_.mainPrizeTime();
			{
				const latestTimeStamp_ = await getLatestBlockTimestamp();
				if (mainPrizeTime_ - 45n * 60n > latestTimeStamp_ + 1n) {
					await bidWithEthAt(game_, bidder1_, mainPrizeTime_ - 45n * 60n);
					mainPrizeTime_ = await game_.mainPrizeTime();
				}
			}
			{
				const freeBidTimeStamp_ = mainPrizeTime_ - 30n * 60n;
				expect(await game_.getNextCstBidPriceAdvanced(freeBidTimeStamp_ - (await getLatestBlockTimestamp()))).equal(0n);
				await bidWithCstAt(game_, bidder1_, freeBidTimeStamp_);
				mainPrizeTime_ = await game_.mainPrizeTime();
			}

			// Bid inside the premium window. The premium-inflated paid price is what gets doubled.
			const restartTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const roundLateBidDuration_ = await game_.getRoundLateBidDuration();
			const bidTimeStamp_ = mainPrizeTime_ - roundLateBidDuration_ / 2n;
			const basePrice_ = getV3CstBidPriceBase(
				await game_.cstDutchAuctionBeginningBidPrice(),
				bidTimeStamp_ - restartTimeStamp_,
				bidCstRewardAmountMultiplier_,
				mainPrizeTimeIncrementInMicroSeconds_
			);
			const adjustedPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
				basePrice_,
				mainPrizeTime_ - bidTimeStamp_,
				roundLateBidDuration_,
				mainPrizeTimeIncrementInMicroSeconds_,
				await game_.roundLateBidPricePremiumAmountBaseMultiplier(),
				await game_.roundLateBidPricePremiumAmountExponent()
			);
			expect(adjustedPrice_).greaterThan(basePrice_);

			const richBidder_ = (await token_.balanceOf(bidder1_.address)) >= adjustedPrice_ ? bidder1_ : bidder2_;
			expect(await token_.balanceOf(richBidder_.address)).greaterThanOrEqual(adjustedPrice_);
			const { cstBidPrice_ } = await bidWithCstAt(game_, richBidder_, bidTimeStamp_);
			expect(cstBidPrice_).equal(adjustedPrice_);
			expect(await game_.cstDutchAuctionBeginningBidPrice())
				.equal((adjustedPrice_ * 2n > expectedFloor_) ? adjustedPrice_ * 2n : expectedFloor_);
		}

		// #endregion
	});

	it("the duration drift is retired: bids leave the V2 duration storage untouched, and the retired setters are inert", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const gameForOwner_ = game_.connect(contracts_.ownerSigner);

		// While the round is inactive, exercise the retired setters. They still write storage and emit events...
		await expect(gameForOwner_.setCstDutchAuctionDuration(999n))
			.emit(game_, "CstDutchAuctionDurationChanged").withArgs(999n);
		await expect(gameForOwner_.setCstDutchAuctionDurationChangeDivisor(7n))
			.emit(game_, "CstDutchAuctionDurationChangeDivisorChanged").withArgs(7n);
		await expect(gameForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(10n ** 18n))
			.emit(game_, "CstDutchAuctionBeginningBidPriceMinLimitChanged").withArgs(10n ** 18n);
		expect(await game_.cstDutchAuctionDuration()).equal(999n);
		expect(await game_.cstDutchAuctionDurationChangeDivisor()).equal(7n);
		expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(10n ** 18n);

		// ...but none of them affects V3 pricing: the derived floor ignores the stored min limit...
		const { mainPrizeTimeIncrementInMicroSeconds_, bidCstRewardAmountMultiplier_ } = await readCstTimeStandardParams(game_);
		const expectedFloor_ = getV3CstDutchAuctionBeginningBidPriceMinLimit(bidCstRewardAmountMultiplier_);
		expect(await game_.getCstDutchAuctionBeginningBidPriceMinLimit()).equal(expectedFloor_);
		expect(expectedFloor_).not.equal(10n ** 18n);

		// ...and the price and the emergent duration ignore the stored duration.
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
		{
			const beginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
			expect((await game_.getCstDutchAuctionDurations())[0])
				.equal(getV3CstDutchAuctionDuration(beginningBidPrice_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_));
			expect(await game_.getNextCstBidPriceAdvanced(600n))
				.equal(getV3CstBidPriceBase(beginningBidPrice_, 600n + (await getLatestBlockTimestamp()) - firstBidTimeStamp_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_));
		}

		// Bids do not touch the stored V2 duration slots any more.
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 100n);
		{
			const openingAuctionEnd_ = firstBidTimeStamp_ + (await game_.getCstDutchAuctionDurations())[0];
			await bidWithCstAt(game_, bidder1_, openingAuctionEnd_ + 10n);
		}
		expect(await game_.cstDutchAuctionDuration()).equal(999n);
		expect(await game_.cstDutchAuctionDurationChangeDivisor()).equal(7n);

		// With the tiny stored min limit (1 CST), a V2-style restart after the free bid would have begun at
		// 1 CST; the V3 derived floor re-armed it at 180 CST instead.
		expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedFloor_);
	});

	it("the beginning bid price carries over to the next round, and the accrual per increment stays put as increments stretch", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];

		// Round with a paid CST bid: remember what the round's FIRST CST bid re-armed the auction to.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
		{
			const openingAuctionEnd_ = firstBidTimeStamp_ + (await game_.getCstDutchAuctionDurations())[0];
			await bidWithCstAt(game_, bidder1_, openingAuctionEnd_ + 10n);
		}
		const nextRoundFirstBeginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		expect(nextRoundFirstBeginningBidPrice_).equal(await game_.cstDutchAuctionBeginningBidPrice());

		const rewardPerIncrementBefore_ = await game_.getBidCstRewardAmountPerMainPrizeTimeIncrement();
		const incrementBefore_ = (await game_.mainPrizeTimeIncrementInMicroSeconds()) / 1_000_000n;

		// Claim; the next round's increment is ~1% longer.
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		await waitForTransactionReceipt(game_.connect(bidder1_).claimMainPrize());
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const { mainPrizeTimeIncrementInMicroSeconds_, mainPrizeTimeIncrement_, bidCstRewardAmountMultiplier_ } =
			await readCstTimeStandardParams(game_);
		expect(mainPrizeTimeIncrement_).greaterThan(incrementBefore_);

		// The next round's first auction begins at the carried-over price and declines at the (slightly
		// slower per-second, identical per-increment) rate.
		const newRoundFirstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, bidder1_, newRoundFirstBidTimeStamp_);
		expect(await game_.getNextCstBidPriceAdvanced(600n)).equal(
			getV3CstBidPriceBase(
				nextRoundFirstBeginningBidPrice_,
				600n + (await getLatestBlockTimestamp()) - newRoundFirstBidTimeStamp_,
				bidCstRewardAmountMultiplier_,
				mainPrizeTimeIncrementInMicroSeconds_
			)
		);

		// The accrual per increment is (within 1 Wei-level rounding of the increment flooring) unchanged:
		// the reward, the price decline, and the floor all stretch together with the increment.
		{
			const rewardPerIncrementAfter_ = await game_.getBidCstRewardAmountPerMainPrizeTimeIncrement();
			const differenceScaled_ =
				(rewardPerIncrementAfter_ - rewardPerIncrementBefore_) * 1_000_000n / rewardPerIncrementBefore_;
			expect(differenceScaled_ >= -1_000n && differenceScaled_ <= 1_000n, "accrual per increment drifted").equal(true);
			expect(await game_.getCstDutchAuctionBeginningBidPriceMinLimit())
				.equal(3n * bidCstRewardAmountMultiplier_ / 1_000_000n);
		}
	});

	it("a beginning bid price above 12 increments of accrual declines proportionally faster (the duration cap)", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;

		// At 0.1 CST per minute, 12 increments of accrual are 72 CST -- below the carried-over 200 CST
		// beginning bid price, so the round-opening auction runs in the capped branch (Comment-202607170).
		const rewardMultiplier_ = bidCstRewardMultiplierForRatePerMinute(10n ** 17n);
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(rewardMultiplier_));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const { mainPrizeTimeIncrementInMicroSeconds_, mainPrizeTimeIncrement_, bidCstRewardAmountMultiplier_ } =
			await readCstTimeStandardParams(game_);
		expect(bidCstRewardAmountMultiplier_).equal(rewardMultiplier_);

		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, contracts_.signers[1], firstBidTimeStamp_);
		const beginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		const durationMaxLimit_ = getV3CstDutchAuctionDurationMaxLimit(mainPrizeTimeIncrementInMicroSeconds_);
		expect(durationMaxLimit_).equal(12n * mainPrizeTimeIncrement_);
		expect(beginningBidPrice_).greaterThan(durationMaxLimit_ * rewardMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_);

		// The emergent duration is capped at 12 increments, and the price line is scaled to fit it,
		// with an exact zero crossing at the cap.
		expect((await game_.getCstDutchAuctionDurations())[0]).equal(durationMaxLimit_);
		for (const elapsedDuration_ of [0n, 1n, 600n, mainPrizeTimeIncrement_, durationMaxLimit_ / 2n, durationMaxLimit_ - 1n, durationMaxLimit_, durationMaxLimit_ + 600n,]) {
			const expectedPrice_ =
				(elapsedDuration_ < durationMaxLimit_) ?
				(beginningBidPrice_ * (durationMaxLimit_ - elapsedDuration_) / durationMaxLimit_) :
				0n;
			expect(
				await game_.getNextCstBidPriceAdvanced(elapsedDuration_),
				`capped price mismatch at elapsed duration ${elapsedDuration_}`
			).equal(getV3CstBidPriceBase(beginningBidPrice_, elapsedDuration_, rewardMultiplier_, mainPrizeTimeIncrementInMicroSeconds_));
			expect(await game_.getNextCstBidPriceAdvanced(elapsedDuration_)).equal(expectedPrice_);
		}
		expect(await game_.getNextCstBidPriceAdvanced(durationMaxLimit_ - 1n)).greaterThan(0n);
		expect(await game_.getNextCstBidPriceAdvanced(durationMaxLimit_)).equal(0n);

		// A free bid on the capped auction re-arms at the derived floor, whose auction is uncapped again.
		{
			const freeBidTimeStamp_ = firstBidTimeStamp_ + durationMaxLimit_ + 100n;
			const { cstBidPrice_ } = await bidWithCstAt(game_, contracts_.signers[1], freeBidTimeStamp_);
			expect(cstBidPrice_).equal(0n);
			const expectedFloor_ = getV3CstDutchAuctionBeginningBidPriceMinLimit(rewardMultiplier_);
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedFloor_);
			expect((await game_.getCstDutchAuctionDurations())[0]).equal(3n * mainPrizeTimeIncrement_);
		}
	});

	it("a CST bid cannot be the first bid of a round, even when free and with a pending reward (Comment-202607164)", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder_ = contracts_.signers[1];

		// No bids in the round; the stale auction clock makes the price zero, and the reward has been
		// accruing since the round activation, so both the burn (0) and the mints would be possible --
		// but the bid type validation must still reject the bid with the intended error.
		await hre.ethers.provider.send("evm_increaseTime", [600,]);
		await hre.ethers.provider.send("evm_mine");
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
		expect(await game_.getNextCstBidPrice()).equal(0n);
		expect(await game_.getBidCstRewardAmount()).greaterThan(0n);
		await expect(game_.connect(bidder_).bidWithCst((1n << 255n), "", 0n))
			.revertedWithCustomError(game_, "WrongBidType");
	});

	it("finding an affordable CST bid works across restarts (helper self-test)", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 3_600n);
		for (let cstBidIndex_ = 0; cstBidIndex_ < 3; ++ cstBidIndex_) {
			const bidderSigner_ = (cstBidIndex_ % 2 === 0) ? bidder1_ : bidder2_;
			const { timeStamp: bidTimeStamp_, price: price_ } = await findTimeStampWithAffordableCstBidPrice(
				game_,
				await token_.balanceOf(bidderSigner_.address),
				(await getLatestBlockTimestamp()) + 60n
			);
			expect(price_).lessThanOrEqual(await token_.balanceOf(bidderSigner_.address));
			await bidWithCstAt(game_, bidderSigner_, bidTimeStamp_);
			expect(await game_.cstDutchAuctionBeginningBidPrice())
				.greaterThanOrEqual(await game_.getCstDutchAuctionBeginningBidPriceMinLimit());
		}
	});
});
