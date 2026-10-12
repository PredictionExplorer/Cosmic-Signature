"use strict";

// Adversarial, economic, and misconfiguration scenarios for the V3 CST bid pricing rules summarized in Comment-202611022.
// Each test proves one security claim of `docs/cosmic-signature-game-cst-bid-pricing.md`, the invariants I1 to I5 or a row of
// the "How It Plays With the Default Parameters" table, with expectations computed from the JS mirrors in
// `test/src/V3UpgradeTestHelpers.js` at the live parameters read from the contract. The doc's rounded figures are never
// hardcoded as expectations; where a test compares with them, it derives the exact rounding term first.
// The scenarios run in round 1 after the V1 -> V2 -> V3 upgrade, where the main prize time increment is a whole number of
// seconds, so the doc's idealized figures are exact; the differential and fuzz tests cover other increments.
// Every time-dependent step pins the block timestamp, and the only randomized test prints a reproducible seed.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { MICROSECONDS_PER_SECOND, SECONDS_PER_DAY } = require("../../src/CosmicSignatureConstants.js");
const { MAX_UINT256, minBigInt } = require("../../src/BigIntMathHelpers.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, findParsedEvent, getLatestBlockTimestamp, blockTimestampOfReceipt } = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	getV3BidCstRewardAmount,
	getV3NewCstDutchAuctionBeginningBidPrice,
	getV3CstBidPriceBase,
	getV3CstDutchAuctionDuration,
	getV3CstBidRaffleWeight,
	readCstPricingParams,
	getLastBidRaffleWeight,
	FAR_FUTURE_TIME_OFFSET,
	tryIncreaseValueExponentially,
} = require("../src/V3UpgradeTestHelpers.js");
const { getPriceAndBidWithCstAt } = require("../src/BidCstRewardTestHelpers.js");
const { deployHostileBidder, hostileBidWithEthAt } = require("../src/AdversarialTestHelpers.js");
const { verifyBidRaffleClaimDraws, readBidRaffleData } = require("../src/BidRaffleTestHelpers.js");
const { finishGameRound, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");
const { createSeededRandomSourceForTest, scaleWithTestMode } = require("../src/RandomizedTestHelpers.js");
const {
	getRoundLateBidPricePremiumAmountAt,
	getCstBidPriceAt,
	getEthBidPriceAt,
	payCstFromMarketingWallet,
	getBidderRaffleWinnerAddresses,
	classifyCstTransferEvents,
} = require("../src/CstAdversarialTestHelpers.js");

/** One CST, for comparisons with the doc's figures, which are in whole CST. */
const ONE_CST = 10n ** 18n;

/**
Deploys V1, completes round 0, upgrades to V2 and V3, lets `configureBeforeActivation_` set owner parameters
while round 1 is still inactive, activates round 1, and reads the live parameters.
*/
async function setUpV3Round(configureBeforeActivation_ = undefined) {
	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
	const game_ = contracts_.cosmicSignatureGameV3Proxy;
	if (configureBeforeActivation_ !== undefined) {
		await configureBeforeActivation_(game_.connect(contracts_.ownerSigner));
	}
	await activateCurrentRound(game_, contracts_.ownerSigner);
	const params_ = await readCstPricingParams(game_);
	const roundNum_ = await game_.roundNum();
	return { contracts_, game_, token_: contracts_.cosmicSignatureToken, params_, roundNum_, };
}

/** Asserts that the late-bid premium is zero at `timeStamp_`: it is at least the late-bid duration before `mainPrizeTime`. */
async function assertPremiumFreeAt(game_, params_, timeStamp_) {
	expect((await game_.mainPrizeTime()) - timeStamp_, `premium-free at ${timeStamp_}`).at.least(params_.roundLateBidDuration);
}

/** Pins the next block to `timeStamp_`, where the CST bid price must be zero, and places a CST bid allowing a zero price. */
async function bidWithCstForFreeAt(game_, bidder_, timeStamp_) {
	expect(await game_.getNextCstBidPriceAdvanced(timeStamp_ - (await getLatestBlockTimestamp())), `free at ${timeStamp_}`).equal(0n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).bidWithCst(0n, "", 0n));
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice).equal(0n);
	return receipt_;
}

