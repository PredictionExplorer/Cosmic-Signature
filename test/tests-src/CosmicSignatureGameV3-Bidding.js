"use strict";

// Tests V3-specific bidding behavior shared by ETH and CST bid entry points,
// in particular the V3 CST bid pricing rules summarized in Comment-202611022:
//    1. The CST bid price base declines at exactly the bid CST reward rate (Comment-202611023).
//    2. A CST bid restarts the CST Dutch auction at twice the base paid plus one main prize time increment of reward,
//       capped at the maximum, which every round's first auction begins at (Comment-202611024, Comment-202611025).
//    3. The late-bid premium of a CST bid is calculated from at least one increment of reward (Comment-202611026).
//    4. The raffle weight of a CST bid is the ETH bid price base scaled by the fraction of the asking price paid (Comment-202611027).

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const {
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	MICROSECONDS_PER_SECOND,
	SECONDS_PER_HOUR,
	SECONDS_PER_DAY,
} = require("../../src/CosmicSignatureConstants.js");
const { MAX_UINT256, maxBigInt, minBigInt } = require("../../src/BigIntMathHelpers.js");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	activateCurrentRound,
	findParsedEvent,
	mineAtOrAfter,
	setNextBlockTimeToAtLeast,
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
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
} = require("../src/V3UpgradeTestHelpers.js");
const { configureRewardAndDeployHostileBidder } = require("../src/AdversarialTestHelpers.js");
const { testAcrossGameVersions, finishGameRound, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

/** An offset at which every CST Dutch auction has long ended. */
const FAR_FUTURE_TIME_OFFSET = 100n * 366n * SECONDS_PER_DAY;

/**
Reads the live parameters the V3 CST rules are derived from. Read these after the round is activated and after
any parameter changes, because `mainPrizeTimeIncrementInMicroSeconds` grows on every main prize claim.
*/
async function readCstPricingParams(game_) {
	const bidCstRewardAmountMultiplier_ = await game_.bidCstRewardAmountMultiplier();
	const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
	const initialDurationUntilMainPrizeDivisor_ = await game_.initialDurationUntilMainPrizeDivisor();
	return {
		bidCstRewardAmountMultiplier: bidCstRewardAmountMultiplier_,
		mainPrizeTimeIncrementInMicroSeconds: mainPrizeTimeIncrementInMicroSeconds_,
		initialDurationUntilMainPrizeDivisor: initialDurationUntilMainPrizeDivisor_,
		mainPrizeTimeIncrement: mainPrizeTimeIncrementInMicroSeconds_ / MICROSECONDS_PER_SECOND,
		initialDurationUntilMainPrize: await game_.getInitialDurationUntilMainPrize(),

		// The reward of one main prize time increment, called `R` in these tests.
		rewardAmountPerMainPrizeTimeIncrement: getV3BidCstRewardAmountPerMainPrizeTimeIncrement(bidCstRewardAmountMultiplier_),

		// The reward of the initial duration until main prize, called `C` in these tests.
		cstDutchAuctionBeginningBidPriceMaxLimit:
			getV3CstDutchAuctionBeginningBidPriceMaxLimit(bidCstRewardAmountMultiplier_, initialDurationUntilMainPrizeDivisor_),

		roundLateBidDuration: await game_.getRoundLateBidDuration(),
		roundLateBidPricePremiumAmountBaseMultiplier: await game_.roundLateBidPricePremiumAmountBaseMultiplier(),
		roundLateBidPricePremiumAmountExponent: await game_.roundLateBidPricePremiumAmountExponent(),
	};
}

/** JS mirror of `BiddingV3._getCstDutchAuctionBeginningBidPrice`: the price the current CST Dutch auction began at. */
async function getCstDutchAuctionBeginningBidPrice(game_, params_) {
	return ((await game_.lastCstBidderAddress()) === hre.ethers.ZeroAddress) ?
		params_.cstDutchAuctionBeginningBidPriceMaxLimit :
		await game_.cstDutchAuctionBeginningBidPrice();
}

/** Checks `getCstDutchAuctionDurations` against the mirrors and returns the total duration. */
async function assertCstAuctionDurations(game_, params_) {
	const beginningPrice_ = await getCstDutchAuctionBeginningBidPrice(game_, params_);
	const [duration_, elapsed_] = await game_.getCstDutchAuctionDurations();
	expect(duration_).equal(
		getV3CstDutchAuctionDuration(beginningPrice_, params_.bidCstRewardAmountMultiplier, params_.mainPrizeTimeIncrementInMicroSeconds)
	);

	// Comment-202610021 applies.
	if ((await game_.lastBidderAddress()) !== hre.ethers.ZeroAddress) {
		expect(elapsed_).equal((await getLatestBlockTimestamp()) - (await game_.cstDutchAuctionBeginningTimeStamp()));
	}

	return duration_;
}

/** Checks both values returned by `getCstDutchAuctionDurations`. */
async function assertCstDutchAuctionDurationsEqual(game_, expectedDuration_, expectedElapsedDuration_) {
	const [duration_, elapsedDuration_] = await game_.getCstDutchAuctionDurations();
	expect(duration_).equal(expectedDuration_);
	expect(elapsedDuration_).equal(expectedElapsedDuration_);
}

/**
Checks the CST bid price getters at `currentTimeOffset_` against the JS mirrors:
the base getters return the beginning bid price minus the reward of the elapsed duration, floored at zero,
and the premium-inclusive getters return the base plus the late-bid premium calculated from the greater of
the base and one increment of reward. Returns the base.
*/
async function assertCstBidPriceGettersAt(game_, params_, currentTimeOffset_, description_ = "") {
	const beginningPrice_ = await getCstDutchAuctionBeginningBidPrice(game_, params_);
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const elapsedDuration_ = latestTimeStamp_ - (await game_.cstDutchAuctionBeginningTimeStamp()) + currentTimeOffset_;
	const expectedBase_ =
		getV3CstBidPriceBase(beginningPrice_, elapsedDuration_, params_.bidCstRewardAmountMultiplier, params_.mainPrizeTimeIncrementInMicroSeconds);
	const base_ = await game_.getNextCstBidPriceBaseAdvanced(currentTimeOffset_);
	expect(base_, `CST bid price base ${description_} at offset ${currentTimeOffset_}`).equal(expectedBase_);
	let expectedPremiumAmount_ = 0n;
	if ((await game_.lastBidderAddress()) !== hre.ethers.ZeroAddress) {
		const durationUntilMainPrize_ = (await game_.mainPrizeTime()) - (latestTimeStamp_ + currentTimeOffset_);
		expectedPremiumAmount_ =
			getRoundLateBidPricePremiumAmount(
				maxBigInt(expectedBase_, params_.rewardAmountPerMainPrizeTimeIncrement),
				durationUntilMainPrize_,
				params_.roundLateBidDuration,
				params_.mainPrizeTimeIncrementInMicroSeconds,
				params_.roundLateBidPricePremiumAmountBaseMultiplier,
				params_.roundLateBidPricePremiumAmountExponent
			);
		expect(
			addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded(
				expectedBase_,
				params_.bidCstRewardAmountMultiplier,
				durationUntilMainPrize_,
				params_.roundLateBidDuration,
				params_.mainPrizeTimeIncrementInMicroSeconds,
				params_.roundLateBidPricePremiumAmountBaseMultiplier,
				params_.roundLateBidPricePremiumAmountExponent
			)
		).equal(expectedBase_ + expectedPremiumAmount_);
	}
	expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_), `CST bid price ${description_} at offset ${currentTimeOffset_}`)
		.equal(expectedBase_ + expectedPremiumAmount_);
	if (currentTimeOffset_ === 0n) {
		expect(await game_.getNextCstBidPriceBase()).equal(expectedBase_);
		expect(await game_.getNextCstBidPrice()).equal(expectedBase_ + expectedPremiumAmount_);
	}
	return base_;
}

/** Checks the base getters at the ends of the current CST Dutch auction: positive just before it ends, zero from then on. */
async function assertCstBidPriceBaseReachesZeroAtAuctionEnd(game_, params_) {
	const duration_ = await assertCstAuctionDurations(game_, params_);
	const elapsedDuration_ = (await getLatestBlockTimestamp()) - (await game_.cstDutchAuctionBeginningTimeStamp());
	const offsetToAuctionEnd_ = duration_ - elapsedDuration_;
	if (offsetToAuctionEnd_ > 0n) {
		expect(await assertCstBidPriceGettersAt(game_, params_, offsetToAuctionEnd_ - 1n, "before the auction end")).greaterThan(0n);
	}
	expect(await assertCstBidPriceGettersAt(game_, params_, offsetToAuctionEnd_, "at the auction end")).equal(0n);
	expect(await assertCstBidPriceGettersAt(game_, params_, offsetToAuctionEnd_ + 1n, "after the auction end")).equal(0n);
	expect(await assertCstBidPriceGettersAt(game_, params_, FAR_FUTURE_TIME_OFFSET, "in the far future")).equal(0n);
	return duration_;
}

/**
Makes every given bidder earn the bid CST reward of holding the last bidder position for `holdDuration_`,
which is the only way to obtain CST: the bidders place ETH bids in turn, each `holdDuration_` after the previous one,
and the first bidder finally outbids the last one. Holding for the initial duration until main prize earns about `C`.
This typically pushes the blockchain time far past `mainPrizeTime`, so callers that need premium-free prices
disable the late-bid premium beforehand.
*/
async function earnCstByHoldingLastBidderPosition(game_, bidderSigners_, holdDuration_) {
	if ((await game_.lastBidderAddress()) === hre.ethers.ZeroAddress) {
		await bidWithEthAt(game_, bidderSigners_[0], (await getLatestBlockTimestamp()) + 10n);
	}
	for (const bidderSigner_ of [...bidderSigners_.slice(1), bidderSigners_[0]]) {
		await bidWithEthAt(game_, bidderSigner_, (await getLatestBlockTimestamp()) + holdDuration_);
	}
}

/** Places a CST bid at exactly `timeStamp_`, allowing exactly `cstPriceMaxLimit_`. */
async function bidWithCstAt(game_, bidder_, timeStamp_, cstPriceMaxLimit_) {
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).bidWithCst(cstPriceMaxLimit_, "", 0n));
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return receipt_;
}