/** The timestamp at which the current CST Dutch auction's base reaches zero. */
async function getCstDutchAuctionEndTimeStamp(game_) {
	return (await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
}

/**
The number of main prize time increments in the initial duration until main prize that the divisor was configured for
(24 by default: the divisor is a million over that count, rounded). `C` is that many `R`, minus the divisor's rounding.
*/
function getNumIncrementsInInitialDuration(params_) {
	const divisor_ = params_.initialDurationUntilMainPrizeDivisor;
	return (MICROSECONDS_PER_SECOND + divisor_ / 2n) / divisor_;
}

describe("CosmicSignatureGameV3-CstAdversarial", function () {
	it("holding the deadline with CST by two colluding accounts, one bid per main prize time increment, restarts at exactly 2 * (base + R) until the cap C, costs the pair net zero only on the first paid move, and moves the deadline exactly one increment per bid (I4)", async function () {
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round();
		const {
			bidCstRewardAmountMultiplier: multiplier_,
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			initialDurationUntilMainPrizeDivisor: divisor_,
			mainPrizeTimeIncrement: increment_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
		} = params_;
		const colluders_ = contracts_.signers.slice(1, 3);
		const [colluder1_, colluder2_] = colluders_;

		// The reward of holding for exactly one increment, and its shortfall from R caused by the increment being truncated
		// to whole seconds. The doc's figures assume no shortfall. Round 1's increment is 3636e6 microseconds, a whole number
		// of seconds, so the shortfall is zero here and the doc's figures are exact.
		const rewardPerWholeSecondIncrement_ = getV3BidCstRewardAmount(increment_, multiplier_, incrementUs_);
		const rewardShortfall_ = rewardPerIncrement_ - rewardPerWholeSecondIncrement_;
		expect(rewardShortfall_).equal(0n);

		// C is 24R minus the rounding of the divisor (41667 is a million over 24, rounded up), about 0.01 CST.
		const numIncrementsInInitialDuration_ = getNumIncrementsInInitialDuration(params_);
		expect(numIncrementsInInitialDuration_).equal(24n);
		const capRoundingShortfall_ = numIncrementsInInitialDuration_ * rewardPerIncrement_ - maxLimit_;
		expect(capRoundingShortfall_).at.least(0n);
		expect(capRoundingShortfall_).lessThan(rewardPerIncrement_ / 1000n);

		// The first ETH bid starts the first CST Dutch auction at C. Two ten-increment holds earn each colluder 10R
		// and leave the deadline two increments past the first auction end, outside the late-bid premium window.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, colluder1_, firstBidTimeStamp_);
		const holdDuration_ = 10n * increment_;
		await bidWithEthAt(game_, colluder2_, firstBidTimeStamp_ + holdDuration_);
		const lastSetupBidTimeStamp_ = firstBidTimeStamp_ + 2n * holdDuration_;
		await bidWithEthAt(game_, colluder1_, lastSetupBidTimeStamp_);
		const firstAuctionEndTimeStamp_ = await getCstDutchAuctionEndTimeStamp(game_);
		expect(firstAuctionEndTimeStamp_).greaterThan(lastSetupBidTimeStamp_);
		const freeBidRewardToColluder1_ = getV3BidCstRewardAmount(firstAuctionEndTimeStamp_ - lastSetupBidTimeStamp_, multiplier_, incrementUs_);

		// The JS mirror of the chain. Move 0 is colluder2's free bid exactly at the first auction end, which restarts the auction
		// at 2R. Move k >= 1 is placed one increment after move k - 1, by the colluders in turn, at the base S - reward(increment),
		// and restarts the auction at min(2 * (base + R), C) (Comment-202611024). Each move pays the other colluder reward(increment).
		const getPayer_ = (moveIndex_) => colluders_[(moveIndex_ % 2 === 0) ? 1 : 0];
		const numMoves_ = 6;
		const moves_ = [];
		{
			let beginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(0n, multiplier_, divisor_);
			expect(beginningPrice_).equal(2n * rewardPerIncrement_);
			for (let moveIndex_ = 1; moveIndex_ <= numMoves_; ++ moveIndex_) {
				const base_ = getV3CstBidPriceBase(beginningPrice_, increment_, multiplier_, incrementUs_);
				const uncappedRestart_ = 2n * (base_ + rewardPerIncrement_);
				const newBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_);
				expect(newBeginningPrice_).equal(minBigInt(uncappedRestart_, maxLimit_));
				moves_.push({
					base: base_,
					prevBeginningPrice: beginningPrice_,
					newBeginningPrice: newBeginningPrice_,
					isRestartCapped: uncappedRestart_ > maxLimit_,
					netCost: base_ - rewardPerWholeSecondIncrement_,
				});
				beginningPrice_ = newBeginningPrice_;
			}
		}

		// Without the cap, the bases would follow base(k) = 2 * base(k - 1) + R + shortfall, i.e. (2^k - 1) * (R + shortfall):
		// R, 3R, 7R, 15R, which are the doc's 60, 180, 420, 900 CST. The restart after 15R, 2 * (15R + R) = 32R, exceeds C,
		// so from then on each move pays C - R + shortfall, the doc's 1380 CST, and the restart stays at C.
		const docFiguresInCst_ = [60n, 180n, 420n, 900n, 1380n, 1380n];
		for (let moveIndex_ = 1; moveIndex_ <= numMoves_; ++ moveIndex_) {
			const move_ = moves_[moveIndex_ - 1];
			const description_ = `move ${moveIndex_}`;
			if (moveIndex_ <= 4) {
				const doublingFactor_ = (1n << BigInt(moveIndex_)) - 1n;
				expect(move_.base, description_).equal(doublingFactor_ * (rewardPerIncrement_ + rewardShortfall_));
				expect(move_.isRestartCapped, description_).equal(moveIndex_ === 4);
				expect(move_.base, description_).equal(docFiguresInCst_[moveIndex_ - 1] * ONE_CST);
			} else {
				expect(move_.prevBeginningPrice, description_).equal(maxLimit_);
				expect(move_.base, description_).equal(maxLimit_ - rewardPerWholeSecondIncrement_);
				expect(move_.isRestartCapped, description_).equal(true);
				expect(move_.newBeginningPrice, description_).equal(maxLimit_);
				expect(move_.base + capRoundingShortfall_ - rewardShortfall_, description_).equal(docFiguresInCst_[moveIndex_ - 1] * ONE_CST);
			}
		}

		// Funding. The colluders pay the chain out of what they earn by holding, the setup holds and the rewards the chain itself
		// mints, plus marketing rewards paid by the treasurer, the only other CST source in tests. Simulate the chain to find
		// each colluder's deepest shortfall and fund it with a margin of one R.
		{
			const runningBalances_ = new Map();
			const shortfalls_ = new Map();
			for (const colluder_ of colluders_) {
				runningBalances_.set(colluder_.address, await token_.balanceOf(colluder_.address));
				shortfalls_.set(colluder_.address, 0n);
			}
			const credit_ = (address_, amount_) => {
				runningBalances_.set(address_, runningBalances_.get(address_) + amount_);
				if (( - runningBalances_.get(address_) ) > shortfalls_.get(address_)) {
					shortfalls_.set(address_, ( - runningBalances_.get(address_) ));
				}
			};
			credit_(colluder1_.address, freeBidRewardToColluder1_);
			for (let moveIndex_ = 1; moveIndex_ <= numMoves_; ++ moveIndex_) {
				credit_(getPayer_(moveIndex_).address, ( - moves_[moveIndex_ - 1].base ));
				credit_(getPayer_(moveIndex_ + 1).address, rewardPerWholeSecondIncrement_);
			}
			for (const colluder_ of colluders_) {
				const shortfall_ = shortfalls_.get(colluder_.address);
				if (shortfall_ > 0n) {
					await payCstFromMarketingWallet(contracts_, colluder_.address, shortfall_ + rewardPerIncrement_);
				}
			}
		}

		// Move 0: the free bid.
		{
			await assertPremiumFreeAt(game_, params_, firstAuctionEndTimeStamp_);
			const mainPrizeTimeBefore_ = await game_.mainPrizeTime();
			const receipt_ = await bidWithCstForFreeAt(game_, colluder2_, firstAuctionEndTimeStamp_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(2n * rewardPerIncrement_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(freeBidRewardToColluder1_);
			expect(await game_.mainPrizeTime()).equal(mainPrizeTimeBefore_ + increment_);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(0n);
		}

		// Moves 1 to 6, each checked against the mirror, the token balances, and the deadline.
		let totalBurned_ = 0n;
		let totalRewardsMintedByMoves_ = 0n;
		let bidTimeStamp_ = firstAuctionEndTimeStamp_;
		for (let moveIndex_ = 1; moveIndex_ <= numMoves_; ++ moveIndex_) {
			const move_ = moves_[moveIndex_ - 1];
			const payer_ = getPayer_(moveIndex_);
			const other_ = getPayer_(moveIndex_ + 1);
			const description_ = `move ${moveIndex_}`;
			bidTimeStamp_ += increment_;
			await assertPremiumFreeAt(game_, params_, bidTimeStamp_);
			const currentTimeOffset_ = bidTimeStamp_ - (await getLatestBlockTimestamp());
			expect(await game_.getNextCstBidPriceBaseAdvanced(currentTimeOffset_), description_).equal(move_.base);
			expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_), description_).equal(move_.base);
			expect(await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_), description_).equal(rewardPerWholeSecondIncrement_);
			expect(await token_.balanceOf(payer_.address), `${description_}: funding`).at.least(move_.base);
			const mainPrizeTimeBefore_ = await game_.mainPrizeTime();
			const payerBalanceBefore_ = await token_.balanceOf(payer_.address);
			const otherBalanceBefore_ = await token_.balanceOf(other_.address);
			const totalSupplyBefore_ = await token_.totalSupply();
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, payer_, bidTimeStamp_);
			expect(cstBidPrice_, description_).equal(move_.base);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.lastBidderAddress, description_).equal(payer_.address);
			expect(bidPlaced_.args.paidCstPrice, description_).equal(move_.base);
			expect(bidPlaced_.args.bidCstRewardAmount, description_).equal(rewardPerWholeSecondIncrement_);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(move_.newBeginningPrice);
			expect(await game_.cstDutchAuctionBeginningBidPrice(), description_).equal(move_.newBeginningPrice);
			expect(await game_.cstDutchAuctionBeginningTimeStamp(), description_).equal(bidTimeStamp_);
			expect(await game_.mainPrizeTime(), description_).equal(mainPrizeTimeBefore_ + increment_);
			expect(payerBalanceBefore_ - (await token_.balanceOf(payer_.address)), description_).equal(move_.base);
			expect((await token_.balanceOf(other_.address)) - otherBalanceBefore_, description_).equal(rewardPerWholeSecondIncrement_);
			expect(totalSupplyBefore_ - (await token_.totalSupply()), description_).equal(move_.netCost);

			// The pair's net cost: what the move burns minus what the other colluder gets back. The first paid move is a wash
			// (the doc's 60 paid against 60 received); every later move destroys CST, more on each move until the cap,
			// so no stationary hold exists.
			if (moveIndex_ === 1) {
				expect(move_.netCost, description_).equal(2n * rewardShortfall_);
				expect(move_.netCost, description_).equal(0n);
			} else {
				expect(move_.netCost, description_).greaterThan(0n);
				const prevMove_ = moves_[moveIndex_ - 2];
				if (move_.prevBeginningPrice === maxLimit_ && prevMove_.prevBeginningPrice === maxLimit_) {
					expect(move_.netCost, description_).equal(prevMove_.netCost);
				} else {
					expect(move_.netCost, description_).greaterThan(prevMove_.netCost);
				}
			}
			expect(await getLastBidRaffleWeight(game_, roundNum_), description_)
				.equal(getV3CstBidRaffleWeight(ethBidPriceBase_, move_.base, move_.prevBeginningPrice));
			totalBurned_ += move_.base;
			totalRewardsMintedByMoves_ += rewardPerWholeSecondIncrement_;
		}
		expect(totalBurned_).equal(moves_.reduce((sum_, move_) => sum_ + move_.base, 0n));

		// The six moves burn the doc's 4,320 CST in total, less the cap rounding of the two capped moves
		// (the reward shortfall, which would add to the bases, is zero in this round, as asserted above).
		expect(totalBurned_ + 2n * capRoundingShortfall_)
			.equal(docFiguresInCst_.reduce((sum_, figure_) => sum_ + figure_, 0n) * ONE_CST);
		expect((await game_.roundStats(roundNum_)).totalSpentCstAmount).equal(totalBurned_);
		expect(totalBurned_ - totalRewardsMintedByMoves_).greaterThan(0n);
		await finishGameRound(contracts_, game_);
	});

	it("a camper placing only free CST bids gets at most one free bid per two increments, with zero raffle weight each, moves the deadline one increment per bid, cannot keep the round alive for free once the ETH bidders stop, and never wins a bidder raffle draw (I1, I5)", async function () {
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round();
		const {
			bidCstRewardAmountMultiplier: multiplier_,
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			mainPrizeTimeIncrement: increment_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			roundLateBidDuration: roundLateBidDuration_,
		} = params_;
		const [ethBidder1_, ethBidder2_, camper_] = contracts_.signers.slice(1, 4);
		const ethBidders_ = [ethBidder1_, ethBidder2_];
		const ethBidderAddresses_ = ethBidders_.map((ethBidder_) => ethBidder_.address);
		const numCycles_ = scaleWithTestMode(3, 6, 12);

		/** Places an ETH bid at `timeStamp_` and tracks its raffle weight, which is its premium-free price (Comment-202609098). */
		let ethTotalWeight_ = 0n;
		const bidWithEthAndTrackWeight_ = async (ethBidder_, timeStamp_) => {
			const ethBidPriceBase_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - (await getLatestBlockTimestamp()));
			const receipt_ = await bidWithEthAt(game_, ethBidder_, timeStamp_);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidEthPrice).equal(ethBidPriceBase_);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
			ethTotalWeight_ += ethBidPriceBase_;
		};

		// Two ETH bids open the round. The first starts the first CST Dutch auction at C (Comment-202611025); the second
		// pushes the deadline one increment past the auction end, so the camper's first free bid, exactly at the auction end,
		// is outside the late-bid premium window. From then on every bid keeps that distance, because each bid moves the
		// deadline by one increment and the bids below are spaced one increment apart.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAndTrackWeight_(ethBidder1_, firstBidTimeStamp_);
		await bidWithEthAndTrackWeight_(ethBidder2_, firstBidTimeStamp_ + 1n);
		let lastBidTimeStamp_ = firstBidTimeStamp_ + 1n;
		const firstAuctionEndTimeStamp_ = await getCstDutchAuctionEndTimeStamp(game_);
		expect(firstAuctionEndTimeStamp_ - firstBidTimeStamp_).equal(getV3CstDutchAuctionDuration(maxLimit_, multiplier_, incrementUs_));

		// I1: a free bid restarts the auction at 2R, so the base is zero again no earlier than ceil(2R * increment / multiplier)
		// seconds later, which is two increments up to rounding, and `getCstDutchAuctionDurations` reports exactly that.
		const freeBidSpacing_ = getV3CstDutchAuctionDuration(2n * rewardPerIncrement_, multiplier_, incrementUs_);
		expect(freeBidSpacing_).equal((2n * rewardPerIncrement_ * incrementUs_ + multiplier_ - 1n) / multiplier_);
		expect(freeBidSpacing_).at.least(2n * increment_);
		expect(freeBidSpacing_).at.most(2n * increment_ + 2n);

		/** The camper's free bid at `campTimeStamp_`, which must be the current auction's end. */
		const placeCampingBid_ = async (campTimeStamp_, description_) => {
			const latestTimeStamp_ = await getLatestBlockTimestamp();

			// One second earlier the base is still positive, so the bid would not be free.
			expect(await game_.getNextCstBidPriceBaseAdvanced(campTimeStamp_ - 1n - latestTimeStamp_), description_).greaterThan(0n);
			expect(await game_.getNextCstBidPriceBaseAdvanced(campTimeStamp_ - latestTimeStamp_), description_).equal(0n);

			await assertPremiumFreeAt(game_, params_, campTimeStamp_);
			const mainPrizeTimeBefore_ = await game_.mainPrizeTime();
			const camperBalanceBefore_ = await token_.balanceOf(camper_.address);
			const receipt_ = await bidWithCstForFreeAt(game_, camper_, campTimeStamp_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(2n * rewardPerIncrement_);

			// The reward of the hold goes to the bidder being outbid, never to the camper for its own bid.
			expect(bidPlaced_.args.bidCstRewardAmount, description_)
				.equal(getV3BidCstRewardAmount(campTimeStamp_ - lastBidTimeStamp_, multiplier_, incrementUs_));
			expect(await token_.balanceOf(camper_.address), description_).equal(camperBalanceBefore_);

			// I5: a free bid buys the last bidder position, not a raffle ticket.
			expect(await getLastBidRaffleWeight(game_, roundNum_), description_).equal(0n);
			expect(await game_.lastBidderAddress(), description_).equal(camper_.address);

			expect(await game_.mainPrizeTime(), description_).equal(mainPrizeTimeBefore_ + increment_);
			const [duration_, elapsedDuration_] = await game_.getCstDutchAuctionDurations();
			expect(duration_, description_).equal(freeBidSpacing_);
			expect(elapsedDuration_, description_).equal(0n);

			// Holding the position for the whole cycle would earn two increments of reward, the most a camper can earn per cycle.
			const wholeCycleReward_ = await game_.getBidCstRewardAmountAdvanced(freeBidSpacing_);
			expect(wholeCycleReward_, description_).equal(getV3BidCstRewardAmount(freeBidSpacing_, multiplier_, incrementUs_));
			expect(wholeCycleReward_, description_).at.least(2n * rewardPerIncrement_);
			expect(wholeCycleReward_, description_).at.most(2n * rewardPerIncrement_ + 2n * multiplier_ / incrementUs_ + 1n);
			lastBidTimeStamp_ = campTimeStamp_;
		};

		let campTimeStamp_ = firstAuctionEndTimeStamp_;
		for (let cycleIndex_ = 0; cycleIndex_ < numCycles_; ++ cycleIndex_) {
			await placeCampingBid_(campTimeStamp_, `cycle ${cycleIndex_}`);

			// An ETH bidder answers one increment later: the camper earns R for the hold, and the deadline moves one more increment.
			const ethBidTimeStamp_ = campTimeStamp_ + increment_;
			await assertPremiumFreeAt(game_, params_, ethBidTimeStamp_);
			const camperBalanceBefore_ = await token_.balanceOf(camper_.address);
			const mainPrizeTimeBefore_ = await game_.mainPrizeTime();
			await bidWithEthAndTrackWeight_(ethBidders_[cycleIndex_ % 2], ethBidTimeStamp_);
			expect((await token_.balanceOf(camper_.address)) - camperBalanceBefore_, `cycle ${cycleIndex_}`)
				.equal(getV3BidCstRewardAmount(increment_, multiplier_, incrementUs_));
			expect(await game_.mainPrizeTime()).equal(mainPrizeTimeBefore_ + increment_);
			lastBidTimeStamp_ = ethBidTimeStamp_;
			campTimeStamp_ += freeBidSpacing_;
		}
		await placeCampingBid_(campTimeStamp_, "final cycle");

		// The ETH bidders stop. The camper's next zero-base moment, one cycle later, lies past the deadline (by exactly one
		// second with the default parameters: the initial duration is one second short of 24 increments), and the CST bid
		// price is positive at every second from the premium window opening through that moment, so the camper can keep the
		// round alive only by paying. The contract confirms the mirror at the window opening, the deadline, and the auction end,
		// where the price is the full premium calculated from R (Comment-202611026), the idle-auction snipe of about 4R.
		{
			const deadline_ = await game_.mainPrizeTime();
			const auctionEndTimeStamp_ = campTimeStamp_ + freeBidSpacing_;
			expect(auctionEndTimeStamp_).greaterThan(deadline_);
			const getMirroredPriceAt_ = (timeStamp_) =>
				getCstBidPriceAt(
					params_,
					getV3CstBidPriceBase(2n * rewardPerIncrement_, timeStamp_ - campTimeStamp_, multiplier_, incrementUs_),
					deadline_ - timeStamp_
				);
			for (let timeStamp_ = deadline_ - roundLateBidDuration_; timeStamp_ <= auctionEndTimeStamp_ + 1n; ++ timeStamp_) {
				expect(getMirroredPriceAt_(timeStamp_), `price at ${timeStamp_}`).greaterThan(0n);
			}
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			for (const timeStamp_ of [
				deadline_ - roundLateBidDuration_,
				deadline_ - roundLateBidDuration_ / 2n,
				deadline_,
				auctionEndTimeStamp_,
				auctionEndTimeStamp_ + 1n,
			]) {
				const price_ = await game_.getNextCstBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
				expect(price_, `price at ${timeStamp_}`).equal(getMirroredPriceAt_(timeStamp_));
				expect(price_, `price at ${timeStamp_}`).greaterThan(0n);
			}
			expect(getMirroredPriceAt_(auctionEndTimeStamp_))
				.equal(getRoundLateBidPricePremiumAmountAt(params_, rewardPerIncrement_, deadline_ - auctionEndTimeStamp_));
			expect(getMirroredPriceAt_(auctionEndTimeStamp_)).greaterThan(4n * rewardPerIncrement_ * 99n / 100n);
		}

		// The camper, being the last bidder, claims at the deadline. The raffle never draws it: every bidder raffle winner is
		// an ETH bidder, and the total weight is the ETH bidders' alone (Comment-202611029).
		const claimReceipt_ = await finishGameRound(contracts_, game_);
		await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
		const winnerAddresses_ = await getBidderRaffleWinnerAddresses(game_, claimReceipt_);
		for (const winnerAddress_ of winnerAddresses_) {
			expect(ethBidderAddresses_).include(winnerAddress_);
		}
		expect(winnerAddresses_).not.include(camper_.address);
		const { bidderAddresses: bidderAddresses_, totalWeight: totalWeight_ } = await readBidRaffleData(game_, roundNum_);
		expect(totalWeight_).equal(ethTotalWeight_);
		expect(bidderAddresses_.filter((bidderAddress_) => bidderAddress_ === camper_.address).length).equal(numCycles_ + 1);
	});

	it("snipes at the deadline are never free: a CST bid on an idle auction costs the full premium of R, about 4R; a CST bid at the next deadline after a zero-base bid costs about 5R; an ETH bid costs about five times its base (rule 3)", async function () {
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round();
		const {
			bidCstRewardAmountMultiplier: multiplier_,
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			initialDurationUntilMainPrizeDivisor: divisor_,
			mainPrizeTimeIncrement: increment_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			roundLateBidDuration: roundLateBidDuration_,
		} = params_;
		const [sniper1_, sniper2_] = contracts_.signers.slice(1, 3);

		// Three ETH bids with two holds of ten increments earn each sniper about 10R, enough for the CST snipes below,
		// and leave the deadline two increments past the first auction end, so the auction is idle at the deadline.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, sniper1_, firstBidTimeStamp_);
		const holdDuration_ = 10n * increment_ + 1n;
		await bidWithEthAt(game_, sniper2_, firstBidTimeStamp_ + holdDuration_);
		const lastSetupBidTimeStamp_ = firstBidTimeStamp_ + 2n * holdDuration_;
		await bidWithEthAt(game_, sniper1_, lastSetupBidTimeStamp_);
		const holdReward_ = getV3BidCstRewardAmount(holdDuration_, multiplier_, incrementUs_);
		expect(holdReward_).at.least(10n * rewardPerIncrement_);
		expect(await token_.balanceOf(sniper1_.address)).at.least(holdReward_);
		expect(await token_.balanceOf(sniper2_.address)).at.least(holdReward_);
		const deadline1_ = await game_.mainPrizeTime();
		expect(await getCstDutchAuctionEndTimeStamp(game_)).at.most(deadline1_);
		expect(await game_.getNextCstBidPriceBaseAdvanced(deadline1_ - (await getLatestBlockTimestamp()))).equal(0n);

		// The full premium of R: the price of a CST bid at a zero base at or after the deadline. The premium multiplier is
		// (lateBidDuration * baseMultiplier / increment)^8 / 2^104 (Comment-202607119), about 4.00005, so the doc's 240 CST
		// is accurate to a fraction of a percent. The price is flat beyond the deadline.
		const fullPremiumOfR_ = getRoundLateBidPricePremiumAmountAt(params_, rewardPerIncrement_, 0n);
		expect(fullPremiumOfR_).greaterThan(240n * ONE_CST * 999n / 1000n);
		expect(fullPremiumOfR_).lessThan(240n * ONE_CST * 1001n / 1000n);
		{
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			for (const timeStamp_ of [deadline1_, deadline1_ + 1n, deadline1_ + roundLateBidDuration_, deadline1_ + 7n * SECONDS_PER_DAY]) {
				expect(await game_.getNextCstBidPriceAdvanced(timeStamp_ - latestTimeStamp_), `at ${timeStamp_}`).equal(fullPremiumOfR_);
			}
		}

		// Snipe 1: sniper2 bids CST exactly at the deadline on the idle auction. The premium is a toll, not a ticket:
		// the bid has a zero base, so a zero raffle weight, and still restarts the auction at only 2R.
		{
			const sniper1BalanceBefore_ = await token_.balanceOf(sniper1_.address);
			const sniper2BalanceBefore_ = await token_.balanceOf(sniper2_.address);
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, sniper2_, deadline1_);
			expect(cstBidPrice_).equal(fullPremiumOfR_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.paidCstPrice).equal(fullPremiumOfR_);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(2n * rewardPerIncrement_);
			const expectedReward_ = getV3BidCstRewardAmount(deadline1_ - lastSetupBidTimeStamp_, multiplier_, incrementUs_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(expectedReward_);
			expect(sniper2BalanceBefore_ - (await token_.balanceOf(sniper2_.address))).equal(fullPremiumOfR_);
			expect((await token_.balanceOf(sniper1_.address)) - sniper1BalanceBefore_).equal(expectedReward_);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(0n);
			expect(await game_.mainPrizeTime()).equal(deadline1_ + increment_);
		}

		// Snipe 2: sniper1 bids CST at the new deadline, one increment after the zero-base bid. The base has declined from 2R
		// to R, so the premium is calculated from the base itself, and the price is about 5R, the doc's 300 CST.
		let snipe2Price_;
		{
			const deadline2_ = await game_.mainPrizeTime();
			const base_ = getV3CstBidPriceBase(2n * rewardPerIncrement_, increment_, multiplier_, incrementUs_);
			expect(base_).equal(rewardPerIncrement_);
			snipe2Price_ = getCstBidPriceAt(params_, base_, 0n);
			expect(snipe2Price_).equal(base_ + getRoundLateBidPricePremiumAmountAt(params_, base_, 0n));
			expect(snipe2Price_).greaterThan(300n * ONE_CST * 999n / 1000n);
			expect(snipe2Price_).lessThan(300n * ONE_CST * 1001n / 1000n);
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const sniper2BalanceBefore_ = await token_.balanceOf(sniper2_.address);
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, sniper1_, deadline2_);
			expect(cstBidPrice_).equal(snipe2Price_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.paidCstPrice).equal(snipe2Price_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(getV3BidCstRewardAmount(increment_, multiplier_, incrementUs_));
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_));
			expect((await token_.balanceOf(sniper2_.address)) - sniper2BalanceBefore_).equal(bidPlaced_.args.bidCstRewardAmount);

			// Half the asking price buys half a ticket (Comment-202611027).
			const bidRaffleWeight_ = await getLastBidRaffleWeight(game_, roundNum_);
			expect(bidRaffleWeight_).equal(getV3CstBidRaffleWeight(ethBidPriceBase_, base_, 2n * rewardPerIncrement_));
			expect(bidRaffleWeight_).equal(ethBidPriceBase_ / 2n);
			expect(await game_.mainPrizeTime()).equal(deadline2_ + increment_);
		}

		// Snipe 3: sniper2 bids ETH at the next deadline. The ETH premium is calculated from the ETH bid price base and buys
		// no raffle weight. The exact multiplier is 1 + (lateBidDuration * baseMultiplier / increment)^8 / 2^104, about 5.00005;
		// the doc's "4.99 times the base" is that figure rounded to about a percent.
		{
			const deadline3_ = await game_.mainPrizeTime();
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const expectedPrice_ = getEthBidPriceAt(params_, ethBidPriceBase_, 0n);
			expect(await game_.getNextEthBidPriceAdvanced(deadline3_ - (await getLatestBlockTimestamp()))).equal(expectedPrice_);
			expect(expectedPrice_ * 100n).at.least(499n * ethBidPriceBase_);
			expect(expectedPrice_ * 100n).at.most(501n * ethBidPriceBase_);
			const sniper1BalanceBefore_ = await token_.balanceOf(sniper1_.address);
			const receipt_ = await bidWithEthAt(game_, sniper2_, deadline3_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.paidEthPrice).equal(expectedPrice_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(getV3BidCstRewardAmount(increment_, multiplier_, incrementUs_));
			expect((await token_.balanceOf(sniper1_.address)) - sniper1BalanceBefore_).equal(bidPlaced_.args.bidCstRewardAmount);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
			expect(await game_.mainPrizeTime()).equal(deadline3_ + increment_);
		}

		// No currency snipes for free, and the idle-auction snipe is the cheapest CST snipe.
		expect(fullPremiumOfR_).greaterThan(0n);
		expect(fullPremiumOfR_).lessThan(snipe2Price_);
		await finishGameRound(contracts_, game_);
	});

	it("an ETH answer defuses a CST escalation only once: with ETH answering two thirds of an increment after each CST bid and CST replying two thirds of an increment later, the CST side pays the mirror recursion, 40, 120, 280, 600, 1240 CST and then the cap minus the decline, while the ETH side pays one percent more per bid", async function () {
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round();
		const {
			bidCstRewardAmountMultiplier: multiplier_,
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			initialDurationUntilMainPrizeDivisor: divisor_,
			mainPrizeTimeIncrement: increment_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
		} = params_;
		const [cstBidder_, ethBidder_] = contracts_.signers.slice(1, 3);
		const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();

		// The doc's row ("82 minutes after the previous CST bid") spaces the CST bids by four thirds of the live increment:
		// the ETH answer comes two thirds of an increment after a CST bid, and the CST reply two thirds of an increment later.
		// Round 1's increment of 3636 seconds makes both delays whole seconds and the decline over a CST spacing exactly 4R / 3,
		// which is what the doc's figures assume.
		const answerDelay_ = increment_ * 2n / 3n;
		const cstBidSpacing_ = 2n * answerDelay_;
		const declinePerCstSpacing_ = getV3BidCstRewardAmount(cstBidSpacing_, multiplier_, incrementUs_);
		expect(declinePerCstSpacing_ * 3n).equal(4n * rewardPerIncrement_);
		const capRoundingShortfall_ = getNumIncrementsInInitialDuration(params_) * rewardPerIncrement_ - maxLimit_;
		expect(capRoundingShortfall_).lessThan(rewardPerIncrement_ / 1000n);

		// The mirror recursion: the first CST bid is free, then base(k) = 2 * (base(k - 1) + R) - 4R / 3 until the restart
		// hits the cap, after which each CST bid pays C - 4R / 3.
		const numCstMoves_ = 6;
		const moves_ = [];
		{
			let beginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(0n, multiplier_, divisor_);
			for (let moveIndex_ = 1; moveIndex_ <= numCstMoves_; ++ moveIndex_) {
				const base_ = getV3CstBidPriceBase(beginningPrice_, cstBidSpacing_, multiplier_, incrementUs_);
				const newBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_);
				moves_.push({ base: base_, prevBeginningPrice: beginningPrice_, newBeginningPrice: newBeginningPrice_, });
				beginningPrice_ = newBeginningPrice_;
			}
		}
		const docFiguresInCst_ = [40n, 120n, 280n, 600n, 1240n];
		for (let moveIndex_ = 1; moveIndex_ <= docFiguresInCst_.length; ++ moveIndex_) {
			const move_ = moves_[moveIndex_ - 1];
			expect(move_.base, `move ${moveIndex_}`).equal(docFiguresInCst_[moveIndex_ - 1] * ONE_CST);
			expect(move_.newBeginningPrice, `move ${moveIndex_}`).equal((moveIndex_ < 5) ? (2n * (move_.base + rewardPerIncrement_)) : maxLimit_);
		}

		// After 1240, the doc lists 1360 CST per move at the cap: C - 4R / 3, the cap minus the decline over 82 minutes.
		expect(moves_[5].prevBeginningPrice).equal(maxLimit_);
		expect(moves_[5].base + capRoundingShortfall_).equal(1360n * ONE_CST);
		expect(moves_[5].newBeginningPrice).equal(maxLimit_);

		// The ETH bidder opens the round; the CST bidder places the second bid and holds the position until the first auction
		// ends, which earns it about C when its own free bid outbids it. The treasurer funds the rest of the CST it will pay.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, ethBidder_, firstBidTimeStamp_);
		await bidWithEthAt(game_, cstBidder_, firstBidTimeStamp_ + 1n);
		const firstAuctionEndTimeStamp_ = await getCstDutchAuctionEndTimeStamp(game_);
		{
			const holdReward_ = getV3BidCstRewardAmount(firstAuctionEndTimeStamp_ - (firstBidTimeStamp_ + 1n), multiplier_, incrementUs_);
			const rewardsFromAnswers_ = BigInt(numCstMoves_) * getV3BidCstRewardAmount(answerDelay_, multiplier_, incrementUs_);
			const totalToPay_ = moves_.reduce((sum_, move_) => sum_ + move_.base, 0n);
			await payCstFromMarketingWallet(contracts_, cstBidder_.address, totalToPay_ - holdReward_ - rewardsFromAnswers_ + rewardPerIncrement_);
		}
		await assertPremiumFreeAt(game_, params_, firstAuctionEndTimeStamp_);
		await bidWithCstForFreeAt(game_, cstBidder_, firstAuctionEndTimeStamp_);
		expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(moves_[0].prevBeginningPrice);

		// The alternation. Every bid moves the deadline by one increment while the bids are two thirds of an increment apart,
		// so the distance to the deadline grows and no bid pays a premium.
		let cstBidTimeStamp_ = firstAuctionEndTimeStamp_;
		let expectedEthBidPriceBase_ = await game_.nextEthBidPrice();
		let prevEthPricePaid_ = 0n;
		for (let moveIndex_ = 1; moveIndex_ <= numCstMoves_; ++ moveIndex_) {
			const move_ = moves_[moveIndex_ - 1];
			const description_ = `move ${moveIndex_}`;

			// The ETH answer: its price is the previous base plus one percent plus one Wei (Comment-202501061), with no premium.
			const ethBidTimeStamp_ = cstBidTimeStamp_ + answerDelay_;
			await assertPremiumFreeAt(game_, params_, ethBidTimeStamp_);
			expect(await game_.nextEthBidPrice(), description_).equal(expectedEthBidPriceBase_);
			const cstBidderBalanceBefore_ = await token_.balanceOf(cstBidder_.address);
			const ethReceipt_ = await bidWithEthAt(game_, ethBidder_, ethBidTimeStamp_);
			const ethBidPlaced_ = findParsedEvent(ethReceipt_, game_, "BidPlaced");
			expect(ethBidPlaced_.args.paidEthPrice, description_).equal(expectedEthBidPriceBase_);
			expect(ethBidPlaced_.args.paidEthPrice, description_).greaterThan(prevEthPricePaid_);
			prevEthPricePaid_ = ethBidPlaced_.args.paidEthPrice;
			expect(ethBidPlaced_.args.bidCstRewardAmount, description_).equal(getV3BidCstRewardAmount(answerDelay_, multiplier_, incrementUs_));
			expect((await token_.balanceOf(cstBidder_.address)) - cstBidderBalanceBefore_, description_).equal(ethBidPlaced_.args.bidCstRewardAmount);
			expect(ethBidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(move_.prevBeginningPrice);
			const ethBidPriceBase_ = tryIncreaseValueExponentially(expectedEthBidPriceBase_, ethBidPriceIncreaseDivisor_) + 1n;
			expect(await game_.nextEthBidPrice(), description_).equal(ethBidPriceBase_);
			expectedEthBidPriceBase_ = ethBidPriceBase_;

			// The CST reply.
			cstBidTimeStamp_ += cstBidSpacing_;
			await assertPremiumFreeAt(game_, params_, cstBidTimeStamp_);
			const currentTimeOffset_ = cstBidTimeStamp_ - (await getLatestBlockTimestamp());
			expect(await game_.getNextCstBidPriceBaseAdvanced(currentTimeOffset_), description_).equal(move_.base);
			expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_), description_).equal(move_.base);
			const ethBidderBalanceBefore_ = await token_.balanceOf(ethBidder_.address);
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, cstBidder_, cstBidTimeStamp_);
			expect(cstBidPrice_, description_).equal(move_.base);
			const cstBidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(cstBidPlaced_.args.paidCstPrice, description_).equal(move_.base);
			expect(cstBidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(move_.newBeginningPrice);
			expect(cstBidPlaced_.args.bidCstRewardAmount, description_).equal(getV3BidCstRewardAmount(answerDelay_, multiplier_, incrementUs_));
			expect((await token_.balanceOf(ethBidder_.address)) - ethBidderBalanceBefore_, description_).equal(cstBidPlaced_.args.bidCstRewardAmount);
			expect(await getLastBidRaffleWeight(game_, roundNum_), description_)
				.equal(getV3CstBidRaffleWeight(ethBidPriceBase_, move_.base, move_.prevBeginningPrice));
			if (moveIndex_ > 1) {
				expect(move_.base, description_).greaterThan(moves_[moveIndex_ - 2].base);
			}
		}
		expect((await game_.roundStats(roundNum_)).totalSpentCstAmount).equal(moves_.reduce((sum_, move_) => sum_ + move_.base, 0n));
		await finishGameRound(contracts_, game_);
	});

	it("a CST bid by the current last bidder burns the price and mints the reward to the same account in one transaction, netting reward minus price, and restarts the auction exactly as a bid by a different account would", async function () {
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round();
		const {
			bidCstRewardAmountMultiplier: multiplier_,
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			initialDurationUntilMainPrizeDivisor: divisor_,
			mainPrizeTimeIncrement: increment_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
		} = params_;
		const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);

		// bidder1 holds the position for the last eight increments before the CST bid under test; bidder2 held eight before that.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
		await bidWithEthAt(game_, bidder2_, firstBidTimeStamp_ + 1n);
		const lastSetupBidTimeStamp_ = firstBidTimeStamp_ + 1n + 8n * increment_;
		await bidWithEthAt(game_, bidder1_, lastSetupBidTimeStamp_);
		await payCstFromMarketingWallet(contracts_, bidder1_.address, 10n * rewardPerIncrement_);
		await payCstFromMarketingWallet(contracts_, bidder2_.address, 2n * rewardPerIncrement_);

		// The CST bid under test, seven increments later, pays a base of about 9R and restarts the auction below the cap,
		// so that the restart depends on the base paid. Both branches below place it at the same timestamp.
		const holdDuration_ = 7n * increment_;
		const bidTimeStamp_ = lastSetupBidTimeStamp_ + holdDuration_;
		const base_ = getV3CstBidPriceBase(maxLimit_, bidTimeStamp_ - firstBidTimeStamp_, multiplier_, incrementUs_);
		expect(base_).greaterThan(rewardPerIncrement_);
		await assertPremiumFreeAt(game_, params_, bidTimeStamp_);
		const expectedReward_ = getV3BidCstRewardAmount(holdDuration_, multiplier_, incrementUs_);
		const expectedNewBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_);
		expect(expectedNewBeginningPrice_).lessThan(maxLimit_);
		const ethBidPriceBase_ = await game_.nextEthBidPrice();
		const expectedBidRaffleWeight_ = getV3CstBidRaffleWeight(ethBidPriceBase_, base_, maxLimit_);
		for (const bidder_ of [bidder1_, bidder2_]) {
			expect(await token_.balanceOf(bidder_.address)).at.least(base_);
		}

		/** Places the CST bid under test by `bidder_`, checks its events, and returns the balance changes and the resulting auction state. */
		const placeCstBidAndReadOutcome_ = async (bidder_) => {
			const bidder1BalanceBefore_ = await token_.balanceOf(bidder1_.address);
			const bidder2BalanceBefore_ = await token_.balanceOf(bidder2_.address);
			const totalSupplyBefore_ = await token_.totalSupply();
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, bidder_, bidTimeStamp_);
			expect(cstBidPrice_).equal(base_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.lastBidderAddress).equal(bidder_.address);
			expect(bidPlaced_.args.paidCstPrice).equal(base_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(expectedReward_);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(expectedNewBeginningPrice_);

			// `CosmicSignatureToken.mintAndBurnMany` burns the price from the bidder, then mints the reward to the outbid bidder.
			const transfers_ = classifyCstTransferEvents(receipt_, token_);
			expect(transfers_.all).deep.equal([
				{ from: bidder_.address, to: hre.ethers.ZeroAddress, value: base_, },
				{ from: hre.ethers.ZeroAddress, to: bidder1_.address, value: expectedReward_, },
			]);

			return {
				bidder1BalanceChange: (await token_.balanceOf(bidder1_.address)) - bidder1BalanceBefore_,
				bidder2BalanceChange: (await token_.balanceOf(bidder2_.address)) - bidder2BalanceBefore_,
				totalSupplyChange: (await token_.totalSupply()) - totalSupplyBefore_,
				auctionState: {
					beginningPrice: await game_.cstDutchAuctionBeginningBidPrice(),
					beginningTimeStamp: await game_.cstDutchAuctionBeginningTimeStamp(),
					mainPrizeTime: await game_.mainPrizeTime(),
					nextEthBidPrice: await game_.nextEthBidPrice(),
					numBids: (await game_.roundStats(roundNum_)).numBids,
					lastBidRaffleWeight: await getLastBidRaffleWeight(game_, roundNum_),
					nextCstBidPriceBaseOneIncrementLater: await game_.getNextCstBidPriceBaseAdvanced(increment_),
				},
			};
		};

		// Branch 1: the last bidder outbids itself.
		const latestTimeStampBeforeSnapshot_ = await getLatestBlockTimestamp();
		const snapshotId_ = await hre.ethers.provider.send("evm_snapshot", []);
		const selfOutbidOutcome_ = await placeCstBidAndReadOutcome_(bidder1_);
		expect(selfOutbidOutcome_.bidder1BalanceChange).equal(expectedReward_ - base_);
		expect(selfOutbidOutcome_.bidder2BalanceChange).equal(0n);
		expect(selfOutbidOutcome_.totalSupplyChange).equal(expectedReward_ - base_);
		expect(await game_.lastCstBidderAddress()).equal(bidder1_.address);

		// Branch 2: the same bid by a different account, from the same state.
		expect(await hre.ethers.provider.send("evm_revert", [snapshotId_])).equal(true);
		bidder1_.reset();
		bidder2_.reset();
		expect(await getLatestBlockTimestamp()).equal(latestTimeStampBeforeSnapshot_);
		const otherBidderOutcome_ = await placeCstBidAndReadOutcome_(bidder2_);
		expect(otherBidderOutcome_.bidder1BalanceChange).equal(expectedReward_);
		expect(otherBidderOutcome_.bidder2BalanceChange).equal( - base_ );
		expect(otherBidderOutcome_.totalSupplyChange).equal(expectedReward_ - base_);
		expect(await game_.lastCstBidderAddress()).equal(bidder2_.address);

		// The restart, the deadline, the raffle weight, and the next price do not depend on who placed the bid.
		expect(otherBidderOutcome_.auctionState).deep.equal(selfOutbidOutcome_.auctionState);
		expect(otherBidderOutcome_.auctionState.beginningPrice).equal(expectedNewBeginningPrice_);
		expect(otherBidderOutcome_.auctionState.beginningTimeStamp).equal(bidTimeStamp_);
		expect(otherBidderOutcome_.auctionState.lastBidRaffleWeight).equal(expectedBidRaffleWeight_);
		await finishGameRound(contracts_, game_);
	});

	it("a bidder contract that rejects or burns all gas on every incoming call can place CST bids and receives its bid CST rewards by plain minting, cannot block later ETH or CST bids, and is never called back (Comment-202607163)", async function () {
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round();
		const {
			bidCstRewardAmountMultiplier: multiplier_,
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			initialDurationUntilMainPrizeDivisor: divisor_,
			mainPrizeTimeIncrement: increment_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
		} = params_;
		const eoaBidder_ = contracts_.signers[1];
		const deployerOfHostileContract_ = contracts_.signers[10];
		const hostileBidder_ = await deployHostileBidder(game_, deployerOfHostileContract_);
		const hostileBidderAddress_ = await hostileBidder_.getAddress();

		// Every transaction in these tests has a gas limit of 30 million (`hardhat.config.js`). A call into the hostile contract
		// in its gas-burning mode would consume all of that, so a bid that stays far below it cannot have called the contract.
		const gasUsedMaxLimit_ = 1_000_000n;

		/** Asserts that a receipt minted exactly `expectedReward_` to the hostile contract, cheaply, and emitted nothing from it. */
		const assertRewardMintedToHostileContract_ = (receipt_, expectedReward_, description_) => {
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.bidCstRewardAmount, description_).equal(expectedReward_);
			const mints_ = classifyCstTransferEvents(receipt_, token_).mints;
			expect(mints_, description_).deep.equal([{ from: hre.ethers.ZeroAddress, to: hostileBidderAddress_, value: expectedReward_, }]);
			expect(receipt_.logs.filter((log_) => log_.address === hostileBidderAddress_).length, description_).equal(0);
			expect(receipt_.gasUsed, description_).lessThan(gasUsedMaxLimit_);
		};

		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, eoaBidder_, firstBidTimeStamp_);
		const hostileFirstBidTimeStamp_ = firstBidTimeStamp_ + 1n;
		await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, hostileFirstBidTimeStamp_);
		expect(await game_.lastBidderAddress()).equal(hostileBidderAddress_);

		// Burning all gas is the nastiest mode: any call into the contract fails whatever gas it is given.
		await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(3n));
		await expect(eoaBidder_.sendTransaction({ to: hostileBidderAddress_, value: 1n, gasLimit: 1_000_000n, })).reverted;

		// Funding by plain ERC-20 transfers, which call no transfer hook on the recipient.
		await payCstFromMarketingWallet(contracts_, hostileBidderAddress_, 5n * rewardPerIncrement_);
		await payCstFromMarketingWallet(contracts_, eoaBidder_.address, 25n * rewardPerIncrement_);

		// The EOA outbids the hostile contract with ETH after six increments: the whole reward is minted to the contract.
		const eoaSecondBidTimeStamp_ = hostileFirstBidTimeStamp_ + 6n * increment_;
		{
			const hostileBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
			const receipt_ = await bidWithEthAt(game_, eoaBidder_, eoaSecondBidTimeStamp_);
			const expectedReward_ = getV3BidCstRewardAmount(6n * increment_, multiplier_, incrementUs_);
			assertRewardMintedToHostileContract_(receipt_, expectedReward_, "ETH outbid in mode 3");
			expect((await token_.balanceOf(hostileBidderAddress_)) - hostileBalanceBefore_).equal(expectedReward_);
		}

		// The hostile contract places a paid CST bid at a positive base, priced, weighted, and restarted like any other.
		{
			const bidTimeStamp_ = hostileFirstBidTimeStamp_ + 20n * increment_;
			const base_ = getV3CstBidPriceBase(maxLimit_, bidTimeStamp_ - firstBidTimeStamp_, multiplier_, incrementUs_);
			expect(base_).greaterThan(rewardPerIncrement_);
			await assertPremiumFreeAt(game_, params_, bidTimeStamp_);
			expect(await game_.getNextCstBidPriceAdvanced(bidTimeStamp_ - (await getLatestBlockTimestamp()))).equal(base_);
			const expectedReward_ = getV3BidCstRewardAmount(bidTimeStamp_ - eoaSecondBidTimeStamp_, multiplier_, incrementUs_);
			const expectedNewBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_);
			expect(expectedNewBeginningPrice_).lessThan(maxLimit_);
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const hostileBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
			const eoaBalanceBefore_ = await token_.balanceOf(eoaBidder_.address);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			const receipt_ = await waitForTransactionReceipt(
				hostileBidder_.connect(deployerOfHostileContract_).doBidWithCst(base_, "hostile CST bid", 0n)
			);
			expect(await blockTimestampOfReceipt(receipt_)).equal(bidTimeStamp_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.lastBidderAddress).equal(hostileBidderAddress_);
			expect(bidPlaced_.args.paidCstPrice).equal(base_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(expectedReward_);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(expectedNewBeginningPrice_);
			expect(classifyCstTransferEvents(receipt_, token_).all).deep.equal([
				{ from: hostileBidderAddress_, to: hre.ethers.ZeroAddress, value: base_, },
				{ from: hre.ethers.ZeroAddress, to: eoaBidder_.address, value: expectedReward_, },
			]);
			expect(hostileBalanceBefore_ - (await token_.balanceOf(hostileBidderAddress_))).equal(base_);
			expect((await token_.balanceOf(eoaBidder_.address)) - eoaBalanceBefore_).equal(expectedReward_);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(getV3CstBidRaffleWeight(ethBidPriceBase_, base_, maxLimit_));
			expect(await game_.lastCstBidderAddress()).equal(hostileBidderAddress_);
		}

		// Under every hostility flavor, the contract retakes the position with an exactly paid ETH bid and gets outbid
		// with ETH or CST; its reward is minted every time. Modes 4 and 5 would reenter the game if they were called.
		for (const [modeIndex_, hostilityModeCode_] of [1n, 2n, 3n, 4n, 5n].entries()) {
			const description_ = `hostility mode ${hostilityModeCode_}`;
			const retakeTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
			await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, retakeTimeStamp_);
			await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(hostilityModeCode_));
			const outbidWithEth_ = modeIndex_ % 2 === 0;
			const holdDuration_ = outbidWithEth_ ? increment_ : (2n * increment_);
			const outbidTimeStamp_ = retakeTimeStamp_ + holdDuration_;
			await assertPremiumFreeAt(game_, params_, outbidTimeStamp_);
			const expectedReward_ = getV3BidCstRewardAmount(holdDuration_, multiplier_, incrementUs_);
			const hostileBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
			const receipt_ =
				outbidWithEth_ ?
				await bidWithEthAt(game_, eoaBidder_, outbidTimeStamp_) :
				(await getPriceAndBidWithCstAt(game_, eoaBidder_, outbidTimeStamp_)).receipt_;
			assertRewardMintedToHostileContract_(receipt_, expectedReward_, description_);
			expect((await token_.balanceOf(hostileBidderAddress_)) - hostileBalanceBefore_, description_).equal(expectedReward_);
			expect(await game_.lastBidderAddress(), description_).equal(eoaBidder_.address);
		}
		await finishGameRound(contracts_, game_);
	});

	it("misconfiguration: with bidCstRewardAmountMultiplier set to zero, C and R are zero, the CST auction never declines, every CST bid is free, weightless and rewardless even at the deadline, ETH pricing is unaffected, and the round can be claimed", async function () {
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round(async (ownerGame_) => {
			await waitForTransactionReceipt(ownerGame_.setBidCstRewardAmountMultiplier(0n));
		});
		expect(params_.cstDutchAuctionBeginningBidPriceMaxLimit).equal(0n);
		expect(params_.rewardAmountPerMainPrizeTimeIncrement).equal(0n);
		const [ethBidder1_, ethBidder2_, camper1_, camper2_] = contracts_.signers.slice(1, 5);
		const ethBidderAddresses_ = [ethBidder1_.address, ethBidder2_.address];

		let ethTotalWeight_ = 0n;
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		for (const [bidIndex_, ethBidder_] of [ethBidder1_, ethBidder2_].entries()) {
			const timeStamp_ = firstBidTimeStamp_ + BigInt(bidIndex_);
			const ethBidPriceBase_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - (await getLatestBlockTimestamp()));
			const receipt_ = await bidWithEthAt(game_, ethBidder_, timeStamp_);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice).equal(0n);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
			ethTotalWeight_ += ethBidPriceBase_;
		}

		// The first CST auction asks zero and never ends; the price getters are zero at every offset, including at and beyond
		// the deadline, because the premium is calculated from max(base, R), which is zero (Comment-202611026).
		// The ETH side still carries its full premium at the deadline.
		{
			const [duration_, elapsedDuration_] = await game_.getCstDutchAuctionDurations();
			expect(duration_).equal(MAX_UINT256);
			expect(elapsedDuration_).equal(1n);
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			const deadline_ = await game_.mainPrizeTime();
			for (const currentTimeOffset_ of [0n, params_.mainPrizeTimeIncrement, deadline_ - latestTimeStamp_, deadline_ + 1n - latestTimeStamp_, FAR_FUTURE_TIME_OFFSET]) {
				expect(await game_.getNextCstBidPriceBaseAdvanced(currentTimeOffset_), `at offset ${currentTimeOffset_}`).equal(0n);
				expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_), `at offset ${currentTimeOffset_}`).equal(0n);
				expect(await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_), `at offset ${currentTimeOffset_}`).equal(0n);
			}
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const ethPriceAtDeadline_ = await game_.getNextEthBidPriceAdvanced(deadline_ - latestTimeStamp_);
			expect(ethPriceAtDeadline_).equal(getEthBidPriceAt(params_, ethBidPriceBase_, 0n));
			expect(ethPriceAtDeadline_).greaterThan(4n * ethBidPriceBase_);
		}

		// Three CST bids: two in a row, then one exactly at the deadline. Each is free, pays no reward to the outbid bidder,
		// weighs nothing, and leaves the auction at a zero beginning bid price (2 * (0 + 0), capped at 0).
		for (const [bidIndex_, camper_] of [camper1_, camper2_, camper1_].entries()) {
			const description_ = `CST bid ${bidIndex_}`;
			const timeStamp_ = (bidIndex_ < 2) ? (firstBidTimeStamp_ + 2n + BigInt(bidIndex_)) : await game_.mainPrizeTime();
			const totalSupplyBefore_ = await token_.totalSupply();
			const receipt_ = await bidWithCstForFreeAt(game_, camper_, timeStamp_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount, description_).equal(0n);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(0n);
			expect(await game_.cstDutchAuctionBeginningBidPrice(), description_).equal(0n);
			expect(await getLastBidRaffleWeight(game_, roundNum_), description_).equal(0n);
			expect(await token_.totalSupply(), description_).equal(totalSupplyBefore_);
			for (const transfer_ of classifyCstTransferEvents(receipt_, token_).all) {
				expect(transfer_.value, description_).equal(0n);
			}
			expect((await game_.getCstDutchAuctionDurations())[0], description_).equal(MAX_UINT256);
		}
		const claimReceipt_ = await finishGameRound(contracts_, game_);
		await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
		for (const winnerAddress_ of await getBidderRaffleWinnerAddresses(game_, claimReceipt_)) {
			expect(ethBidderAddresses_).include(winnerAddress_);
		}
		expect((await readBidRaffleData(game_, roundNum_)).totalWeight).equal(ethTotalWeight_);
	});

	it("misconfiguration: with bidCstRewardAmountMultiplier below one million, R rounds to zero: the first auction asks C of a few Wei, which buys a full raffle ticket, a free bid restarts the auction at zero, and from then on every CST bid is free and weightless without reverting (the zero beginning price branch of Comment-202611027)", async function () {
		const multiplier_ = MICROSECONDS_PER_SECOND - 1n;
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round(async (ownerGame_) => {
			await waitForTransactionReceipt(ownerGame_.setBidCstRewardAmountMultiplier(multiplier_));
		});
		const {
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			initialDurationUntilMainPrizeDivisor: divisor_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
		} = params_;
		expect(rewardPerIncrement_).equal(0n);
		expect(maxLimit_).equal(multiplier_ / divisor_);
		expect(maxLimit_).greaterThan(0n);
		expect(maxLimit_).lessThan(100n);
		const [ethBidder1_, ethBidder2_, ticketBuyer_, camper1_, camper2_] = contracts_.signers.slice(1, 6);
		const weightedBidderAddresses_ = [ethBidder1_.address, ethBidder2_.address, ticketBuyer_.address];
		await payCstFromMarketingWallet(contracts_, ticketBuyer_.address, ONE_CST);

		let totalWeight_ = 0n;
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		for (const [bidIndex_, ethBidder_] of [ethBidder1_, ethBidder2_].entries()) {
			const timeStamp_ = firstBidTimeStamp_ + BigInt(bidIndex_);
			const ethBidPriceBase_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - (await getLatestBlockTimestamp()));
			const receipt_ = await bidWithEthAt(game_, ethBidder_, timeStamp_);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice).equal(maxLimit_);
			totalWeight_ += ethBidPriceBase_;
		}

		// A CST bid at the full asking price of a few Wei buys a full raffle ticket: the degenerate consequence of R being zero.
		// The restart, 2 * (C + 0), is capped at C.
		let lastBidTimeStamp_;
		{
			lastBidTimeStamp_ = firstBidTimeStamp_ + 2n;
			const base_ = getV3CstBidPriceBase(maxLimit_, lastBidTimeStamp_ - firstBidTimeStamp_, multiplier_, incrementUs_);
			expect(base_).equal(maxLimit_);
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, ticketBuyer_, lastBidTimeStamp_);
			expect(cstBidPrice_).equal(maxLimit_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount).equal(getV3BidCstRewardAmount(1n, multiplier_, incrementUs_));
			expect(bidPlaced_.args.bidCstRewardAmount).equal(0n);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(maxLimit_);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
			totalWeight_ += ethBidPriceBase_;
		}

		// The auction declines one Wei per increment, roughly, and ends before the premium window opens.
		const auctionEndTimeStamp_ = await getCstDutchAuctionEndTimeStamp(game_);
		expect(auctionEndTimeStamp_).equal(lastBidTimeStamp_ + getV3CstDutchAuctionDuration(maxLimit_, multiplier_, incrementUs_));
		await assertPremiumFreeAt(game_, params_, auctionEndTimeStamp_);

		// A free bid restarts the auction at 2 * (0 + 0) = 0, so the duration getter reports zero. From then on every CST bid
		// is free, mints the tiny reward of the hold, and gets a zero weight because the beginning bid price it would be
		// scaled by is zero, at any time, including the deadline, where the premium floor max(0, R) is zero as well.
		for (const [bidIndex_, camper_] of [camper1_, camper2_, camper1_, camper2_].entries()) {
			const description_ = `free CST bid ${bidIndex_}`;
			const timeStamp_ = (bidIndex_ < 3) ? (auctionEndTimeStamp_ + BigInt(bidIndex_)) : await game_.mainPrizeTime();
			const expectedReward_ = getV3BidCstRewardAmount(timeStamp_ - lastBidTimeStamp_, multiplier_, incrementUs_);
			if (bidIndex_ === 0) {
				expect(expectedReward_, description_).greaterThan(0n);
			}
			const receipt_ = await bidWithCstForFreeAt(game_, camper_, timeStamp_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount, description_).equal(expectedReward_);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(0n);
			expect(getV3NewCstDutchAuctionBeginningBidPrice(0n, multiplier_, divisor_), description_).equal(0n);
			expect(await game_.cstDutchAuctionBeginningBidPrice(), description_).equal(0n);
			expect(await getLastBidRaffleWeight(game_, roundNum_), description_).equal(0n);
			const [duration_, elapsedDuration_] = await game_.getCstDutchAuctionDurations();
			expect(duration_, description_).equal(0n);
			expect(elapsedDuration_, description_).equal(0n);
			lastBidTimeStamp_ = timeStamp_;
		}
		expect(await token_.totalSupply()).greaterThan(0n);
		const claimReceipt_ = await finishGameRound(contracts_, game_);
		await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
		for (const winnerAddress_ of await getBidderRaffleWinnerAddresses(game_, claimReceipt_)) {
			expect(weightedBidderAddresses_).include(winnerAddress_);
		}
		expect((await readBidRaffleData(game_, roundNum_)).totalWeight).equal(totalWeight_);
	});

	it("misconfiguration: with bidCstRewardAmountMultiplier of 1e40, nothing wraps or reverts: the getters and the bids of a whole round, including a premium-bearing CST bid, equal the JS mirrors, and prices and rewards scale with the multiplier", async function () {
		const multiplier_ = 10n ** 40n;
		const { contracts_, game_, token_, params_, roundNum_ } = await setUpV3Round(async (ownerGame_) => {
			await waitForTransactionReceipt(ownerGame_.setBidCstRewardAmountMultiplier(multiplier_));
		});
		const {
			mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
			initialDurationUntilMainPrizeDivisor: divisor_,
			initialDurationUntilMainPrize: initialDurationUntilMainPrize_,
			rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
			cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			roundLateBidDuration: roundLateBidDuration_,
		} = params_;
		expect(rewardPerIncrement_).equal(multiplier_ / MICROSECONDS_PER_SECOND);
		expect(maxLimit_).equal(multiplier_ / divisor_);
		const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);

		// bidder1 holds for half the initial duration, bidder2 for three eighths; then bidder1 buys the remaining eighth of C.
		// Every amount below is in the order of 1e34 CST Wei or more, so these equalities also prove that nothing wrapped
		// in the contract's unchecked arithmetic.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
		const secondBidTimeStamp_ = firstBidTimeStamp_ + initialDurationUntilMainPrize_ / 2n;
		await bidWithEthAt(game_, bidder2_, secondBidTimeStamp_);
		expect(await token_.balanceOf(bidder1_.address)).at.least(getV3BidCstRewardAmount(secondBidTimeStamp_ - firstBidTimeStamp_, multiplier_, incrementUs_));
		const thirdBidTimeStamp_ = firstBidTimeStamp_ + initialDurationUntilMainPrize_ * 7n / 8n;
		const base1_ = getV3CstBidPriceBase(maxLimit_, thirdBidTimeStamp_ - firstBidTimeStamp_, multiplier_, incrementUs_);
		expect(base1_).greaterThan(2n * rewardPerIncrement_);
		await assertPremiumFreeAt(game_, params_, thirdBidTimeStamp_);
		expect(await token_.balanceOf(bidder1_.address)).at.least(base1_);
		const beginningPrice2_ = getV3NewCstDutchAuctionBeginningBidPrice(base1_, multiplier_, divisor_);
		expect(beginningPrice2_).lessThan(maxLimit_);
		{
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, bidder1_, thirdBidTimeStamp_);
			expect(cstBidPrice_).equal(base1_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.paidCstPrice).equal(base1_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(getV3BidCstRewardAmount(thirdBidTimeStamp_ - secondBidTimeStamp_, multiplier_, incrementUs_));
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(beginningPrice2_);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(getV3CstBidRaffleWeight(ethBidPriceBase_, base1_, maxLimit_));
			expect((await game_.getCstDutchAuctionDurations())[0]).equal(getV3CstDutchAuctionDuration(beginningPrice2_, multiplier_, incrementUs_));
		}

		// Inside the premium window, the restarted auction still has a base above R, so the premium is calculated from the base.
		const fourthBidTimeStamp_ = (await game_.mainPrizeTime()) - roundLateBidDuration_ / 2n;
		const base2_ = getV3CstBidPriceBase(beginningPrice2_, fourthBidTimeStamp_ - thirdBidTimeStamp_, multiplier_, incrementUs_);
		expect(base2_).greaterThan(rewardPerIncrement_);
		const price2_ = getCstBidPriceAt(params_, base2_, roundLateBidDuration_ / 2n);
		expect(price2_).greaterThan(base2_);
		expect(price2_).equal(base2_ + getRoundLateBidPricePremiumAmountAt(params_, base2_, roundLateBidDuration_ / 2n));
		expect(await token_.balanceOf(bidder2_.address)).at.least(price2_);
		{
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, bidder2_, fourthBidTimeStamp_);
			expect(cstBidPrice_).equal(price2_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.paidCstPrice).equal(price2_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(getV3BidCstRewardAmount(fourthBidTimeStamp_ - thirdBidTimeStamp_, multiplier_, incrementUs_));
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(getV3NewCstDutchAuctionBeginningBidPrice(base2_, multiplier_, divisor_));
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(getV3CstBidRaffleWeight(ethBidPriceBase_, base2_, beginningPrice2_));
			expect((await game_.roundStats(roundNum_)).totalSpentCstAmount).equal(base1_ + price2_);
		}

		// The getters at extreme offsets.
		{
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			const beginningPrice3_ = await game_.cstDutchAuctionBeginningBidPrice();
			const deadline_ = await game_.mainPrizeTime();
			expect(await game_.getNextCstBidPriceBaseAdvanced(FAR_FUTURE_TIME_OFFSET)).equal(0n);
			expect(await game_.getNextCstBidPriceAdvanced(FAR_FUTURE_TIME_OFFSET))
				.equal(getRoundLateBidPricePremiumAmountAt(params_, rewardPerIncrement_, deadline_ - latestTimeStamp_ - FAR_FUTURE_TIME_OFFSET));
			expect(await game_.getNextCstBidPriceBaseAdvanced( - FAR_FUTURE_TIME_OFFSET )).equal(beginningPrice3_);
			expect(await game_.getNextCstBidPriceAdvanced( - FAR_FUTURE_TIME_OFFSET )).equal(beginningPrice3_);
			expect(await game_.getBidCstRewardAmountAdvanced(FAR_FUTURE_TIME_OFFSET))
				.equal(getV3BidCstRewardAmount(latestTimeStamp_ + FAR_FUTURE_TIME_OFFSET - fourthBidTimeStamp_, multiplier_, incrementUs_));
			expect(await game_.getBidCstRewardAmountAdvanced( - FAR_FUTURE_TIME_OFFSET )).equal(0n);
			const [duration_, elapsedDuration_] = await game_.getCstDutchAuctionDurations();
			expect(duration_).equal(getV3CstDutchAuctionDuration(beginningPrice3_, multiplier_, incrementUs_));
			expect(elapsedDuration_).equal(0n);
		}
		await finishGameRound(contracts_, game_);
	});

	it("misconfiguration: initialDurationUntilMainPrizeDivisor can change only between rounds and changes C for the next round only: that round's first CST Dutch auction begins and caps at the new C, and a later round with the old divisor returns to the old C without carry-over (I3)", async function () {
		const { contracts_, game_, params_: params1_, roundNum_: roundNum1_ } = await setUpV3Round();
		const ownerGame_ = game_.connect(contracts_.ownerSigner);
		const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);
		const divisor1_ = params1_.initialDurationUntilMainPrizeDivisor;
		const divisor2_ = divisor1_ / 2n;

		/**
		Plays a round: two ETH bids, a CST bid after `cstBidDelayInIncrements_` increments whose restart must be capped at
		the expected C, and the claim. Returns the C the first bid announced.
		@param {bigint} roundNum_
		@param {bigint} cstBidDelayInIncrements_
		*/
		const playRoundAndReturnAnnouncedMaxLimit_ = async (params_, roundNum_, cstBidDelayInIncrements_) => {
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: incrementUs_,
				initialDurationUntilMainPrizeDivisor: divisor_,
				mainPrizeTimeIncrement: increment_,
				rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			} = params_;
			expect(maxLimit_).equal(multiplier_ / divisor_);
			const staleBeginningPrice_ = await game_.cstDutchAuctionBeginningBidPrice();
			const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
			const receipt_ = await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
			const announcedMaxLimit_ = findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice;
			expect(announcedMaxLimit_, `round ${roundNum_}`).equal(maxLimit_);

			// The announced value is derived; the storage still holds the previous round's last restart.
			expect(await game_.cstDutchAuctionBeginningBidPrice(), `round ${roundNum_}`).equal(staleBeginningPrice_);
			expect(await game_.getNextCstBidPriceBase(), `round ${roundNum_}`).equal(maxLimit_);
			const auctionDuration_ = (await game_.getCstDutchAuctionDurations())[0];
			expect(auctionDuration_, `round ${roundNum_}`).equal(getV3CstDutchAuctionDuration(maxLimit_, multiplier_, incrementUs_));
			expect(auctionDuration_, `round ${roundNum_}`).at.least(params_.initialDurationUntilMainPrize);
			expect(auctionDuration_, `round ${roundNum_}`).at.most(params_.initialDurationUntilMainPrize + 1n);

			await bidWithEthAt(game_, bidder2_, firstBidTimeStamp_ + 1n);

			// The setter is rejected while the round is active, so a change can never affect a running round.
			// Hardhat mines the reverted transaction in a block of its own, which is why it comes after the pinned bids.
			await expect(ownerGame_.setInitialDurationUntilMainPrizeDivisor(divisor2_)).revertedWithCustomError(game_, "RoundIsActive");

			const cstBidTimeStamp_ = firstBidTimeStamp_ + cstBidDelayInIncrements_ * increment_;
			const base_ = getV3CstBidPriceBase(maxLimit_, cstBidTimeStamp_ - firstBidTimeStamp_, multiplier_, incrementUs_);
			expect(2n * (base_ + rewardPerIncrement_), `round ${roundNum_}`).greaterThan(maxLimit_);
			await assertPremiumFreeAt(game_, params_, cstBidTimeStamp_);
			await payCstFromMarketingWallet(contracts_, bidder1_.address, base_ + rewardPerIncrement_);
			const { cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, bidder1_, cstBidTimeStamp_);
			expect(cstBidPrice_, `round ${roundNum_}`).equal(base_);
			expect(await game_.cstDutchAuctionBeginningBidPrice(), `round ${roundNum_}`).equal(maxLimit_);
			await finishGameRound(contracts_, game_);
			expect(await game_.roundNum()).equal(roundNum_ + 1n);
			return announcedMaxLimit_;
		};

		// Round 1 with the default divisor.
		const maxLimit1_ = await playRoundAndReturnAnnouncedMaxLimit_(params1_, roundNum1_, 12n);

		// Round 2 with half the divisor: the initial duration and C double; the increment grew one percent, which C ignores.
		await waitForTransactionReceipt(ownerGame_.setInitialDurationUntilMainPrizeDivisor(divisor2_));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const params2_ = await readCstPricingParams(game_);
		expect(params2_.mainPrizeTimeIncrementInMicroSeconds).greaterThan(params1_.mainPrizeTimeIncrementInMicroSeconds);
		expect(params2_.initialDurationUntilMainPrize).equal(params2_.mainPrizeTimeIncrementInMicroSeconds / divisor2_);
		expect(getNumIncrementsInInitialDuration(params2_)).equal(2n * getNumIncrementsInInitialDuration(params1_));
		expect(params2_.cstDutchAuctionBeginningBidPriceMaxLimit).at.least(2n * maxLimit1_);
		const maxLimit2_ = await playRoundAndReturnAnnouncedMaxLimit_(params2_, roundNum1_ + 1n, 20n);
		expect(maxLimit2_).greaterThan(maxLimit1_);

		// Round 3 with the default divisor again: C returns to its round 1 value although the storage holds round 2's cap.
		await waitForTransactionReceipt(ownerGame_.setInitialDurationUntilMainPrizeDivisor(divisor1_));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const params3_ = await readCstPricingParams(game_);
		expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(maxLimit2_);
		const maxLimit3_ = await playRoundAndReturnAnnouncedMaxLimit_(params3_, roundNum1_ + 2n, 12n);
		expect(maxLimit3_).equal(maxLimit1_);
	});

	it("the bidder raffle under many zero-weight CST bids: when most bids are free CST bids and only two ETH bids exist, every bidder raffle winner is an ETH bidder and the total weight equals the sum of the two ETH bid price bases (I5, Comment-202611029)", async function () {
		// A seeded PRNG chooses the campers and their delays, so that a printed seed reproduces a failure.
		const randomSource_ = createSeededRandomSourceForTest("    raffle under zero-weight CST bids");

		// Disabling the late-bid premium lets the campers bid for free past the deadline as well, so one round can hold
		// many zero-weight bids with just two ETH bids. The raffle's indifference to zero-weight bids does not depend
		// on the premium, which scenario 3 of this file and the Bidding tests cover.
		const { contracts_, game_, params_, roundNum_ } = await setUpV3Round(async (ownerGame_) => {
			await waitForTransactionReceipt(ownerGame_.setRoundLateBidPricePremiumAmountBaseMultiplier(0n));
		});
		const { mainPrizeTimeIncrement: increment_, rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_ } = params_;
		const [ethBidder1_, ethBidder2_] = contracts_.signers.slice(1, 3);
		const ethBidderAddresses_ = [ethBidder1_.address, ethBidder2_.address];
		const campers_ = contracts_.signers.slice(3, 9);
		const numCampingBids_ = scaleWithTestMode(12, 40, 120);

		let ethTotalWeight_ = 0n;
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		for (const [bidIndex_, ethBidder_] of [ethBidder1_, ethBidder2_].entries()) {
			const timeStamp_ = firstBidTimeStamp_ + BigInt(bidIndex_);
			const ethBidPriceBase_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - (await getLatestBlockTimestamp()));
			await bidWithEthAt(game_, ethBidder_, timeStamp_);
			expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
			ethTotalWeight_ += ethBidPriceBase_;
		}

		// Each camping bid is placed at or after the current auction's end, so its base is zero, which makes it free and weightless.
		for (let bidIndex_ = 0; bidIndex_ < numCampingBids_; ++ bidIndex_) {
			const description_ = `camping bid ${bidIndex_}`;
			const camper_ = randomSource_.pick(campers_);
			const timeStamp_ = (await getCstDutchAuctionEndTimeStamp(game_)) + randomSource_.nextBigIntBelow(increment_);
			expect(timeStamp_, description_).greaterThan(await getLatestBlockTimestamp());
			const receipt_ = await bidWithCstForFreeAt(game_, camper_, timeStamp_);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice, description_).equal(2n * rewardPerIncrement_);
			expect(await getLastBidRaffleWeight(game_, roundNum_), description_).equal(0n);
		}
		const { bidderAddresses: bidderAddresses_, totalWeight: totalWeight_ } = await readBidRaffleData(game_, roundNum_);
		expect(bidderAddresses_.length).equal(2 + numCampingBids_);
		expect(totalWeight_).equal(ethTotalWeight_);

		const claimReceipt_ = await finishGameRound(contracts_, game_);
		await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
		const winnerAddresses_ = await getBidderRaffleWinnerAddresses(game_, claimReceipt_);
		for (const winnerAddress_ of winnerAddresses_) {
			expect(ethBidderAddresses_).include(winnerAddress_);
		}
		for (const camper_ of campers_) {
			expect(winnerAddresses_).not.include(camper_.address);
		}
	});

	it("gas regression guard: a non-first ETH bid, a paid CST bid, a zero-price CST bid, and the main prize claim of a small round each stay below a generous ceiling", async function () {
		const { contracts_, game_, params_ } = await setUpV3Round();
		const { mainPrizeTimeIncrement: increment_, rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_ } = params_;
		const [ethBidder1_, ethBidder2_, freeCstBidder_, paidCstBidder_] = contracts_.signers.slice(1, 5);
		await payCstFromMarketingWallet(contracts_, paidCstBidder_.address, 2n * rewardPerIncrement_);

		// Ceilings are 1.15 times the measured gas, rounded up to a round number: enough headroom for compiler drift,
		// and tight enough to catch a regression of more than about 15 percent, such as an added loop or external call,
		// though not a single added storage write. Measured in this round shape with asserts enabled, which uses about
		// 2 percent more gas than the production build without the preprocessor:
		// bidWithEth (non-first, new bidder) 267,333; bidWithCst (paid, new bidder) 315,032;
		// bidWithCst (zero price, new bidder) 368,184; claimMainPrize (4 bids, default prize counts) 2,823,238.
		// The zero-price bid costs more than the paid one because it is this round's first bid after a 24-increment hold,
		// so it also writes the Endurance Champion and Chrono-Warrior state; zero-price bidding itself is not more expensive.
		const gasUsedMaxLimits_ = {
			bidWithEth: 310_000n,
			bidWithCstPaid: 365_000n,
			bidWithCstFree: 425_000n,
			claimMainPrize: 3_250_000n,
		};
		const gasUsed_ = {};

		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, ethBidder1_, firstBidTimeStamp_);
		gasUsed_.bidWithEth = (await bidWithEthAt(game_, ethBidder2_, firstBidTimeStamp_ + 1n)).gasUsed;
		const firstAuctionEndTimeStamp_ = await getCstDutchAuctionEndTimeStamp(game_);
		await assertPremiumFreeAt(game_, params_, firstAuctionEndTimeStamp_);
		gasUsed_.bidWithCstFree = (await bidWithCstForFreeAt(game_, freeCstBidder_, firstAuctionEndTimeStamp_)).gasUsed;
		{
			const bidTimeStamp_ = firstAuctionEndTimeStamp_ + increment_;
			await assertPremiumFreeAt(game_, params_, bidTimeStamp_);
			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, paidCstBidder_, bidTimeStamp_);
			expect(cstBidPrice_).greaterThan(0n);
			gasUsed_.bidWithCstPaid = receipt_.gasUsed;
		}
		gasUsed_.claimMainPrize = (await finishGameRound(contracts_, game_)).gasUsed;

		for (const [operationName_, gasUsedMaxLimit_] of Object.entries(gasUsedMaxLimits_)) {
			console.info("%s", `    ${operationName_} gas used: ${gasUsed_[operationName_]}`);
			expect(gasUsed_[operationName_], operationName_).greaterThan(0n);
			expect(gasUsed_[operationName_], operationName_).lessThan(gasUsedMaxLimit_);
		}
	});
});