/** Returns the raffle weight of the last bid placed in the round, derived from the cumulative weights. */
async function getLastBidRaffleWeight(game_, roundNum_) {
	const numBids_ = (await game_.roundStats(roundNum_)).numBids;
	const cumulativeWeight_ = (await game_.getBidInfoAt(roundNum_, numBids_ - 1n)).raffleCumulativeWeight;
	const prevCumulativeWeight_ = (numBids_ > 1n) ? (await game_.getBidInfoAt(roundNum_, numBids_ - 2n)).raffleCumulativeWeight : 0n;
	return cumulativeWeight_ - prevCumulativeWeight_;
}

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

/** Checks the bidding fields without assuming that champion statistics have been finalized. */
async function assertRoundBidStats(game_, roundNum_, expectedStats_) {
	const stats_ = await game_.roundStats(roundNum_);
	for (const [name_, value_] of Object.entries(expectedStats_)) {
		expect(stats_[name_], `round ${roundNum_}: ${name_}`).equal(value_);
	}
}

describe("CosmicSignatureGameV3-Bidding", function () {
	it("leaves the CST Dutch auction unchanged through every ETH bid entry point and restarts it at two increments of reward through every CST bid entry point after long waits", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const bidder_ = contracts_.signers[1];
			const gameForBidder_ = game_.connect(bidder_);

			// Disabling the late-bid premium makes the CST bids below free, as the blockchain time is far past `mainPrizeTime`.
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundLateBidPricePremiumAmountBaseMultiplier(0n));

			const mockToken_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc20", bidder_)).deploy();
			await mockToken_.waitForDeployment();
			await waitForTransactionReceipt(mockToken_.mint(bidder_.address, 2n));
			await waitForTransactionReceipt(mockToken_.approve(contracts_.prizesWalletAddress, 2n));
			const mockNft_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc721", bidder_)).deploy();
			await mockNft_.waitForDeployment();
			const nftIds_ = [];
			for (let nftIndex_ = 0; nftIndex_ < 2; ++ nftIndex_) {
				nftIds_.push(await mockNft_.mint.staticCall(bidder_.address));
				await waitForTransactionReceipt(mockNft_.mint(bidder_.address));
			}
			await waitForTransactionReceipt(mockNft_.setApprovalForAll(contracts_.prizesWalletAddress, true));
			await waitForTransactionReceipt(contracts_.randomWalkNft.connect(bidder_).mint({value: await contracts_.randomWalkNft.getMintPrice(),}));
			const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const roundNum_ = await game_.roundNum();
			const staleBeginningPrice_ = await game_.cstDutchAuctionBeginningBidPrice();

			const ethBidSubmissions_ = [
				() => gameForBidder_.bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}),
				() => bidder_.sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 10n ** 18n,}),
				() => gameForBidder_.bidWithEth(randomWalkNftId_, "", 0n, {value: 10n ** 18n,}),
				() => gameForBidder_.bidWithEthAndDonateToken(-1n, "", 0n, mockToken_, 1n, {value: 10n ** 18n,}),
				() => gameForBidder_.bidWithEthAndDonateNft(-1n, "", 0n, mockNft_, nftIds_[0], {value: 10n ** 18n,}),
			];
			for (const [submissionIndex_, submitBid_] of ethBidSubmissions_.entries()) {
				const receipt_ = await waitForTransactionReceipt(submitBid_());
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");

				// No CST bid has been placed in the round, so the auction begins at the maximum; an ETH bid never changes that.
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(params_.cstDutchAuctionBeginningBidPriceMaxLimit);
				expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(staleBeginningPrice_);
				if (submissionIndex_ === 0) {
					expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(await blockTimestampOfReceipt(receipt_));
				} else {
					expect(await game_.cstDutchAuctionBeginningTimeStamp()).lessThan(await blockTimestampOfReceipt(receipt_));
				}
				await assertCstAuctionDurations(game_, params_);
				await assertCstBidPriceGettersAt(game_, params_, 0n);
			}

			const cstBidSubmissions_ = [
				() => gameForBidder_.bidWithCst(0n, "", 0n),
				() => gameForBidder_.bidWithCstAndDonateToken(0n, "", 0n, mockToken_, 1n),
				() => gameForBidder_.bidWithCstAndDonateNft(0n, "", 0n, mockNft_, nftIds_[1]),
			];
			for (const submitBid_ of cstBidSubmissions_) {
				const statsBefore_ = await game_.roundStats(roundNum_);
				const beginningTimeStampBefore_ = await game_.cstDutchAuctionBeginningTimeStamp();
				const durationBefore_ = await assertCstAuctionDurations(game_, params_);
				const waitDuration_ = (3n + BigInt(generateRandomUInt32() % 19)) * SECONDS_PER_DAY;
				await mineAtOrAfter(beginningTimeStampBefore_ + durationBefore_ + waitDuration_);
				expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(beginningTimeStampBefore_);
				expect(await assertCstAuctionDurations(game_, params_)).equal(durationBefore_);
				expect(await assertCstBidPriceGettersAt(game_, params_, 0n)).equal(0n);

				// A CST bid at a zero base restarts the auction at two increments of reward (Comment-202611024) and gets a zero raffle weight.
				const expectedBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(0n, params_.bidCstRewardAmountMultiplier, params_.initialDurationUntilMainPrizeDivisor);
				expect(expectedBeginningPrice_).equal(2n * params_.rewardAmountPerMainPrizeTimeIncrement);
				const receipt_ = await waitForTransactionReceipt(submitBid_());
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice).equal(0n);
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(expectedBeginningPrice_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedBeginningPrice_);
				expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(await blockTimestampOfReceipt(receipt_));
				expect(await game_.lastCstBidderAddress()).equal(bidder_.address);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(0n);
				await assertRoundBidStats(game_, roundNum_, {
					numBids: statsBefore_.numBids + 1n,
					numCstBids: statsBefore_.numCstBids + 1n,
					totalSpentEthAmount: statsBefore_.totalSpentEthAmount,
					totalSpentCstAmount: 0n,
					maxEthBidPrice: statsBefore_.maxEthBidPrice,
					maxCstBidPrice: 0n,
				});
				// The restarted auction lasts two main prize time increments, rounded up to whole seconds.
				const duration_ = await assertCstAuctionDurations(game_, params_);
				expect(duration_).at.least(2n * params_.mainPrizeTimeIncrement);
				expect(duration_).at.most(2n * params_.mainPrizeTimeIncrement + 2n);

				expect(await assertCstBidPriceGettersAt(game_, params_, 0n)).equal(expectedBeginningPrice_);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("declines the CST bid price base at exactly the bid CST reward rate, reaches zero at the derived auction duration, and conserves one beginning bid price per CST Dutch auction across bid sequences", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const [bidder1_, bidder2_, bidder3_] = contracts_.signers.slice(1, 4);

			// Disabling the late-bid premium makes every paid CST price equal the base. The premium is tested separately.
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundLateBidPricePremiumAmountBaseMultiplier(0n));

			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				initialDurationUntilMainPrizeDivisor: divisor_,
				mainPrizeTimeIncrement: mainPrizeTimeIncrement_,
				initialDurationUntilMainPrize: initialDurationUntilMainPrize_,
				rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			} = params_;

			// The mirrored state of the current CST Dutch auction, maintained by `placeBid_`.
			let beginningPrice_ = 0n;
			let beginningTimeStamp_ = 0n;
			let lastBidTimeStamp_ = 0n;
			let rewardsMintedSinceBeginning_ = 0n;
			let numRewardsMintedSinceBeginning_ = 0n;

			/** Places a bid `delay_` seconds after the latest block and checks it against the mirrored state. */
			const placeBid_ = async (bidder_, bidType_, delay_) => {
				const isFirstBidInRound_ = (await game_.lastBidderAddress()) === hre.ethers.ZeroAddress;
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + delay_;
				const description_ = `${bidType_} bid at ${bidTimeStamp_}`;
				let expectedBase_ = 0n;
				let expectedRewardAmount_ = 0n;
				if ( ! isFirstBidInRound_ ) {
					expectedBase_ = getV3CstBidPriceBase(beginningPrice_, bidTimeStamp_ - beginningTimeStamp_, multiplier_, increment_);
					expect(await assertCstBidPriceGettersAt(game_, params_, delay_, `before the ${description_}`)).equal(expectedBase_);
					expectedRewardAmount_ = getV3BidCstRewardAmount(bidTimeStamp_ - lastBidTimeStamp_, multiplier_, increment_);
					expect(await game_.getBidCstRewardAmountAdvanced(delay_), description_).equal(expectedRewardAmount_);
				}
				const receipt_ =
					(bidType_ === "ETH") ?
					await bidWithEthAt(game_, bidder_, bidTimeStamp_) :
					await bidWithCstAt(game_, bidder_, bidTimeStamp_, expectedBase_);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.bidCstRewardAmount, description_).equal(expectedRewardAmount_);
				if (isFirstBidInRound_) {
					// The round's first bid starts the first auction at the maximum (Comment-202611025).
					beginningPrice_ = maxLimit_;
					beginningTimeStamp_ = bidTimeStamp_;
					rewardsMintedSinceBeginning_ = 0n;
					numRewardsMintedSinceBeginning_ = 0n;
				} else {
					rewardsMintedSinceBeginning_ += expectedRewardAmount_;
					++ numRewardsMintedSinceBeginning_;
				}
				if (bidType_ === "ETH") {
					expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(beginningPrice_);
				} else {
					expect(bidPlaced_.args.paidCstPrice, description_).equal(expectedBase_);

					// The conservation invariant of Comment-202611023: the CST burned plus all the bid CST rewards minted
					// since the auction began equals the beginning bid price, except that each reward rounds down separately,
					// and that a bid placed after the base reached zero burns nothing while the rewards keep accruing.
					const conservedAmount_ = expectedBase_ + rewardsMintedSinceBeginning_;
					if (expectedBase_ > 0n) {
						expect(conservedAmount_, `conservation at the ${description_}`).at.most(beginningPrice_);
					}
					expect(conservedAmount_ + numRewardsMintedSinceBeginning_ - 1n, `conservation at the ${description_}`).at.least(beginningPrice_);

					beginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(expectedBase_, multiplier_, divisor_);
					expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(beginningPrice_);
					expect(await game_.cstDutchAuctionBeginningBidPrice(), description_).equal(beginningPrice_);
					beginningTimeStamp_ = bidTimeStamp_;
					rewardsMintedSinceBeginning_ = 0n;
					numRewardsMintedSinceBeginning_ = 0n;
				}
				expect(await game_.cstDutchAuctionBeginningTimeStamp(), description_).equal(beginningTimeStamp_);
				lastBidTimeStamp_ = bidTimeStamp_;
				await assertCstAuctionDurations(game_, params_);
				expect(await assertCstBidPriceGettersAt(game_, params_, 0n, `after the ${description_}`))
					.equal(getV3CstBidPriceBase(beginningPrice_, bidTimeStamp_ - beginningTimeStamp_, multiplier_, increment_));
			};

			/** The number of seconds until the current auction ends. This can be negative. */
			const getOffsetToAuctionEnd_ = async () =>
				beginningTimeStamp_ + (await game_.getCstDutchAuctionDurations())[0] - (await getLatestBlockTimestamp());

			// The first auction begins at the maximum and reaches zero together with the initial countdown to `mainPrizeTime`,
			// up to rounding.
			await placeBid_(bidder1_, "ETH", 10n);
			{
				const duration_ = await assertCstBidPriceBaseReachesZeroAtAuctionEnd(game_, params_);
				expect(duration_).at.least(initialDurationUntilMainPrize_);
				expect(duration_).at.most(initialDurationUntilMainPrize_ + 1n);
				for (const offset_ of [1n, 60n, mainPrizeTimeIncrement_, initialDurationUntilMainPrize_ / 2n]) {
					expect(await assertCstBidPriceGettersAt(game_, params_, offset_))
						.equal(maxLimit_ - getV3BidCstRewardAmount(offset_, multiplier_, increment_));
				}
			}

			// Long holds earn both bidders about 2C each, which the CST bids below need, and end the first auction.
			await placeBid_(bidder2_, "ETH", 2n * initialDurationUntilMainPrize_);
			await placeBid_(bidder1_, "ETH", 2n * initialDurationUntilMainPrize_);
			expect(await getOffsetToAuctionEnd_()).lessThan(0n);
			await assertCstBidPriceBaseReachesZeroAtAuctionEnd(game_, params_);

			// A free CST bid after the auction ended restarts it at 2R.
			await placeBid_(bidder2_, "CST", 1n);
			expect(beginningPrice_).equal(2n * rewardPerIncrement_);
			await assertCstBidPriceBaseReachesZeroAtAuctionEnd(game_, params_);

			// ETH bids in between do not change the auction, but their rewards are part of the conserved amount.
			const thirdOfIncrement_ = mainPrizeTimeIncrement_ / 3n;
			await placeBid_(bidder1_, "ETH", thirdOfIncrement_);
			await placeBid_(bidder2_, "ETH", thirdOfIncrement_);
			await placeBid_(bidder1_, "CST", thirdOfIncrement_);

			// An immediate CST bid pays almost the whole beginning bid price.
			await placeBid_(bidder2_, "CST", 1n);
			expect(beginningPrice_).lessThan(maxLimit_);

			// A CST bid one second before the auction ends pays the last positive base.
			await placeBid_(bidder1_, "ETH", mainPrizeTimeIncrement_);
			await placeBid_(bidder1_, "ETH", mainPrizeTimeIncrement_);
			{
				const offsetToAuctionEnd_ = await getOffsetToAuctionEnd_();
				expect(offsetToAuctionEnd_).greaterThan(1n);
				await placeBid_(bidder2_, "CST", offsetToAuctionEnd_ - 1n);
			}

			// A CST bid exactly when the auction ends pays nothing.
			await placeBid_(bidder1_, "CST", await getOffsetToAuctionEnd_());
			expect(beginningPrice_).equal(2n * rewardPerIncrement_);

			await placeBid_(bidder3_, "ETH", 5n);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("restarts the CST Dutch auction after a CST bid at twice the base paid plus one increment of reward, capped at the maximum, which every round's first auction begins at regardless of the previous round", async function () {
		let expectedStaleBeginningPrice_ = null;
		await testAcrossGameVersions(async (contracts_, game_) => {
			const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);

			// Disabling the late-bid premium makes every paid CST price equal the base. The premium is tested separately.
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundLateBidPricePremiumAmountBaseMultiplier(0n));

			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				initialDurationUntilMainPrizeDivisor: divisor_,
				rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			} = params_;
			const roundNum_ = await game_.roundNum();

			// V3 neither reads nor writes these V2- variables (Comment-202611025).
			const nextRoundFirstCstDutchAuctionBeginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
			const cstDutchAuctionBeginningBidPriceMinLimit_ = await game_.cstDutchAuctionBeginningBidPriceMinLimit();

			// The previous round's last CST bid left its beginning bid price in storage, but the main prize claim reset
			// `lastCstBidderAddress`, so the new round's first auction begins at the maximum instead.
			expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
			const staleBeginningPrice_ = await game_.cstDutchAuctionBeginningBidPrice();
			if (expectedStaleBeginningPrice_ !== null) {
				expect(staleBeginningPrice_).equal(expectedStaleBeginningPrice_);
				expect(staleBeginningPrice_).not.equal(maxLimit_);
			}
			{
				const receipt_ = await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice).equal(maxLimit_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(staleBeginningPrice_);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).greaterThan(0n);
			}
			expect(await assertCstBidPriceGettersAt(game_, params_, 0n)).equal(maxLimit_);
			expect(await assertCstAuctionDurations(game_, params_)).equal(getV3CstDutchAuctionDuration(maxLimit_, multiplier_, increment_));

			// Long holds earn both bidders about 5C each, which the escalating chain below needs, and end the first auction.
			await earnCstByHoldingLastBidderPosition(game_, [bidder1_, bidder2_], 5n * params_.initialDurationUntilMainPrize);
			expect(await assertCstBidPriceGettersAt(game_, params_, 0n)).equal(0n);

			// A free CST bid restarts the auction at 2R.
			let beginningPrice_ = 2n * rewardPerIncrement_;
			expect(getV3NewCstDutchAuctionBeginningBidPrice(0n, multiplier_, divisor_)).equal(beginningPrice_);
			{
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
				const receipt_ = await bidWithCstAt(game_, bidder1_, bidTimeStamp_, 0n);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice).equal(0n);
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(beginningPrice_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(beginningPrice_);
				expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(bidTimeStamp_);
				expect(await game_.lastCstBidderAddress()).equal(bidder1_.address);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(0n);
			}

			// A chain of immediate CST bids escalates faster than doubling until the cap, and then stays at the cap.
			let numCappedRestarts_ = 0;
			for (let bidIndex_ = 0; bidIndex_ < 6; ++ bidIndex_) {
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
				const base_ = getV3CstBidPriceBase(beginningPrice_, 1n, multiplier_, increment_);
				expect(base_).equal(beginningPrice_ - getV3BidCstRewardAmount(1n, multiplier_, increment_));
				expect(await game_.getNextCstBidPriceBaseAdvanced(1n)).equal(base_);
				const uncappedBeginningPrice_ = (base_ + rewardPerIncrement_) * 2n;
				const newBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_);
				expect(newBeginningPrice_).equal(minBigInt(uncappedBeginningPrice_, maxLimit_));
				const receipt_ = await bidWithCstAt(game_, bidder1_, bidTimeStamp_, base_);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice, `chain bid ${bidIndex_}`).equal(base_);
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, `chain bid ${bidIndex_}`).equal(newBeginningPrice_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(newBeginningPrice_);
				expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(bidTimeStamp_);
				expect(await getLastBidRaffleWeight(game_, roundNum_), `chain bid ${bidIndex_}`)
					.equal(getV3CstBidRaffleWeight(await game_.nextEthBidPrice(), base_, beginningPrice_));
				if (uncappedBeginningPrice_ > maxLimit_) {
					expect(newBeginningPrice_).equal(maxLimit_);
					++ numCappedRestarts_;
				} else {
					expect(newBeginningPrice_, `chain bid ${bidIndex_}`).greaterThan(beginningPrice_ * 2n);
					expect(numCappedRestarts_).equal(0);
				}
				beginningPrice_ = newBeginningPrice_;
				await assertCstAuctionDurations(game_, params_);
			}
			expect(numCappedRestarts_).at.least(2);
			expect(beginningPrice_).equal(maxLimit_);

			// An ETH bid reports the current auction's beginning bid price and leaves the auction unchanged.
			{
				const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
				const receipt_ = await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + params_.mainPrizeTimeIncrement);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice).equal(maxLimit_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(maxLimit_);
				expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(beginningTimeStamp_);
				expect(await game_.lastCstBidderAddress()).equal(bidder1_.address);
			}

			// End the round with a free CST bid, so that the storage left for the next round differs from the maximum.
			{
				const duration_ = await assertCstAuctionDurations(game_, params_);
				const bidTimeStamp_ = (await game_.cstDutchAuctionBeginningTimeStamp()) + duration_;
				expect(bidTimeStamp_).greaterThan(await getLatestBlockTimestamp());
				const receipt_ = await bidWithCstAt(game_, bidder2_, bidTimeStamp_, 0n);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice).equal(0n);
				expectedStaleBeginningPrice_ = 2n * rewardPerIncrement_;
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedStaleBeginningPrice_);
			}
			expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(nextRoundFirstCstDutchAuctionBeginningBidPrice_);
			expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(cstDutchAuctionBeginningBidPriceMinLimit_);
			await finishGameRound(contracts_, game_);
			expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(expectedStaleBeginningPrice_);
			expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(nextRoundFirstCstDutchAuctionBeginningBidPrice_);
		}, 3, 3);
	});

	it("calculates the CST late-bid premium from at least one increment of reward, so a last-second CST bid at a zero base costs about four increments, while the ETH premium is unchanged", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;
			const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				mainPrizeTimeIncrement: mainPrizeTimeIncrement_,
				rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
				roundLateBidDuration: roundLateBidDuration_,
				roundLateBidPricePremiumAmountBaseMultiplier: baseMultiplier_,
				roundLateBidPricePremiumAmountExponent: exponent_,
			} = params_;
			expect(baseMultiplier_).greaterThan(0n);
			expect(mainPrizeTimeIncrement_).greaterThan(roundLateBidDuration_ + 1n);
			const roundNum_ = await game_.roundNum();

			/** The CST bid price with the premium at the given duration until main prize, from the JS mirror. */
			const getCstBidPriceAt_ = (cstBidPriceBase_, durationUntilMainPrize_) =>
				addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded(
					cstBidPriceBase_, multiplier_, durationUntilMainPrize_, roundLateBidDuration_, increment_, baseMultiplier_, exponent_
				);

			// The first bid starts the first auction, which ends about one increment before the premium window opens,
			// because the second bid pushes `mainPrizeTime` by one increment. The second bid is placed after six increments,
			// so that bidder1 earns about 6R, enough for the premium-bearing CST bid below.
			await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
			await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 6n * mainPrizeTimeIncrement_);
			expect(await token_.balanceOf(bidder1_.address)).at.least(5n * rewardPerIncrement_);
			const mainPrizeTime_ = await game_.mainPrizeTime();
			{
				const auctionEndTimeStamp_ = (await game_.cstDutchAuctionBeginningTimeStamp()) + (await assertCstAuctionDurations(game_, params_));
				expect(auctionEndTimeStamp_).lessThan(mainPrizeTime_ - roundLateBidDuration_);
			}

			// Throughout the premium window, the base is zero, so the CST premium is calculated from R (Comment-202611026),
			// while the ETH premium is calculated from the ETH bid price base. Beyond `mainPrizeTime`, both are at their maximum.
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			const maxCstBidPrice_ = getCstBidPriceAt_(0n, 0n);
			expect(maxCstBidPrice_).greaterThan(4n * rewardPerIncrement_ * 99n / 100n);
			expect(maxCstBidPrice_).lessThan(4n * rewardPerIncrement_ * 101n / 100n);
			for (const durationUntilMainPrize_ of [
				roundLateBidDuration_ + 60n,
				roundLateBidDuration_,
				roundLateBidDuration_ - 1n,
				roundLateBidDuration_ * 3n / 4n,
				roundLateBidDuration_ / 2n,
				roundLateBidDuration_ / 8n,
				10n,
				1n,
				0n,
				-1n,
				( - roundLateBidDuration_ ),
			]) {
				const currentTimeOffset_ = mainPrizeTime_ - durationUntilMainPrize_ - latestTimeStamp_;
				const description_ = `at durationUntilMainPrize == ${durationUntilMainPrize_}`;
				expect(await assertCstBidPriceGettersAt(game_, params_, currentTimeOffset_, description_)).equal(0n);
				const cstBidPrice_ = await game_.getNextCstBidPriceAdvanced(currentTimeOffset_);
				expect(cstBidPrice_, description_).equal(getCstBidPriceAt_(0n, durationUntilMainPrize_));
				expect(cstBidPrice_, description_).equal(
					getRoundLateBidPricePremiumAmount(rewardPerIncrement_, durationUntilMainPrize_, roundLateBidDuration_, increment_, baseMultiplier_, exponent_)
				);
				expect(await game_.getNextEthBidPriceAdvanced(currentTimeOffset_), description_).equal(
					addRoundLateBidPricePremiumAmountIfNeeded(ethBidPriceBase_, durationUntilMainPrize_, roundLateBidDuration_, increment_, baseMultiplier_, exponent_)
				);
				if (durationUntilMainPrize_ >= roundLateBidDuration_) {
					expect(cstBidPrice_, description_).equal(0n);
				} else if (durationUntilMainPrize_ <= 0n) {
					expect(cstBidPrice_, description_).equal(maxCstBidPrice_);
				} else {
					// Just inside the window, the integer premium still rounds down to zero.
					expect(cstBidPrice_, description_).lessThan(maxCstBidPrice_);
					if (durationUntilMainPrize_ <= roundLateBidDuration_ / 2n) {
						expect(cstBidPrice_, description_).greaterThan(0n);
					}
				}
			}

			// A real CST bid one second before `mainPrizeTime` pays about 4R for a zero base, gets a zero raffle weight,
			// and still restarts the auction at 2R, because the premium is a toll on top of the base.
			// One second before the maximum, the premium is up to about 1.5% below it, because the window duration
			// is rounded down to whole seconds too.
			{
				const bidTimeStamp_ = mainPrizeTime_ - 1n;
				const cstBidPrice_ = getCstBidPriceAt_(0n, 1n);
				expect(cstBidPrice_).greaterThan(4n * rewardPerIncrement_ * 98n / 100n);
				expect(cstBidPrice_).lessThan(maxCstBidPrice_);
				expect(await game_.getNextCstBidPriceAdvanced(bidTimeStamp_ - latestTimeStamp_)).equal(cstBidPrice_);
				const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
				const receipt_ = await bidWithCstAt(game_, bidder1_, bidTimeStamp_, cstBidPrice_);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice).equal(cstBidPrice_);
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(2n * rewardPerIncrement_);
				expect(bidder1CstBalanceBefore_ - (await token_.balanceOf(bidder1_.address))).equal(cstBidPrice_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(2n * rewardPerIncrement_);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(0n);
				expect((await game_.roundStats(roundNum_)).totalSpentCstAmount).equal(cstBidPrice_);
				expect(await game_.mainPrizeTime()).equal(mainPrizeTime_ + mainPrizeTimeIncrement_);
			}

			// The restarted auction declines from 2R through R inside the new premium window, so the premium base switches
			// from the base to R within the window. Both branches of the mirror must match the contract.
			{
				const newMainPrizeTime_ = await game_.mainPrizeTime();
				const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
				const latestTimeStamp2_ = await getLatestBlockTimestamp();
				let numSamplesAboveOneIncrement_ = 0;
				let numSamplesBelowOneIncrement_ = 0;
				const numSamples_ = 16n;
				for (let sampleIndex_ = 0n; sampleIndex_ <= numSamples_ + 2n; ++ sampleIndex_) {
					const durationUntilMainPrize_ = roundLateBidDuration_ - roundLateBidDuration_ * sampleIndex_ / numSamples_;
					const sampleTimeStamp_ = newMainPrizeTime_ - durationUntilMainPrize_;
					const base_ = getV3CstBidPriceBase(2n * rewardPerIncrement_, sampleTimeStamp_ - beginningTimeStamp_, multiplier_, increment_);
					if (base_ > rewardPerIncrement_) {
						++ numSamplesAboveOneIncrement_;
					} else if (base_ < rewardPerIncrement_) {
						++ numSamplesBelowOneIncrement_;
					}
					const description_ = `at durationUntilMainPrize == ${durationUntilMainPrize_}`;
					expect(await assertCstBidPriceGettersAt(game_, params_, sampleTimeStamp_ - latestTimeStamp2_, description_)).equal(base_);
					expect(await game_.getNextCstBidPriceAdvanced(sampleTimeStamp_ - latestTimeStamp2_), description_)
						.equal(getCstBidPriceAt_(base_, durationUntilMainPrize_));
				}
				expect(numSamplesAboveOneIncrement_).at.least(2);
				expect(numSamplesBelowOneIncrement_).at.least(2);

				// bidder2 earned about 19R while bidder1 held the first auction, so it can afford a bid at a base above R.
				const bidTimeStamp_ = newMainPrizeTime_ - roundLateBidDuration_ / 2n;
				const base_ = getV3CstBidPriceBase(2n * rewardPerIncrement_, bidTimeStamp_ - beginningTimeStamp_, multiplier_, increment_);
				expect(base_).greaterThan(rewardPerIncrement_);
				const cstBidPrice_ = getCstBidPriceAt_(base_, newMainPrizeTime_ - bidTimeStamp_);
				expect(cstBidPrice_ - base_).equal(
					getRoundLateBidPricePremiumAmount(base_, newMainPrizeTime_ - bidTimeStamp_, roundLateBidDuration_, increment_, baseMultiplier_, exponent_)
				);
				expect(await token_.balanceOf(bidder2_.address)).at.least(cstBidPrice_);
				const receipt_ = await bidWithCstAt(game_, bidder2_, bidTimeStamp_, cstBidPrice_);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice).equal(cstBidPrice_);
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal((base_ + rewardPerIncrement_) * 2n);
				expect(await getLastBidRaffleWeight(game_, roundNum_))
					.equal(getV3CstBidRaffleWeight(await game_.nextEthBidPrice(), base_, 2n * rewardPerIncrement_));
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("the CST bid price base getters equal the premium-inclusive getters minus the late-bid premium at positive and negative offsets", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				mainPrizeTimeIncrement: mainPrizeTimeIncrement_,
				initialDurationUntilMainPrize: initialDurationUntilMainPrize_,
				rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
				roundLateBidDuration: roundLateBidDuration_,
			} = params_;

			/** Checks the getters at offsets spanning the current auction and the premium window. */
			const sweepOffsets_ = async () => {
				const latestTimeStamp_ = await getLatestBlockTimestamp();
				const elapsedDuration_ = latestTimeStamp_ - (await game_.cstDutchAuctionBeginningTimeStamp());
				const offsetToAuctionEnd_ = (await game_.getCstDutchAuctionDurations())[0] - elapsedDuration_;
				const offsetToMainPrizeTime_ = (await game_.mainPrizeTime()) - latestTimeStamp_;
				let numPositiveBases_ = 0;
				let numZeroBases_ = 0;
				let numPremiums_ = 0;
				for (const currentTimeOffset_ of [
					( - FAR_FUTURE_TIME_OFFSET ),
					( - elapsedDuration_ - 1n ),
					( - elapsedDuration_ ),
					-1n,
					0n,
					1n,
					offsetToAuctionEnd_ / 2n,
					offsetToMainPrizeTime_ - roundLateBidDuration_ - 1n,
					offsetToMainPrizeTime_ - roundLateBidDuration_ + 1n,
					offsetToMainPrizeTime_ - roundLateBidDuration_ / 2n,
					offsetToMainPrizeTime_ - 1n,
					offsetToMainPrizeTime_,
					offsetToMainPrizeTime_ + 1n,
					offsetToAuctionEnd_ - 1n,
					offsetToAuctionEnd_,
					offsetToAuctionEnd_ + 1n,
					offsetToAuctionEnd_ + SECONDS_PER_DAY,
					FAR_FUTURE_TIME_OFFSET,
				]) {
					const base_ = await assertCstBidPriceGettersAt(game_, params_, currentTimeOffset_);
					if (base_ > 0n) {
						++ numPositiveBases_;
					} else {
						++ numZeroBases_;
					}
					if ((await game_.getNextCstBidPriceAdvanced(currentTimeOffset_)) > base_) {
						++ numPremiums_;
					}
					if (elapsedDuration_ + currentTimeOffset_ <= 0n) {
						expect(base_, `at offset ${currentTimeOffset_}`).equal(await getCstDutchAuctionBeginningBidPrice(game_, params_));
					}
				}
				expect(numPositiveBases_).at.least(3);
				expect(numZeroBases_).at.least(3);
				expect(numPremiums_).at.least(3);
			};

			await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
			await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + initialDurationUntilMainPrize_ / 2n);
			await sweepOffsets_();

			// bidder1 earned about 12R while holding, so it can afford a CST bid at about 11R.
			// The restarted auction begins just below the maximum and overlaps the new premium window with positive bases.
			{
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + mainPrizeTimeIncrement_;
				const base_ = await game_.getNextCstBidPriceBaseAdvanced(mainPrizeTimeIncrement_);
				expect(base_).greaterThan(10n * rewardPerIncrement_);
				expect(base_).lessThan(12n * rewardPerIncrement_);
				expect(await game_.getNextCstBidPriceAdvanced(mainPrizeTimeIncrement_)).equal(base_);
				await bidWithCstAt(game_, bidder1_, bidTimeStamp_, base_);
				const beginningPrice_ = await game_.cstDutchAuctionBeginningBidPrice();
				expect(beginningPrice_).equal(getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, params_.initialDurationUntilMainPrizeDivisor));
				expect(beginningPrice_).greaterThan(maxLimit_ * 95n / 100n);
				expect(beginningPrice_).at.most(maxLimit_);
			}
			await mineAtOrAfter((await getLatestBlockTimestamp()) + mainPrizeTimeIncrement_);
			await sweepOffsets_();
			expect(await game_.getNextCstBidPriceBaseAdvanced(FAR_FUTURE_TIME_OFFSET)).equal(0n);
			expect(await game_.getNextCstBidPriceBaseAdvanced( - FAR_FUTURE_TIME_OFFSET )).equal(maxLimit_);
			expect(getV3BidCstRewardAmount( - 1n, multiplier_, increment_)).equal(0n);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("getCstDutchAuctionDurations returns the rounded-up duration until the base reaches zero, or the maximum uint256 when bidCstRewardAmountMultiplier is zero, in which case CST bids are free and weightless", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const ownerGame_ = game_.connect(contracts_.ownerSigner);
			const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);

			// A normal round.
			{
				await activateCurrentRound(game_, contracts_.ownerSigner);
				const params_ = await readCstPricingParams(game_);
				const { bidCstRewardAmountMultiplier: multiplier_, mainPrizeTimeIncrementInMicroSeconds: increment_ } = params_;
				expect(multiplier_).greaterThan(0n);
				await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
				const beginningPrice_ = params_.cstDutchAuctionBeginningBidPriceMaxLimit;
				const [duration_, elapsed_] = await game_.getCstDutchAuctionDurations();
				expect(duration_).equal((beginningPrice_ * increment_ + (multiplier_ - 1n)) / multiplier_);
				expect(duration_).equal(getV3CstDutchAuctionDuration(beginningPrice_, multiplier_, increment_));
				expect(elapsed_).equal(0n);
				await assertCstBidPriceBaseReachesZeroAtAuctionEnd(game_, params_);
				await mineAtOrAfter((await getLatestBlockTimestamp()) + SECONDS_PER_HOUR);
				await assertCstDutchAuctionDurationsEqual(game_, duration_, SECONDS_PER_HOUR);
				await finishGameRound(contracts_, game_);
			}

			// A round with a zero multiplier: the maximum beginning bid price and the reward are zero,
			// so the CST bid price is zero and never declines, every CST bid is free, and its raffle weight is zero
			// because the beginning bid price it is scaled by is zero (Comment-202611027).
			{
				await waitForTransactionReceipt(ownerGame_.setBidCstRewardAmountMultiplier(0n));
				await activateCurrentRound(game_, contracts_.ownerSigner);
				const params_ = await readCstPricingParams(game_);
				expect(params_.cstDutchAuctionBeginningBidPriceMaxLimit).equal(0n);
				expect(params_.rewardAmountPerMainPrizeTimeIncrement).equal(0n);
				const roundNum_ = await game_.roundNum();
				const ethBidPriceBase_ = await game_.getNextEthBidPriceAdvanced(10n);
				await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
				await assertCstDutchAuctionDurationsEqual(game_, MAX_UINT256, 0n);
				for (const currentTimeOffset_ of [0n, 1n, params_.mainPrizeTimeIncrement, params_.initialDurationUntilMainPrize, FAR_FUTURE_TIME_OFFSET]) {
					expect(await assertCstBidPriceGettersAt(game_, params_, currentTimeOffset_)).equal(0n);
					expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_)).equal(0n);
					expect(await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_)).equal(0n);
				}
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + SECONDS_PER_HOUR;
				const receipt_ = await bidWithCstAt(game_, bidder2_, bidTimeStamp_, 0n);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice).equal(0n);
				expect(bidPlaced_.args.bidCstRewardAmount).equal(0n);
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(0n);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(0n);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(0n);
				await assertCstDutchAuctionDurationsEqual(game_, MAX_UINT256, 0n);
				await mineAtOrAfter(bidTimeStamp_ + SECONDS_PER_DAY);
				await assertCstDutchAuctionDurationsEqual(game_, MAX_UINT256, SECONDS_PER_DAY);
				expect(await assertCstBidPriceGettersAt(game_, params_, 0n)).equal(0n);
				await finishGameRound(contracts_, game_);
				await waitForTransactionReceipt(ownerGame_.setBidCstRewardAmountMultiplier(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER));
			}
		}, 3, 3);
	});

	it("advances CST auction elapsed duration and price through long bid-free waits without changing its total duration", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			} = params_;
			await bidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 10n);
			const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const staleBeginningPrice_ = await game_.cstDutchAuctionBeginningBidPrice();
			const duration_ = await assertCstAuctionDurations(game_, params_);
			expect(duration_).equal(getV3CstDutchAuctionDuration(maxLimit_, multiplier_, increment_));

			// The auction ends inside the premium window, so the premium-inclusive getters are checked through the mirror as well.
			for (const elapsed_ of [1n, duration_ / 2n, duration_ - 1n, duration_, duration_ + (3n + BigInt(generateRandomUInt32() % 19)) * SECONDS_PER_DAY]) {
				await mineAtOrAfter(beginningTimeStamp_ + elapsed_);
				expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(beginningTimeStamp_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(staleBeginningPrice_);
				expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
				await assertCstDutchAuctionDurationsEqual(game_, duration_, elapsed_);
				const base_ = await assertCstBidPriceGettersAt(game_, params_, 0n, `at elapsed ${elapsed_}`);
				expect(base_).equal(getV3CstBidPriceBase(maxLimit_, elapsed_, multiplier_, increment_));
				if (elapsed_ < duration_) {
					expect(base_).greaterThan(0n);
				} else {
					expect(base_).equal(0n);
				}
				expect(await game_.getNextCstBidPriceBaseAdvanced(FAR_FUTURE_TIME_OFFSET)).equal(0n);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("preserves the CST Dutch auction state across unrelated actions and claims, and never writes the V2- next-round beginning price or minimum limit", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const ownerGame_ = game_.connect(contracts_.ownerSigner);
		const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);

		/** Reads the CST Dutch auction state and the V2- variables that V3 leaves frozen. */
		const readState_ = async () => ({
			beginningPrice: await game_.cstDutchAuctionBeginningBidPrice(),
			beginningTimeStamp: await game_.cstDutchAuctionBeginningTimeStamp(),
			lastCstBidderAddress: await game_.lastCstBidderAddress(),
			nextRoundFirstBeginningPrice: await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice(),
			beginningPriceMinLimit: await game_.cstDutchAuctionBeginningBidPriceMinLimit(),
		});
		const initialState_ = await readState_();
		expect(initialState_.lastCstBidderAddress).equal(hre.ethers.ZeroAddress);

		// Disabling the late-bid premium makes the first CST bid below free, as it is placed long after `mainPrizeTime`.
		await waitForTransactionReceipt(ownerGame_.setRoundLateBidPricePremiumAmountBaseMultiplier(0n));

		await waitForTransactionReceipt(ownerGame_.setBidMessageLengthMaxLimit((await game_.bidMessageLengthMaxLimit()) + 1n));
		expect(await readState_()).deep.equal(initialState_);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		expect(await readState_()).deep.equal(initialState_);
		let params_ = await readCstPricingParams(game_);
		{
			const receipt_ = await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice)
				.equal(params_.cstDutchAuctionBeginningBidPriceMaxLimit);
			expect(await readState_()).deep.equal({ ...initialState_, beginningTimeStamp: await getLatestBlockTimestamp(), });
		}
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 10n * SECONDS_PER_DAY);

		// The first CST bid is free and rewards bidder1 for the long hold; a paid second CST bid follows immediately.
		const twoRewardIncrements_ = 2n * params_.rewardAmountPerMainPrizeTimeIncrement;
		{
			const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
			expect(await game_.getNextCstBidPriceAdvanced(1n)).equal(0n);
			const receipt_ = await bidWithCstAt(game_, bidder2_, bidTimeStamp_, 0n);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice).equal(twoRewardIncrements_);
			expect(await readState_()).deep.equal({
				...initialState_,
				beginningPrice: twoRewardIncrements_,
				beginningTimeStamp: bidTimeStamp_,
				lastCstBidderAddress: bidder2_.address,
			});
		}
		const paidCstPrice_ = await game_.getNextCstBidPriceAdvanced(1n);
		expect(paidCstPrice_).greaterThan(0n);
		expect(paidCstPrice_).equal(await game_.getNextCstBidPriceBaseAdvanced(1n));
		expect(await contracts_.cosmicSignatureToken.balanceOf(bidder1_.address)).greaterThan(paidCstPrice_);
		const paidBidTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
		await bidWithCstAt(game_, bidder1_, paidBidTimeStamp_, paidCstPrice_);
		const state_ = await readState_();
		expect(state_).deep.equal({
			...initialState_,
			beginningPrice:
				getV3NewCstDutchAuctionBeginningBidPrice(paidCstPrice_, params_.bidCstRewardAmountMultiplier, params_.initialDurationUntilMainPrizeDivisor),
			beginningTimeStamp: paidBidTimeStamp_,
			lastCstBidderAddress: bidder1_.address,
		});
		expect(state_.beginningPrice).not.equal(params_.cstDutchAuctionBeginningBidPriceMaxLimit);
		const currentDuration_ = await assertCstAuctionDurations(game_, params_);
		for (const donate_ of [
			() => game_.connect(bidder2_).donateEth({value: 1n,}),
			() => game_.connect(bidder2_).donateEthWithInfo("{}", {value: 1n,}),
		]) {
			await waitForTransactionReceipt(donate_());
			expect(await readState_()).deep.equal(state_);
			expect(await assertCstAuctionDurations(game_, params_)).equal(currentDuration_);
		}

		// The main prize claim resets only `lastCstBidderAddress`. The next round's first auction begins at the maximum,
		// so its derived duration ignores the stale beginning price left in storage (Comment-202611025).
		const roundNum_ = await game_.roundNum();
		await setNextBlockTimeToAtLeast(await game_.mainPrizeTime());
		await waitForTransactionReceipt(game_.connect(bidder1_).claimMainPrize());
		expect(await game_.roundNum()).equal(roundNum_ + 1n);
		const stateAfterClaim_ = { ...state_, lastCstBidderAddress: hre.ethers.ZeroAddress, };
		expect(await readState_()).deep.equal(stateAfterClaim_);
		params_ = await readCstPricingParams(game_);
		const nextDuration_ = await assertCstAuctionDurations(game_, params_);
		expect(nextDuration_).equal(
			getV3CstDutchAuctionDuration(params_.cstDutchAuctionBeginningBidPriceMaxLimit, params_.bidCstRewardAmountMultiplier, params_.mainPrizeTimeIncrementInMicroSeconds)
		);
		expect(nextDuration_).not.equal(
			getV3CstDutchAuctionDuration(state_.beginningPrice, params_.bidCstRewardAmountMultiplier, params_.mainPrizeTimeIncrementInMicroSeconds)
		);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		expect(await readState_()).deep.equal(stateAfterClaim_);
		expect(await assertCstAuctionDurations(game_, params_)).equal(nextDuration_);
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 7n * SECONDS_PER_DAY);
		await waitForTransactionReceipt(ownerGame_.halveEthDutchAuctionEndingBidPrice());
		expect(await readState_()).deep.equal(stateAfterClaim_);
		expect(await assertCstAuctionDurations(game_, params_)).equal(nextDuration_);
		{
			const receipt_ = await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 10n);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice)
				.equal(params_.cstDutchAuctionBeginningBidPriceMaxLimit);
			expect(await readState_()).deep.equal({ ...stateAfterClaim_, beginningTimeStamp: await getLatestBlockTimestamp(), });
			expect(await assertCstAuctionDurations(game_, params_)).equal(nextDuration_);
			expect(await assertCstBidPriceGettersAt(game_, params_, 0n)).equal(params_.cstDutchAuctionBeginningBidPriceMaxLimit);
		}
	});

	it("allows random combinations of ETH, receive(), and CST bids within one block", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;

			// Disabling the late-bid premium keeps every CST bid price at most the maximum beginning bid price,
			// as the funding holds below push the blockchain time far past `mainPrizeTime`.
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundLateBidPricePremiumAmountBaseMultiplier(0n));

			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				initialDurationUntilMainPrizeDivisor: divisor_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			} = params_;
			const bidders_ = contracts_.signers.slice(1, 4);

			// Each bidder places at most 10 CST bids below, each costing at most the maximum beginning bid price,
			// which is about the reward of holding the last bidder position for the initial duration until main prize.
			await earnCstByHoldingLastBidderPosition(game_, bidders_, 12n * params_.initialDurationUntilMainPrize);
			for (const bidder_ of bidders_) {
				expect(await token_.balanceOf(bidder_.address)).at.least(11n * maxLimit_);
			}

			const ethDutchAuctionBeginningBidPrice_ = await game_.ethDutchAuctionBeginningBidPrice();
			const gameAddress_ = await game_.getAddress();
			const bidTypes_ = ["ETH", "receive", "CST"];
			const roundNum_ = await game_.roundNum();

			/** @type {bigint} */
			const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();

			// [Comment-202609061]
			// Transactions submitted by different accounts do not inherently have a deterministic execution
			// order. Each transaction is therefore funded for any execution order, and the assertions below
			// do not depend on which randomly selected bid executes first.
			// [/Comment-202609061]
			for (let iterationIndex_ = 0; iterationIndex_ < 10; ++ iterationIndex_) {
				const bidTypeCombination_ = bidders_.map(() => bidTypes_[generateRandomUInt32() % bidTypes_.length]);
				const timeStamp_ = (await getLatestBlockTimestamp()) + 100n;

				/** @type {bigint} */
				let ethBidPriceBase_ = await game_.getNextEthBidPriceAdvanced(100n);
				expect(ethBidPriceBase_).equal(await game_.nextEthBidPrice());

				const ethBidValue_ = ethBidPriceBase_ * 10n;
				// const firstBidIndex_ = await game_.getTotalNumBids(roundNum_);
				const firstBidIndex_ = (await game_.roundStats(roundNum_)).numBids;
				const prevBidRaffleCumulativeWeight_ =
					(firstBidIndex_ > 0n) ?
					(await game_.getBidInfoAt(roundNum_, firstBidIndex_ - 1n)).raffleCumulativeWeight :
					0n;
				let beginningPrice_ = await getCstDutchAuctionBeginningBidPrice(game_, params_);
				let beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
				const submitBid_ = (bidType_, bidder_) => {
					switch (bidType_) {
						case "ETH":
							return game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: ethBidValue_, });
						case "receive":
							return bidder_.sendTransaction({ to: gameAddress_, value: ethBidValue_, });
						case "CST":
							return game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "", 0n);
						default:
							throw new Error(`Unexpected bid type: ${bidType_}`);
					}
				};

				let transactionResponses_;
				try {
					await hre.ethers.provider.send("evm_setAutomine", [false,]);
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);

					// Comment-202609061 applies to this combination.
					transactionResponses_ = [];
					for (let bidderIndex_ = 0; bidderIndex_ < bidders_.length; ++ bidderIndex_) {
						transactionResponses_.push(await submitBid_(bidTypeCombination_[bidderIndex_], bidders_[bidderIndex_]));
					}

					await hre.ethers.provider.send("evm_mine");
				} finally {
					await hre.ethers.provider.send("evm_setAutomine", [true,]);
				}

				const receipts_ = await Promise.all(
					transactionResponses_.map(transactionResponse_ =>
						hre.ethers.provider.getTransactionReceipt(transactionResponse_.hash)
					)
				);
				const combinationDescription_ = bidTypeCombination_.join("+");
				expect(new Set(receipts_.map(receipt_ => receipt_.blockNumber)).size, combinationDescription_).equal(1);
				expect(receipts_.map(receipt_ => receipt_.status), combinationDescription_).deep.equal([1, 1, 1]);
				const bidCstRewardAmounts_ =
					receipts_.map(receipt_ => findParsedEvent(receipt_, game_, "BidPlaced").args.bidCstRewardAmount);
				expect(bidCstRewardAmounts_.filter(value_ => value_ === 0n).length, combinationDescription_).equal(2);
				expect(bidCstRewardAmounts_.filter(value_ => value_ > 0n).length, combinationDescription_).equal(1);

				// The raffle weights and the CST Dutch auction restarts depend on the execution order, so they are mirrored
				// in that order: a CST bid executed after another CST bid in the same block pays the whole new beginning
				// bid price and so gets the full ETH bid price base as its weight.
				const executedBids_ = receipts_.map((receipt_, submittedBidIndex_) => ({
					receipt: receipt_,
					bidType: bidTypeCombination_[submittedBidIndex_],
				})).sort((bid1_, bid2_) => bid1_.receipt.index - bid2_.receipt.index);
				let cumulativeWeightBeforeBid_ = prevBidRaffleCumulativeWeight_;
				for ( let executionIndex_ = 0; executionIndex_ < executedBids_.length; ++ executionIndex_ ) {
					const description_ = `${combinationDescription_}, executed bid ${executionIndex_}`;
					const bidInfo_ = await game_.getBidInfoAt(roundNum_, firstBidIndex_ + BigInt(executionIndex_));
					const bidPlaced_ = findParsedEvent(executedBids_[executionIndex_].receipt, game_, "BidPlaced");
					let expectedBidRaffleWeight_;
					if (executedBids_[executionIndex_].bidType !== "CST") {
						expectedBidRaffleWeight_ = ethBidPriceBase_;
						expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(beginningPrice_);
						ethBidPriceBase_ += ethBidPriceBase_ / ethBidPriceIncreaseDivisor_ + 1n;
					} else {
						const cstBidPriceBase_ = getV3CstBidPriceBase(beginningPrice_, timeStamp_ - beginningTimeStamp_, multiplier_, increment_);
						expect(bidPlaced_.args.paidCstPrice, description_).equal(cstBidPriceBase_);
						expectedBidRaffleWeight_ = getV3CstBidRaffleWeight(ethBidPriceBase_, cstBidPriceBase_, beginningPrice_);
						beginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(cstBidPriceBase_, multiplier_, divisor_);
						beginningTimeStamp_ = timeStamp_;
						expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_).equal(beginningPrice_);
					}
					expect(bidInfo_.raffleCumulativeWeight - cumulativeWeightBeforeBid_, description_).equal(expectedBidRaffleWeight_);
					cumulativeWeightBeforeBid_ = bidInfo_.raffleCumulativeWeight;
				}
				expect(await getCstDutchAuctionBeginningBidPrice(game_, params_), combinationDescription_).equal(beginningPrice_);
				expect(await game_.cstDutchAuctionBeginningTimeStamp(), combinationDescription_).equal(beginningTimeStamp_);
				expect(await game_.nextEthBidPrice(), combinationDescription_).equal(ethBidPriceBase_);
				expect(await game_.ethDutchAuctionBeginningBidPrice(), combinationDescription_).equal(ethDutchAuctionBeginningBidPrice_);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	// Tests `BiddingV3`'s late bid price premium: within a configurable duration before `mainPrizeTime`
	// (`getRoundLateBidDuration()`), both the ETH and the CST bid price get an exponentially growing
	// premium, reaching a total price of ~5x the base price at (and beyond) `mainPrizeTime` with the default parameters.
	it("adds an exponentially growing, capped premium to ETH and CST bid prices near mainPrizeTime", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			// #region Setup: V1 -> V2 -> V3, then activate the round.

			const bidder_ = contracts_.signers[1];
			await activateCurrentRound(game_, contracts_.ownerSigner);

			// #endregion
			// #region No bid in the round yet: no premium, even though the stale `mainPrizeTime` is in the past.

			{
				expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
				expect(await game_.getDurationUntilMainPrize()).lessThan(0n);
				const [ethDutchAuctionDuration_, elapsed_,] = await game_.getEthDutchAuctionDurations();
				const expectedPurePrice_ =
					ethDutchAuctionPrice(
						await game_.ethDutchAuctionBeginningBidPrice(),
						elapsed_,
						ethDutchAuctionDuration_,
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

			// The default 20-minute window grows with completed rounds.
			expect(roundLateBidDuration_).greaterThanOrEqual(20n * 60n);

			/** @type {bigint} */
			const baseMultiplier_ = await game_.roundLateBidPricePremiumAmountBaseMultiplier();
			/** @type {bigint} */
			const exponent_ = await game_.roundLateBidPricePremiumAmountExponent();
			/** @type {bigint} */
			const ethBidPriceBase_ = await game_.nextEthBidPrice();

			// #endregion
			// #region ETH premium curve: exact mirror, zero outside the window, monotonic and convex inside, ~4x cap.

			{
				/** @type {bigint} */
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const ts_ = await getLatestBlockTimestamp();
				const adjustedPriceAt_ =
					(durationUntilMainPrize_) =>
					addRoundLateBidPricePremiumAmountIfNeeded(
						ethBidPriceBase_,
						durationUntilMainPrize_,
						roundLateBidDuration_,
						mainPrizeTimeIncrementInMicroSeconds_,
						baseMultiplier_,
						exponent_
					);

				// Exact-mirror sweep of the curve; `durationUntilMainPrize` decreases left to right.
				for (const durationUntilMainPrize_ of [
					roundLateBidDuration_ + SECONDS_PER_HOUR,
					roundLateBidDuration_ + 3n,
					roundLateBidDuration_ + 2n,
					roundLateBidDuration_ + 1n,
					roundLateBidDuration_,
					roundLateBidDuration_ - 1n,
					roundLateBidDuration_ - 2n,
					roundLateBidDuration_ - 3n,
					roundLateBidDuration_ / 2n,
					roundLateBidDuration_ / 3n,
					10n,
					3n,
					2n,
					1n,
					0n,
					-1n,
					-2n,
					-3n,
					( - SECONDS_PER_HOUR ),
					roundLateBidDuration_ * (-10n),
				]) {
					const currentTimeOffset_ = mainPrizeTime_ - durationUntilMainPrize_ - ts_;
					expect(
						await game_.getNextEthBidPriceAdvanced(currentTimeOffset_),
						`ETH premium mismatch at durationUntilMainPrize == ${durationUntilMainPrize_}`
					).equal(adjustedPriceAt_(durationUntilMainPrize_));
				}
				// console.info();

				// No premium at or before the window opening.
				expect(adjustedPriceAt_(roundLateBidDuration_ + SECONDS_PER_HOUR)).equal(ethBidPriceBase_);
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
				expect(adjustedPriceAt_(-SECONDS_PER_HOUR)).equal(maxAdjustedPrice_);
				expect(adjustedPriceAt_(roundLateBidDuration_ * (-10n))).equal(maxAdjustedPrice_);
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
					const adjustedPrice_ =
						addRoundLateBidPricePremiumAmountIfNeeded(
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

					// The next price grows from the base after the bid closes the premium window.
					const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();
					const newEthBidPriceBase_ = ethBidPriceBase_ + ethBidPriceBase_ / ethBidPriceIncreaseDivisor_ + 1n;
					expect(await game_.nextEthBidPrice()).equal(newEthBidPriceBase_);
					expect((await game_.mainPrizeTime()) - (await getLatestBlockTimestamp())).greaterThan(roundLateBidDuration_);
					expect(await game_.getNextEthBidPrice()).equal(newEthBidPriceBase_);
				}
			}

			// #endregion
			// #region CST premium curve: exact mirror on top of the V3 CST price decline, with the premium base floored at R.

			{
				// No CST bid has been placed in this round, so the first CST Dutch auction has been declining from the maximum
				// beginning bid price since the first bid of the round, and it ended about one increment before the premium
				// window, which the real ETH bid above pushed by one increment. So the base is zero throughout the window,
				// and the premium of a CST bid is calculated from one increment of reward (Comment-202611026).
				expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
				const params_ = await readCstPricingParams(game_);
				const rewardPerIncrement_ = params_.rewardAmountPerMainPrizeTimeIncrement;
				const cstDutchAuctionBeginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
				/** @type {bigint} */
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const ts_ = await getLatestBlockTimestamp();
				expect(mainPrizeTime_ - roundLateBidDuration_).greaterThan(ts_);
				const cstDutchAuctionDuration_ = await assertCstAuctionDurations(game_, params_);
				expect(cstDutchAuctionBeginningTimeStamp_ + cstDutchAuctionDuration_).lessThan(mainPrizeTime_ - roundLateBidDuration_);

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
					const cstBidPriceBase_ =
						getV3CstBidPriceBase(
							params_.cstDutchAuctionBeginningBidPriceMaxLimit,
							sampleTs_ - cstDutchAuctionBeginningTimeStamp_,
							params_.bidCstRewardAmountMultiplier,
							mainPrizeTimeIncrementInMicroSeconds_
						);
					expect(cstBidPriceBase_).equal(0n);
					expect(await game_.getNextCstBidPriceBaseAdvanced(sampleTs_ - ts_)).equal(0n);
					const adjustedCstPrice_ =
						addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded(
							cstBidPriceBase_,
							params_.bidCstRewardAmountMultiplier,
							durationUntilMainPrize_,
							roundLateBidDuration_,
							mainPrizeTimeIncrementInMicroSeconds_,
							baseMultiplier_,
							exponent_
						);

					// The CST premium on a zero base equals the premium an ETH bid at a base of R would get.
					expect(adjustedCstPrice_).equal(
						addRoundLateBidPricePremiumAmountIfNeeded(
							rewardPerIncrement_,
							durationUntilMainPrize_,
							roundLateBidDuration_,
							mainPrizeTimeIncrementInMicroSeconds_,
							baseMultiplier_,
							exponent_
						) -
						rewardPerIncrement_
					);

					expect(
						await game_.getNextCstBidPriceAdvanced(sampleTs_ - ts_),
						`CST premium mismatch at durationUntilMainPrize == ${durationUntilMainPrize_}`
					).equal(adjustedCstPrice_);
					if (durationUntilMainPrize_ <= 0n) {
						// The maximum premium AMOUNT is ~4x the premium base (Comment-202607119), which is R here.
						expect(adjustedCstPrice_).greaterThan(rewardPerIncrement_ * 4n * 99n / 100n);
						expect(adjustedCstPrice_).lessThan(rewardPerIncrement_ * 4n * 101n / 100n);
					}
				}
			}

			// #endregion
			// #region

			await finishGameRound(contracts_, game_);

			// #endregion
		}, 3, 3);
	});

	it("records premium-inclusive paid amounts without increasing price anchors or raffle weights", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;
			const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: mainPrizeTimeIncrement_,
				initialDurationUntilMainPrizeDivisor: divisor_,
				rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
				roundLateBidDuration: lateDuration_,
				roundLateBidPricePremiumAmountBaseMultiplier: baseMultiplier_,
				roundLateBidPricePremiumAmountExponent: exponent_,
			} = params_;
			await waitForTransactionReceipt(
				contracts_.randomWalkNft.connect(bidder2_).mint({ value: await contracts_.randomWalkNft.getMintPrice(), })
			);
			const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
			const roundNum_ = await game_.roundNum();
			const expectedStats_ = {
				numBids: 0n,
				numCstBids: 0n,
				totalSpentEthAmount: 0n,
				totalSpentCstAmount: 0n,
				maxEthBidPrice: 0n,
				maxCstBidPrice: 0n,
			};
			await assertRoundBidStats(game_, roundNum_, expectedStats_);
			const firstEthPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
			await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 1n);
			expectedStats_.numBids = 1n;
			expectedStats_.totalSpentEthAmount = firstEthPrice_;
			expectedStats_.maxEthBidPrice = firstEthPrice_;
			await assertRoundBidStats(game_, roundNum_, expectedStats_);

			const gameAddress_ = await game_.getAddress();
			for (const donate_ of [
				() => game_.connect(bidder2_).donateEth({ value: 13n }),
				() => game_.connect(bidder2_).donateEthWithInfo("{}", { value: 19n }),
			]) {
				await waitForTransactionReceipt(donate_());
				await assertRoundBidStats(game_, roundNum_, expectedStats_);
			}

			// Model a forced ETH transfer's balance-only effect without calling a game entry point.
			const forcedBalance_ = (await hre.ethers.provider.getBalance(gameAddress_)) + 23n;
			await hre.ethers.provider.send("hardhat_setBalance", [gameAddress_, hre.ethers.toQuantity(forcedBalance_)]);
			expect(await hre.ethers.provider.getBalance(gameAddress_)).equal(forcedBalance_);
			await assertRoundBidStats(game_, roundNum_, expectedStats_);

			const increaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();
			const ethAuctionBeginningPrice_ = await game_.ethDutchAuctionBeginningBidPrice();
			let cumulativeWeight_ = (await game_.getBidInfoAt(roundNum_, 0n)).raffleCumulativeWeight;

			// Exercise deep-window ETH and receive bids, then an NFT-assisted bid past the deadline.
			for (const bidType_ of ["ETH", "receive", "NFT"]) {
				const bidder_ = (bidType_ === "NFT") ? bidder2_ : bidder1_;
				const ethBidPriceBase_ = await game_.nextEthBidPrice();
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const bidTimeStamp_ = mainPrizeTime_ + ((bidType_ === "NFT") ? 123n : -lateDuration_ / 8n);
				const adjustedPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
					ethBidPriceBase_, mainPrizeTime_ - bidTimeStamp_, lateDuration_, mainPrizeTimeIncrement_, baseMultiplier_, exponent_
				);
				expect(adjustedPrice_).greaterThan(ethBidPriceBase_ * 2n);
				const quotedPrice_ = (bidType_ === "NFT") ? (adjustedPrice_ + 1n) / 2n : adjustedPrice_;

				// Equal EIP-1559 fee and priority caps make tx.gasprice equal to this value.
				const { maxFeePerGas: gasPrice_, } = await hre.ethers.provider.getFeeData();
				const swallowLimit_ = (await game_.ethBidRefundAmountInGasToSwallowMaxLimit()) * gasPrice_;
				expect(swallowLimit_).greaterThan(0n);

				// ETH refunds excess above the limit; receive() retains a one-wei excess; NFT pays exactly.
				const overpayment_ = (bidType_ === "ETH") ? swallowLimit_ + 1n : ((bidType_ === "receive") ? 1n : 0n);
				const paidPrice_ = quotedPrice_ + ((bidType_ === "receive") ? overpayment_ : 0n);
				const sentAmount_ = quotedPrice_ + overpayment_;
				// const spentBefore_ = (await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[0];
				const spentBefore_ = (await game_.biddersInfo(roundNum_, bidder_.address)).totalSpentEthAmount;
				const gameBalanceBefore_ = await hre.ethers.provider.getBalance(gameAddress_);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
				const receipt_ = await waitForTransactionReceipt(
					(bidType_ === "receive") ?
					bidder_.sendTransaction({ to: gameAddress_, value: sentAmount_, maxFeePerGas: gasPrice_, maxPriorityFeePerGas: gasPrice_, }) :
					game_.connect(bidder_).bidWithEth((bidType_ === "NFT") ? randomWalkNftId_ : -1n, "", 0n, { value: sentAmount_, maxFeePerGas: gasPrice_, maxPriorityFeePerGas: gasPrice_, })
				);
				expect(receipt_.gasPrice).equal(gasPrice_);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidEthPrice).equal(paidPrice_);
				// expect((await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[0] - spentBefore_).equal(paidPrice_);
				expect((await game_.biddersInfo(roundNum_, bidder_.address)).totalSpentEthAmount - spentBefore_).equal(paidPrice_);
				expect((await hre.ethers.provider.getBalance(gameAddress_)) - gameBalanceBefore_).equal(paidPrice_);
				++ expectedStats_.numBids;
				expectedStats_.totalSpentEthAmount += paidPrice_;
				if (paidPrice_ > expectedStats_.maxEthBidPrice) expectedStats_.maxEthBidPrice = paidPrice_;
				await assertRoundBidStats(game_, roundNum_, expectedStats_);
				const newEthBidPriceBase_ = ethBidPriceBase_ + ethBidPriceBase_ / increaseDivisor_ + 1n;
				expect(await game_.nextEthBidPrice()).equal(newEthBidPriceBase_);
				expect(await game_.getNextEthBidPrice()).equal(newEthBidPriceBase_);
				expect(await game_.ethDutchAuctionBeginningBidPrice()).equal(ethAuctionBeginningPrice_);
				cumulativeWeight_ += ethBidPriceBase_;
				// expect((await game_.getBidInfoAt(roundNum_, (await game_.getTotalNumBids(roundNum_)) - 1n)).raffleCumulativeWeight)
				// 	.equal(cumulativeWeight_);
				expect((await game_.getBidInfoAt(roundNum_, (await game_.roundStats(roundNum_)).numBids - 1n)).raffleCumulativeWeight)
					.equal(cumulativeWeight_);
			}

			// Two CST bids inside the premium window. The first CST Dutch auction ended before the window opened, so the first
			// CST bid pays, on a zero base, a premium calculated from R, and gets a zero raffle weight. It restarts the auction
			// at 2R, so the second CST bid, one increment later, pays a premium calculated from its base of at least R.
			// Neither restart includes the premium, and V3 never writes the V2- next-round beginning price.
			const nextRoundFirstCstDutchAuctionBeginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
			for (let bidIndex_ = 0; bidIndex_ < 2; ++ bidIndex_) {
				const ethBidPriceBase_ = await game_.nextEthBidPrice();
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const bidTimeStamp_ = mainPrizeTime_ - lateDuration_ / 4n;
				const beginningPrice_ = await getCstDutchAuctionBeginningBidPrice(game_, params_);
				const cstBidPriceBase_ =
					getV3CstBidPriceBase(beginningPrice_, bidTimeStamp_ - (await game_.cstDutchAuctionBeginningTimeStamp()), multiplier_, mainPrizeTimeIncrement_);
				if (bidIndex_ === 0) {
					expect(cstBidPriceBase_).equal(0n);
				} else {
					expect(cstBidPriceBase_).at.least(rewardPerIncrement_);
					expect(cstBidPriceBase_).lessThan(rewardPerIncrement_ * 11n / 10n);
				}
				expect(await game_.getNextCstBidPriceBaseAdvanced(bidTimeStamp_ - (await getLatestBlockTimestamp()))).equal(cstBidPriceBase_);
				const adjustedPrice_ = addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded(
					cstBidPriceBase_, multiplier_, mainPrizeTime_ - bidTimeStamp_, lateDuration_, mainPrizeTimeIncrement_, baseMultiplier_, exponent_
				);
				expect(adjustedPrice_).greaterThan(cstBidPriceBase_);
				expect(await game_.getNextCstBidPriceAdvanced(bidTimeStamp_ - (await getLatestBlockTimestamp()))).equal(adjustedPrice_);
				const bidder_ = (bidIndex_ === 0) ? bidder1_ : bidder2_;

				// Share naturally earned CST rewards to fund the second premium-bearing CST bid.
				if (bidIndex_ > 0) {
					await waitForTransactionReceipt(token_.connect(bidder1_).transfer(bidder2_.address, adjustedPrice_));
				}

				const balanceBefore_ = await token_.balanceOf(bidder_.address);
				// const spentBefore_ = (await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[1];
				const spentBefore_ = (await game_.biddersInfo(roundNum_, bidder_.address)).totalSpentCstAmount;
				const receipt_ = await bidWithCstAt(game_, bidder_, bidTimeStamp_, adjustedPrice_);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice).equal(adjustedPrice_);
				expect(balanceBefore_ - await token_.balanceOf(bidder_.address)).equal(adjustedPrice_);
				// expect((await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[1] - spentBefore_).equal(adjustedPrice_);
				expect((await game_.biddersInfo(roundNum_, bidder_.address)).totalSpentCstAmount - spentBefore_).equal(adjustedPrice_);
				++ expectedStats_.numBids;
				++ expectedStats_.numCstBids;
				expectedStats_.totalSpentCstAmount += adjustedPrice_;
				if (adjustedPrice_ > expectedStats_.maxCstBidPrice) expectedStats_.maxCstBidPrice = adjustedPrice_;
				await assertRoundBidStats(game_, roundNum_, expectedStats_);
				const newBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(cstBidPriceBase_, multiplier_, divisor_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(newBeginningPrice_);
				expect((await game_.mainPrizeTime()) - (await getLatestBlockTimestamp())).greaterThan(lateDuration_);
				expect(await game_.getNextCstBidPrice()).equal(newBeginningPrice_);
				expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(nextRoundFirstCstDutchAuctionBeginningBidPrice_);
				expect(await game_.nextEthBidPrice()).equal(ethBidPriceBase_);
				const bidRaffleWeight_ = getV3CstBidRaffleWeight(ethBidPriceBase_, cstBidPriceBase_, beginningPrice_);
				if (bidIndex_ === 0) {
					expect(bidRaffleWeight_).equal(0n);
				} else {
					expect(bidRaffleWeight_).at.least(ethBidPriceBase_ / 2n);
					expect(bidRaffleWeight_).lessThan(ethBidPriceBase_);
				}
				cumulativeWeight_ += bidRaffleWeight_;
				// expect((await game_.getBidInfoAt(roundNum_, (await game_.getTotalNumBids(roundNum_)) - 1n)).raffleCumulativeWeight)
				// 	.equal(cumulativeWeight_);
				expect((await game_.getBidInfoAt(roundNum_, (await game_.roundStats(roundNum_)).numBids - 1n)).raffleCumulativeWeight)
					.equal(cumulativeWeight_);
			}

			// After the premium window closes, the last ETH bid can cost less than an earlier bid.
			const lastEthPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
			expect(lastEthPrice_).equal(await game_.nextEthBidPrice());
			expect(lastEthPrice_).lessThan(expectedStats_.maxEthBidPrice);
			await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 1n);
			++ expectedStats_.numBids;
			expectedStats_.totalSpentEthAmount += lastEthPrice_;
			await assertRoundBidStats(game_, roundNum_, expectedStats_);
			await finishGameRound(contracts_, game_);
			await assertRoundBidStats(game_, roundNum_, expectedStats_);
			await assertRoundBidStats(game_, roundNum_ + 1n, {
				numBids: 0n,
				numCstBids: 0n,
				totalSpentEthAmount: 0n,
				totalSpentCstAmount: 0n,
				maxEthBidPrice: 0n,
				maxCstBidPrice: 0n,
			});
		}, 3, 3);
	});

	it("a first V3 CST bid reaches token minting before inactive-round and wrong-bid-type guards", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const bidder_ = contracts_.signers[2];

		// Keep the round inactive while advancing past the derived end of the CST Dutch auction.
		// At that point the zero CST price cannot mask the attempted reward mint to `address(0)`.
		let latestTimeStamp_ = await getLatestBlockTimestamp();
		const cstDutchAuctionEndTimeStamp_ =
			(await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
		let bidTimeStamp_ = (cstDutchAuctionEndTimeStamp_ > latestTimeStamp_) ? cstDutchAuctionEndTimeStamp_ : latestTimeStamp_ + 1n;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundActivationTime(bidTimeStamp_ + 1_000n));
		latestTimeStamp_ = await getLatestBlockTimestamp();
		if (bidTimeStamp_ <= latestTimeStamp_) {
			bidTimeStamp_ = latestTimeStamp_ + 1n;
		}

		const currentTimeOffset_ = bidTimeStamp_ - latestTimeStamp_;
		expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_)).equal(0n);
		expect(await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_)).greaterThan(0n);
		expect(await game_.getDurationUntilRoundActivation()).greaterThan(0n);
		const totalSupplyBefore_ = await token_.totalSupply();

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
		await expect(game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "", 0n))
			.revertedWithCustomError(token_, "ERC20InvalidReceiver")
			.withArgs(hre.ethers.ZeroAddress);

		// The token error wins over both `RoundIsInactive` and `WrongBidType`, and all interim work rolls back.
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
		// expect(await game_.getTotalNumBids(await game_.roundNum())).equal(0n);
		expect((await game_.roundStats(await game_.roundNum())).numBids).equal(0n);
		expect(await token_.totalSupply()).equal(totalSupplyBefore_);
	});

	it("a reentrancy attempt via the ETH bid overpayment refund reverts the attacker's own bid only", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const { hostileBidder_ } = await configureRewardAndDeployHostileBidder(contracts_, game_);
			const deployerOfHostileContract_ = contracts_.signers[10];
			const eoaBidder1_ = contracts_.signers[1];

			await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 10n);

			// Mode 4 makes the contract reenter `bidWithEth` when it receives ETH.
			// A significantly overpaying bid triggers the refund, the refund triggers the reentry attempt,
			// the reentrancy guard reverts it, and that reverts the refund and the entire hostile bid.
			await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(4n));
			const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(2n);
			const roundNum_ = await game_.roundNum();
			const statsBefore_ = await game_.roundStats(roundNum_);
			await expect(
				hostileBidder_.connect(deployerOfHostileContract_).doBidWithEth(-1n, "reentry attempt", 0n, {value: ethBidPrice_ + 10n ** 18n,})
			).revertedWithCustomError(game_, "ReentrancyGuardReentrantCall");

			// The game is unaffected: the EOA is still the last bidder, and bidding continues normally.
			expect(await game_.lastBidderAddress()).equal(eoaBidder1_.address);
			expect(await game_.roundStats(roundNum_)).deep.equal(statsBefore_);
			await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 30n);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});
});
