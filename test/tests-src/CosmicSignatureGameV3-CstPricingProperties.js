"use strict";

// Property-based and differential tests of the V3 CST bid pricing rules (Comment-202611022), complementing the
// scenario tests in `CosmicSignatureGameV3-Bidding.js`, `CosmicSignatureGameV3-BidCstReward.js`, and
// `CosmicSignatureGameV3-BidRaffle.js`. The rules and the invariants I1 to I5 referred to below are stated in
// `docs/cosmic-signature-game-cst-bid-pricing.md`.
//    1. Differential testing of the quote getters against the JS mirrors over random parameter combinations,
//       including degenerate ones, before the first bid, after ETH bids, and after a CST bid.
//    2. The algebra of the rules in pure JS: conservation, the time to zero, the restart bounds and the exact cap condition,
//       the absence of a stationary point below the cap (I4), and the raffle weight fraction (I5).
//    3. Seeded random ETH and CST bid sequences on-chain, checking every bid against the mirror and the invariants I1 and I2,
//       and that every round's first auction begins afresh at `C` (I3).
//    4. The exact rounding shortfall of the conservation invariant I2 over many one-second bids.
// Every randomized test prints its seed. Set `FUZZ_SEED` to that value to reproduce a run with the same build flags.
// Iteration counts scale with `LONG_TEST_MODE_CODE` (Comment-202606305).

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const {
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR,
	MICROSECONDS_PER_SECOND,
	SECONDS_PER_MINUTE,
	SECONDS_PER_HOUR,
	SECONDS_PER_DAY,
} = require("../../src/CosmicSignatureConstants.js");
const { MAX_UINT256, minBigInt } = require("../../src/BigIntMathHelpers.js");
const { getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	getV3BidCstRewardAmount,
	getV3BidCstRewardAmountPerMainPrizeTimeIncrement,
	getV3CstDutchAuctionBeginningBidPriceMaxLimit,
	getV3NewCstDutchAuctionBeginningBidPrice,
	getV3CstBidPriceBase,
	getV3CstDutchAuctionDuration,
	getV3CstBidRaffleWeight,
} = require("../src/V3UpgradeTestHelpers.js");
const { testGameRounds, finishGameRound } = require("../src/GameRoundTestHelpers.js");
const { createSeededRandomSourceForTest, scaleWithTestMode } = require("../src/RandomizedTestHelpers.js");
const {
	activateCurrentRoundDeterministically,
	sendPinnedTransaction,
	getBidCstRewardRemainder,
	assertQuoteGettersMatchMirrorAt,
	assertDurationGettersMatchMirror,
	placeBidAndVerify,
	createRoundMirror,
	fundBiddersWithCstByHoldingAndFinishRound,
} = require("../src/CstPricingPropertyTestHelpers.js");

/** Full mode runs ten times more iterations than quick mode, medium mode three times more. */
const ITERATION_SCALE = scaleWithTestMode(1, 3, 10);

/**
Multipliers worth testing: zero makes `C` and `R` zero and the price constant; values below `MICROSECONDS_PER_SECOND`
make `R` round to zero; the default; and a huge one, under which the premium and duration arithmetic is nearest to overflowing.
*/
const INTERESTING_BID_CST_REWARD_AMOUNT_MULTIPLIERS = [0n, 1n, 999_999n, MICROSECONDS_PER_SECOND, DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, 10n ** 30n,];

/** Divisors worth testing: one makes `C` the whole multiplier; a million makes `C == R`, so `S` can never exceed `R`. */
const INTERESTING_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISORS = [1n, 2n, DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR, MICROSECONDS_PER_SECOND,];

/** Durations above this are only the "infinite" `MAX_UINT256` of a zero multiplier; offsets are not sampled around them. */
const SANE_CST_DUTCH_AUCTION_DURATION_MAX_LIMIT = 10n ** 12n;

/**
Builds the parameter combinations of the differential test: three that are always included, a seeded sample of the other
interesting pairs, and seeded random pairs, mixing random and interesting values.
@returns {Array<{bidCstRewardAmountMultiplier: bigint, initialDurationUntilMainPrizeDivisor: bigint}>}
*/
function buildParameterCombinations(random_) {
	const toCombination_ = (multiplier_, divisor_) => ({ bidCstRewardAmountMultiplier: multiplier_, initialDurationUntilMainPrizeDivisor: divisor_, });
	const randomMultiplier_ = () => random_.nextBigIntInRange(10n ** 18n, 10n ** 28n);
	const randomDivisor_ = () => random_.nextBigIntInRange(2n, 100_000n);
	const alwaysIncluded_ = [
		toCombination_(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR),
		toCombination_(0n, DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR),
		toCombination_(10n ** 30n, 1n),
	];
	const otherInteresting_ = [];
	for (const multiplier_ of INTERESTING_BID_CST_REWARD_AMOUNT_MULTIPLIERS) {
		for (const divisor_ of INTERESTING_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISORS) {
			if ( ! alwaysIncluded_.some((combination_) => combination_.bidCstRewardAmountMultiplier === multiplier_ && combination_.initialDurationUntilMainPrizeDivisor === divisor_) ) {
				otherInteresting_.push(toCombination_(multiplier_, divisor_));
			}
		}
	}
	random_.shuffle(otherInteresting_);
	const numOtherInteresting_ = Math.min(otherInteresting_.length, 6 * ITERATION_SCALE);
	const numRandom_ = 4 * ITERATION_SCALE;
	const randomCombinations_ = [];
	for (let index_ = 0; index_ < numRandom_; ++ index_) {
		switch (index_ % 3) {
			case 0: randomCombinations_.push(toCombination_(randomMultiplier_(), randomDivisor_())); break;
			case 1: randomCombinations_.push(toCombination_(random_.pick(INTERESTING_BID_CST_REWARD_AMOUNT_MULTIPLIERS), randomDivisor_())); break;
			default: randomCombinations_.push(toCombination_(randomMultiplier_(), random_.pick(INTERESTING_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISORS))); break;
		}
	}
	return [...alwaysIncluded_, ...otherInteresting_.slice(0, numOtherInteresting_), ...randomCombinations_,];
}

/**
Samples timestamps at which to compare the quote getters with the mirror: in the past (before and at `T0`), now,
within the auction, around the moment the base reaches zero, far beyond it, and, once a bid exists,
around the late-bid window and `mainPrizeTime`.
*/
function sampleQuoteTimeStamps(random_, mirror_, latestTimeStamp_) {
	/** @type {bigint} */
	const increment_ = mirror_.params.mainPrizeTimeIncrement;
	/** @type {bigint} */
	const roundLateBidDuration_ = mirror_.params.roundLateBidDuration;
	/** @type {bigint} */
	const beginningTimeStamp_ = mirror_.beginningTimeStamp;
	/** @type {bigint} */
	const duration_ = mirror_.cstDutchAuctionDuration;
	const timeStamps_ = [
		latestTimeStamp_ - random_.nextBigIntInRange(1n, 30n * SECONDS_PER_DAY),
		beginningTimeStamp_ - 1n,
		beginningTimeStamp_,
		beginningTimeStamp_ + 1n,
		latestTimeStamp_ - 1n,
		latestTimeStamp_,
		latestTimeStamp_ + 1n,
		latestTimeStamp_ + random_.nextBigIntInRange(1n, increment_),
		latestTimeStamp_ + random_.nextBigIntInRange(1n, 100n * 366n * SECONDS_PER_DAY),
	];
	if (duration_ <= SANE_CST_DUTCH_AUCTION_DURATION_MAX_LIMIT) {
		timeStamps_.push(
			beginningTimeStamp_ + random_.nextBigIntInRange(0n, duration_),
			beginningTimeStamp_ + duration_ - 1n,
			beginningTimeStamp_ + duration_,
			beginningTimeStamp_ + duration_ + 1n,
			beginningTimeStamp_ + duration_ + random_.nextBigIntInRange(1n, 100n * SECONDS_PER_DAY),
		);
	}
	if (mirror_.hasBidder) {
		/** @type {bigint} */
		const mainPrizeTime_ = mirror_.mainPrizeTime;
		timeStamps_.push(
			mainPrizeTime_ - roundLateBidDuration_ - 1n,
			mainPrizeTime_ - roundLateBidDuration_,
			mainPrizeTime_ - roundLateBidDuration_ + 1n,
			mainPrizeTime_ - random_.nextBigIntInRange(1n, roundLateBidDuration_),
			mainPrizeTime_ - 1n,
			mainPrizeTime_,
			mainPrizeTime_ + 1n,
			mainPrizeTime_ + random_.nextBigIntInRange(1n, increment_),
		);
	}
	return timeStamps_;
}

/** Checks the quote getters at the sampled timestamps and the offset-free getters, and returns how many sampled bases were positive and zero. */
async function assertQuoteGettersAtSampledTimeStamps(game_, mirror_, random_, description_) {
	await assertDurationGettersMatchMirror(game_, mirror_, description_);
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const counts_ = { positiveBases: 0, zeroBases: 0, premiums: 0, };
	for (const timeStamp_ of sampleQuoteTimeStamps(random_, mirror_, latestTimeStamp_)) {
		const quotes_ = await assertQuoteGettersMatchMirrorAt(game_, mirror_, timeStamp_, description_);
		if (quotes_.base > 0n) ++ counts_.positiveBases; else ++ counts_.zeroBases;
		if (quotes_.premium > 0n) ++ counts_.premiums;
	}
	return counts_;
}

/**
Picks, among candidate moments spanning the current auction, the late-bid window, and the time past `mainPrizeTime`,
a random one at which `bidderAddress_` can afford the mirrored CST bid price. The base reaches zero before the premium window
opens, so a moment with a zero price always exists when the multiplier is positive, and everything is free when it is zero.
*/
async function chooseAffordableCstBidTimeStamp(mirror_, random_, bidderAddress_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const { mainPrizeTimeIncrement: increment_, roundLateBidDuration: roundLateBidDuration_ } = mirror_.params;
	const beginningTimeStamp_ = mirror_.beginningTimeStamp;
	const duration_ = mirror_.cstDutchAuctionDuration;
	const candidates_ = [
		latestTimeStamp_ + 1n,
		latestTimeStamp_ + random_.nextBigIntInRange(1n, increment_),
		mirror_.mainPrizeTime - random_.nextBigIntInRange(1n, roundLateBidDuration_),
		mirror_.mainPrizeTime + random_.nextBigIntInRange(0n, increment_),
	];
	if (duration_ <= SANE_CST_DUTCH_AUCTION_DURATION_MAX_LIMIT) {
		candidates_.push(
			beginningTimeStamp_ + duration_ / 4n,
			beginningTimeStamp_ + duration_ / 2n,
			beginningTimeStamp_ + duration_ * 3n / 4n,
			beginningTimeStamp_ + duration_ - 1n,
			beginningTimeStamp_ + duration_,
			beginningTimeStamp_ + duration_ + random_.nextBigIntInRange(1n, SECONDS_PER_DAY),
		);
	}
	const balance_ = mirror_.expectedCstBalances.get(bidderAddress_);
	const affordable_ = candidates_.filter((timeStamp_) => timeStamp_ > latestTimeStamp_ && mirror_.quotesAt(timeStamp_).price <= balance_);
	expect(affordable_.length, "no affordable CST bid moment").greaterThan(0);
	return random_.pick(affordable_);
}

/**
Chooses the moment of the next bid of a random sequence: mostly small gaps, sometimes up to one increment,
occasionally inside the late-bid window, exactly when the base reaches zero (which forces a CST bid), past `mainPrizeTime`,
or a long gap. `mainPrizeTime` runs away from the present under quick bidding, so the window and the deadline can be
far ahead; a jump there ends the current auction, which is intended. Conversely, a bid moves a passed deadline by only
one increment (Comment-202606175), so jumps past it are bounded to a few increments and are not made while it is passed,
which keeps most bids in the ordinary premium-free regime.
@returns {{timeStamp: bigint, forceCst: boolean}}
*/
function chooseNextRandomBidTimeStamp(random_, mirror_, latestTimeStamp_) {
	const { mainPrizeTimeIncrement: increment_, roundLateBidDuration: roundLateBidDuration_ } = mirror_.params;
	const deadlinePassed_ = mirror_.mainPrizeTime <= latestTimeStamp_;
	const roll_ = random_.nextIntInRange(0, 99);
	if (roll_ < 40) {
		return { timeStamp: latestTimeStamp_ + random_.nextBigIntInRange(1n, SECONDS_PER_MINUTE), forceCst: false, };
	}
	if (roll_ < 65) {
		return { timeStamp: latestTimeStamp_ + random_.nextBigIntInRange(SECONDS_PER_MINUTE + 1n, 15n * SECONDS_PER_MINUTE), forceCst: false, };
	}
	if (roll_ < 80) {
		return { timeStamp: latestTimeStamp_ + random_.nextBigIntInRange(15n * SECONDS_PER_MINUTE + 1n, increment_), forceCst: false, };
	}
	if (roll_ < 88) {
		const timeStamp_ = mirror_.mainPrizeTime - random_.nextBigIntInRange(1n, roundLateBidDuration_);
		if (timeStamp_ > latestTimeStamp_) {
			return { timeStamp: timeStamp_, forceCst: false, };
		}
	} else if (roll_ < 93) {
		const timeStamp_ = mirror_.beginningTimeStamp + mirror_.cstDutchAuctionDuration;
		if (timeStamp_ > latestTimeStamp_ && timeStamp_ <= mirror_.mainPrizeTime + 2n * increment_) {
			return { timeStamp: timeStamp_, forceCst: true, };
		}
	} else if (roll_ < 97) {
		if ( ! deadlinePassed_ ) {
			return { timeStamp: mirror_.mainPrizeTime + random_.nextBigIntInRange(0n, increment_), forceCst: false, };
		}
	} else if ( ! deadlinePassed_ ) {
		return { timeStamp: latestTimeStamp_ + random_.nextBigIntInRange(increment_ + 1n, 3n * increment_), forceCst: false, };
	}
	return { timeStamp: latestTimeStamp_ + random_.nextBigIntInRange(1n, 10n * SECONDS_PER_MINUTE), forceCst: false, };
}

describe("CosmicSignatureGameV3-CstPricingProperties", function () {
	it("quotes the CST base, price, reward, auction durations, and late-bid duration exactly as the JS mirrors across random parameter combinations, before the first bid, after ETH bids, and after a CST bid", async function () {
		const random_ = createSeededRandomSourceForTest("CstPricingProperties: quote getters vs mirrors");
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const ownerGame_ = game_.connect(contracts_.ownerSigner);
		const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);
		const nonceManagedSigners_ = [contracts_.ownerSigner, bidder1_, bidder2_,];

		// A funding round at a very high reward rate, so that under most combinations the bidders can afford a CST bid
		// anywhere in the auction, including near the asking price `C`. Each bidder earns twice `C` of that rate.
		{
			const fundingMultiplier_ = 10n ** 30n;
			await sendPinnedTransaction(() => ownerGame_.setBidCstRewardAmountMultiplier(fundingMultiplier_));
			const holdDuration_ = 2n * (await game_.mainPrizeTimeIncrementInMicroSeconds()) / DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR;
			await fundBiddersWithCstByHoldingAndFinishRound(contracts_, game_, [bidder1_, bidder2_], holdDuration_);
			for (const bidder_ of [bidder1_, bidder2_]) {
				expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address))
					.at.least(2n * getV3CstDutchAuctionBeginningBidPriceMaxLimit(fundingMultiplier_, DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR) * 99n / 100n);
			}
		}

		const combinations_ = buildParameterCombinations(random_);
		const stats_ = { combinations: 0, cstBidsAtPositiveBase: 0, freeCstBids: 0, cappedRestarts: 0, sampledPositiveBases: 0, sampledZeroBases: 0, sampledPremiums: 0, };
		for (const combination_ of combinations_) {
			const { bidCstRewardAmountMultiplier: multiplier_, initialDurationUntilMainPrizeDivisor: divisor_ } = combination_;
			const description_ = `multiplier ${multiplier_}, divisor ${divisor_}`;

			// Each combination runs on a snapshot of the inactive round and is reverted afterwards, so the combinations
			// are independent and the blockchain time stays sane under divisors that make the initial duration decades long.
			const snapshotId_ = await hre.ethers.provider.send("evm_snapshot", []);
			try {
				await sendPinnedTransaction(() => ownerGame_.setBidCstRewardAmountMultiplier(multiplier_));
				await sendPinnedTransaction(() => ownerGame_.setInitialDurationUntilMainPrizeDivisor(divisor_));
				await activateCurrentRoundDeterministically(game_, contracts_.ownerSigner);
				const mirror_ = await createRoundMirror(contracts_, game_, [bidder1_, bidder2_]);
				const params_ = mirror_.params;
				expect(params_.bidCstRewardAmountMultiplier, description_).equal(multiplier_);
				expect(params_.initialDurationUntilMainPrizeDivisor, description_).equal(divisor_);
				expect(params_.rewardAmountPerMainPrizeTimeIncrement).equal(multiplier_ / MICROSECONDS_PER_SECOND);
				expect(params_.cstDutchAuctionBeginningBidPriceMaxLimit).equal(multiplier_ / divisor_);
				expect(params_.initialDurationUntilMainPrize).equal(await game_.getInitialDurationUntilMainPrize());
				if (multiplier_ === 0n) {
					// The zero-multiplier guard of `_getCstDutchAuctionDuration`.
					expect(mirror_.cstDutchAuctionDuration).equal(MAX_UINT256);
				} else {
					// `C` is the reward of the initial duration until main prize up to rounding (Comment-202611025).
					// `C == floor(multiplier / divisor)` discards less than one Wei, which is worth `increment / multiplier` seconds
					// of decline, so the first auction lasts the initial duration up to one second longer, or up to that many
					// seconds shorter. With the default parameters, that is zero seconds, because a second of decline is many Wei.
					expect(mirror_.cstDutchAuctionDuration, description_).at.most(params_.initialDurationUntilMainPrize + 1n);
					expect(mirror_.cstDutchAuctionDuration + params_.mainPrizeTimeIncrementInMicroSeconds / multiplier_, description_)
						.at.least(params_.initialDurationUntilMainPrize);
				}

				/**
				Checks the getters at the sampled moments and that the samples covered what the state allows: a positive base
				(at `T0`) whenever `S` is positive, a zero base (at or beyond the time to zero) always, and, once a bid exists,
				a positive premium (at `mainPrizeTime`) whenever `R` is positive, because the premium is calculated from at least `R`.
				*/
				const assertSampledQuotes_ = async (stateDescription_) => {
					const counts_ = await assertQuoteGettersAtSampledTimeStamps(game_, mirror_, random_, `${description_}, ${stateDescription_}`);
					if (mirror_.beginningPrice > 0n) {
						expect(counts_.positiveBases, `${description_}, ${stateDescription_}: positive bases sampled`).at.least(1);
					}
					expect(counts_.zeroBases, `${description_}, ${stateDescription_}: zero bases sampled`).at.least(1);
					if (mirror_.hasBidder && params_.rewardAmountPerMainPrizeTimeIncrement > 0n) {
						expect(counts_.premiums, `${description_}, ${stateDescription_}: premiums sampled`).at.least(1);
					}
					stats_.sampledPositiveBases += counts_.positiveBases;
					stats_.sampledZeroBases += counts_.zeroBases;
					stats_.sampledPremiums += counts_.premiums;
				};

				// No bid in the round: the auction is the maximum one, timed from the stale `T0`, with no premium and
				// a meaningless reward getter (Comment-202501022), which is therefore not compared.
				await assertSampledQuotes_("before the first bid");

				// The first ETH bid starts the auction at `C`; a second ETH bid lets the first bidder earn and leaves the auction alone.
				await placeBidAndVerify(contracts_, game_, mirror_, bidder1_, "ETH", (await getLatestBlockTimestamp()) + random_.nextBigIntInRange(1n, 100n), `, ${description_}`);
				await assertSampledQuotes_("after the first ETH bid");
				await placeBidAndVerify(contracts_, game_, mirror_, bidder2_, "ETH", (await getLatestBlockTimestamp()) + random_.nextBigIntInRange(1n, params_.mainPrizeTimeIncrement), `, ${description_}`);

				// A CST bid at a random affordable moment restarts the auction; the getters follow the restarted auction.
				{
					const cstBidTimeStamp_ = await chooseAffordableCstBidTimeStamp(mirror_, random_, bidder1_.address);
					const result_ = await placeBidAndVerify(contracts_, game_, mirror_, bidder1_, "CST", cstBidTimeStamp_, `, ${description_}`);
					if (result_.base > 0n) ++ stats_.cstBidsAtPositiveBase; else ++ stats_.freeCstBids;
					if (result_.cstDutchAuctionBeginningBidPrice === params_.cstDutchAuctionBeginningBidPriceMaxLimit) ++ stats_.cappedRestarts;
				}
				await assertSampledQuotes_("after the CST bid");
				++ stats_.combinations;
			} finally {
				expect(await hre.ethers.provider.send("evm_revert", [snapshotId_,])).equal(true);

				// The revert rolls the on-chain nonces back.
				for (const signer_ of nonceManagedSigners_) {
					signer_.reset();
				}
			}
		}
		expect(stats_.combinations).equal(combinations_.length);
		console.info("%s", `CstPricingProperties: quote getters vs mirrors: ${JSON.stringify(stats_)}`);
	});

	it("in pure JS, conserves S exactly, reaches zero exactly at the derived duration, restarts within [2R, C] and at C iff base >= ceil(C / 2) - R, escalates at least to min(2S, C) under any spacing up to one increment, and weighs by the exact fraction paid", function () {
		const random_ = createSeededRandomSourceForTest("CstPricingProperties: pure JS algebra");
		const numIterations_ = 8_000 * ITERATION_SCALE;
		const counts_ = { iterations: 0, positiveBases: 0, zeroBases: 0, cappedRestarts: 0, uncappedRestarts: 0, zeroWeightsAtPositiveBase: 0, recursions: 0, };

		// The Hardhat chai matchers make every bigint comparison cost tens of microseconds, which would dominate this loop,
		// so each check is a plain comparison that records its message on failure, and every iteration asserts once
		// that nothing failed.
		const failures_ = [];
		const check_ = (condition_, message_) => {
			if ( ! condition_ ) {
				failures_.push(message_);
			}
		};

		for (let iteration_ = 0; iteration_ < numIterations_; ++ iteration_) {
			// Random parameters: the multiplier from below the reward resolution to huge, increments from a minute to a week,
			// divisors up to a hundred thousand. `C >= 2R` holds unless the divisor exceeds about half a million,
			// so the sampled combinations satisfy the precondition of the restart bounds.
			const multiplier_ = random_.pick([
				random_.nextBigIntInRange(1n, 10n ** 30n),
				random_.nextBigIntInRange(MICROSECONDS_PER_SECOND, 10n ** 28n),
				DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
			]);
			const increment_ = random_.nextBigIntInRange(SECONDS_PER_MINUTE, 7n * SECONDS_PER_DAY) * MICROSECONDS_PER_SECOND;
			const incrementInSeconds_ = increment_ / MICROSECONDS_PER_SECOND;
			const divisor_ = random_.nextBigIntInRange(1n, 100_000n);
			const rewardPerIncrement_ = getV3BidCstRewardAmountPerMainPrizeTimeIncrement(multiplier_);
			const maxLimit_ = getV3CstDutchAuctionBeginningBidPriceMaxLimit(multiplier_, divisor_);
			const description_ = `multiplier ${multiplier_}, increment ${increment_}, divisor ${divisor_}`;
			check_(maxLimit_ >= 2n * rewardPerIncrement_, `${description_}: C >= 2R`);
			++ counts_.iterations;

			// Rule 1 and invariant I2 in the continuous form: while the base is positive, `base + reward(elapsed) == S` exactly,
			// because one floored reward is subtracted from `S`. Once the base is zero, the reward alone is at least `S`.
			const beginningPrice_ = random_.nextBigIntInRange(2n * rewardPerIncrement_, maxLimit_);
			const duration_ = getV3CstDutchAuctionDuration(beginningPrice_, multiplier_, increment_);
			{
				const elapsedDuration_ = random_.nextBigIntInRange( - incrementInSeconds_, 2n * duration_ + incrementInSeconds_);
				const base_ = getV3CstBidPriceBase(beginningPrice_, elapsedDuration_, multiplier_, increment_);
				const rewardAmount_ = getV3BidCstRewardAmount(elapsedDuration_, multiplier_, increment_);
				if (base_ > 0n) {
					check_(base_ + rewardAmount_ === beginningPrice_, `${description_}: conservation at elapsed ${elapsedDuration_}`);
					++ counts_.positiveBases;
				} else {
					check_(rewardAmount_ >= beginningPrice_, `${description_}: reward after zero at elapsed ${elapsedDuration_}`);
					++ counts_.zeroBases;
				}
				if (elapsedDuration_ <= 0n) {
					check_(base_ === beginningPrice_, `${description_}: base before the beginning`);
				}
			}

			// The derived duration is the least elapsed duration at which the base is zero.
			check_(duration_ === (beginningPrice_ * increment_ + (multiplier_ - 1n)) / multiplier_, `${description_}: duration formula`);
			check_(getV3CstBidPriceBase(beginningPrice_, duration_, multiplier_, increment_) === 0n, `${description_}: base at the duration`);
			if (duration_ > 0n) {
				check_(getV3CstBidPriceBase(beginningPrice_, duration_ - 1n, multiplier_, increment_) > 0n, `${description_}: base one second before the duration`);
			} else {
				check_(beginningPrice_ === 0n, `${description_}: zero duration`);
			}

			// Rule 2: for any base in `[0, C]`, the restart is within `[2R, C]`, and it is `C` exactly when `2 * (base + R) >= C`,
			// i.e. `base + R >= ceil(C / 2)`, both sides being integers.
			{
				const capThreshold_ = (maxLimit_ + 1n) / 2n - rewardPerIncrement_;
				const bases_ = [random_.nextBigIntInRange(0n, maxLimit_), 0n, maxLimit_,];
				if (capThreshold_ >= 0n && capThreshold_ <= maxLimit_) bases_.push(capThreshold_);
				if (capThreshold_ >= 1n && capThreshold_ - 1n <= maxLimit_) bases_.push(capThreshold_ - 1n);
				for (const base_ of bases_) {
					const restart_ = getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_);
					check_(restart_ >= 2n * rewardPerIncrement_, `${description_}: restart of ${base_} lower bound`);
					check_(restart_ <= maxLimit_, `${description_}: restart of ${base_} upper bound`);
					check_((restart_ === maxLimit_) === (base_ >= capThreshold_), `${description_}: restart of ${base_} cap condition`);
					if (restart_ === maxLimit_) ++ counts_.cappedRestarts; else ++ counts_.uncappedRestarts;
				}
			}

			// Invariant I4: a CST bid placed up to one increment after the auction began restarts it at least at `min(2S, C)`,
			// so below the cap the recursion strictly escalates, and at the cap it stays there. This holds because
			// one increment of decline is at most `R`, which the restart adds back before doubling.
			{
				const spacing_ = random_.nextBigIntInRange(1n, incrementInSeconds_);
				check_(getV3BidCstRewardAmount(spacing_, multiplier_, increment_) <= rewardPerIncrement_, `${description_}: decline over one increment`);
				if (beginningPrice_ < maxLimit_ && beginningPrice_ > 0n) {
					const restart_ = getV3NewCstDutchAuctionBeginningBidPrice(getV3CstBidPriceBase(beginningPrice_, spacing_, multiplier_, increment_), multiplier_, divisor_);
					check_(restart_ >= minBigInt(2n * beginningPrice_, maxLimit_), `${description_}: no stationary point at ${beginningPrice_}, spacing ${spacing_}`);
					check_(restart_ > beginningPrice_, `${description_}: strict escalation at ${beginningPrice_}, spacing ${spacing_}`);
				}
				check_(
					getV3NewCstDutchAuctionBeginningBidPrice(getV3CstBidPriceBase(maxLimit_, spacing_, multiplier_, increment_), multiplier_, divisor_) === maxLimit_,
					`${description_}: the cap is stationary at spacing ${spacing_}`
				);

				// The deadline-holding recursion from a free bid: one bid per increment at least doubles `S` until the cap,
				// and then holds it there. The number of doublings until the cap is at most `log2(C / 2R) + 1`.
				if (rewardPerIncrement_ > 0n && iteration_ % 50 === 0) {
					const numStepsMaxLimit_ = (maxLimit_ / (2n * rewardPerIncrement_)).toString(2).length + 1;
					let price_ = 2n * rewardPerIncrement_;
					let numSteps_ = 0;
					while (price_ < maxLimit_ && numSteps_ <= numStepsMaxLimit_) {
						const nextPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(getV3CstBidPriceBase(price_, incrementInSeconds_, multiplier_, increment_), multiplier_, divisor_);
						check_(nextPrice_ >= minBigInt(2n * price_, maxLimit_), `${description_}: recursion step ${numSteps_} from ${price_}`);
						price_ = nextPrice_;
						++ numSteps_;
					}
					check_(numSteps_ <= numStepsMaxLimit_, `${description_}: recursion length ${numSteps_}`);
					check_(price_ === maxLimit_, `${description_}: recursion reaches the cap`);
					check_(
						getV3NewCstDutchAuctionBeginningBidPrice(getV3CstBidPriceBase(price_, incrementInSeconds_, multiplier_, increment_), multiplier_, divisor_) === maxLimit_,
						`${description_}: recursion holds the cap`
					);
					++ counts_.recursions;
				}
			}

			// Rule 4 and invariant I5: the weight is `ethBase * base / S`, between zero and `ethBase`; it is `ethBase` iff the bid
			// paid the whole asking price, and it is zero iff `ethBase * base < S`, which for a positive base needs the base
			// to be below `S / ethBase`, a sub-Wei fraction of the asking price. Whenever `ethBase >= S`, zero weight means zero base.
			{
				const ethBidPriceBase_ = random_.pick([random_.nextBigIntInRange(1n, 10n ** 22n), random_.nextBigIntInRange(1n, 100n),]);
				const base_ = minBigInt(random_.pick([random_.nextBigIntInRange(0n, beginningPrice_), 0n, beginningPrice_, random_.nextBigIntInRange(0n, 10n),]), beginningPrice_);
				const weight_ = getV3CstBidRaffleWeight(ethBidPriceBase_, base_, beginningPrice_);
				const weightDescription_ = `${description_}: weight of base ${base_} at ETH base ${ethBidPriceBase_} and S ${beginningPrice_}`;
				if (beginningPrice_ > 0n) {
					check_(weight_ <= ethBidPriceBase_, `${weightDescription_}: upper bound`);
					check_((weight_ === ethBidPriceBase_) === (base_ === beginningPrice_), `${weightDescription_}: full weight iff the whole asking price`);
					check_((weight_ === 0n) === (ethBidPriceBase_ * base_ < beginningPrice_), `${weightDescription_}: zero weight condition`);
					if (ethBidPriceBase_ >= beginningPrice_) {
						check_((weight_ === 0n) === (base_ === 0n), `${weightDescription_}: zero weight iff zero base`);
					}
					if (weight_ === 0n && base_ > 0n) ++ counts_.zeroWeightsAtPositiveBase;
				} else {
					// A degenerate configuration made `C`, and so `S`, zero; the division guard yields a zero weight (Comment-202611027).
					check_(weight_ === 0n, `${weightDescription_}: zero S guard`);
				}
			}
			expect(failures_, `iteration ${iteration_}`).deep.equal([]);
		}
		expect(counts_.positiveBases).greaterThan(0);
		expect(counts_.zeroBases).greaterThan(0);
		expect(counts_.cappedRestarts).greaterThan(0);
		expect(counts_.uncappedRestarts).greaterThan(0);
		expect(counts_.recursions).greaterThan(0);
		console.info("%s", `CstPricingProperties: pure JS algebra: ${JSON.stringify(counts_)}`);
	});

	it("on-chain seeded random ETH and CST bid sequences satisfy the pricing, restart, raffle weight, and conservation rules on every bid, and every round's first auction begins afresh at C", async function () {
		const random_ = createSeededRandomSourceForTest("CstPricingProperties: random bid sequences");
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const randomBidders_ = contracts_.signers.slice(1, 5);

		// This bidder never bids in the random part, so its funds deterministically cover the tail of every round.
		const tailBidder_ = contracts_.signers[5];

		const numSequenceRounds_ = 3;
		const numRandomBidsPerRound_ = 50 * ITERATION_SCALE;
		const cstBidChancePercent_ = 45;

		// V3 neither reads nor writes these V2- variables (Comment-202611025).
		const nextRoundFirstCstDutchAuctionBeginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		const cstDutchAuctionBeginningBidPriceMinLimit_ = await game_.cstDutchAuctionBeginningBidPriceMinLimit();
		const assertRetiredVariablesUnchanged_ = async () => {
			expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(nextRoundFirstCstDutchAuctionBeginningBidPrice_);
			expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(cstDutchAuctionBeginningBidPriceMinLimit_);
		};

		const stats_ = {
			rounds: 0, ethBids: 0, cstBids: 0, cstBidsAtPositiveBase: 0, freeCstBids: 0, cappedRestarts: 0, uncappedRestarts: 0,
			bidsWithPremium: 0, bidsPastMainPrizeTime: 0, cstFallbacksToEth: 0, roundsWithStaleStoragePrice: 0,
		};
		let prevParams_ = undefined;
		let roundIndex_ = 0;
		await testGameRounds(contracts_, game_, async (contracts_, game_) => {
			if (roundIndex_ === 0) {
				// The funding round. A CST bid costs at most about `5C` (the base plus the maximal premium), so each random bidder
				// is funded for its share of the worst case, and the tail bidder for the tail chains of all the rounds.
				const initialDurationUntilMainPrize_ =
					(await game_.mainPrizeTimeIncrementInMicroSeconds()) / (await game_.initialDurationUntilMainPrizeDivisor());
				const numHoldsPerRandomBidder_ = BigInt(Math.ceil(numRandomBidsPerRound_ * numSequenceRounds_ * cstBidChancePercent_ / 100 * 5 / randomBidders_.length)) + 10n;
				await fundBiddersWithCstByHoldingAndFinishRound(contracts_, game_, [...randomBidders_, tailBidder_], numHoldsPerRandomBidder_ * initialDurationUntilMainPrize_);
				++ roundIndex_;
				return;
			}
			await activateCurrentRoundDeterministically(game_, contracts_.ownerSigner);
			const mirror_ = await createRoundMirror(contracts_, game_, [...randomBidders_, tailBidder_]);
			const params_ = mirror_.params;
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				rewardAmountPerMainPrizeTimeIncrement: rewardPerIncrement_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			} = params_;
			expect(maxLimit_).at.least(2n * rewardPerIncrement_);
			const roundDescription_ = `round ${mirror_.roundNum}`;

			// Invariant I3: the increment grew since the previous round, while `C` and `R` are the same, so the first auction
			// again lasts the initial duration up to a second (a second of decline is many Wei under the default parameters,
			// so the Wei that `C` rounds away is worth no whole second).
			if (prevParams_ !== undefined) {
				expect(increment_).greaterThan(prevParams_.mainPrizeTimeIncrementInMicroSeconds);
				expect(maxLimit_).equal(prevParams_.cstDutchAuctionBeginningBidPriceMaxLimit);
				expect(rewardPerIncrement_).equal(prevParams_.rewardAmountPerMainPrizeTimeIncrement);
			}
			expect(increment_ / multiplier_).equal(0n);
			expect(mirror_.cstDutchAuctionDuration).at.most(params_.initialDurationUntilMainPrize + 1n);
			expect(mirror_.cstDutchAuctionDuration).at.least(params_.initialDurationUntilMainPrize);
			prevParams_ = params_;

			// The storage may hold the previous round's last `S`; the first bid reports `C` regardless (checked by the executor).
			if ((await game_.cstDutchAuctionBeginningBidPrice()) !== maxLimit_) ++ stats_.roundsWithStaleStoragePrice;
			await placeBidAndVerify(contracts_, game_, mirror_, random_.pick(randomBidders_), "ETH", (await getLatestBlockTimestamp()) + random_.nextBigIntInRange(1n, SECONDS_PER_MINUTE), `, ${roundDescription_}`);
			++ stats_.ethBids;

			for (let bidIndex_ = 0; bidIndex_ < numRandomBidsPerRound_; ++ bidIndex_) {
				const bidder_ = random_.pick(randomBidders_);
				const { timeStamp: timeStamp_, forceCst: forceCst_ } = chooseNextRandomBidTimeStamp(random_, mirror_, await getLatestBlockTimestamp());
				let bidType_ = (forceCst_ || random_.chancePercent(cstBidChancePercent_)) ? "CST" : "ETH";
				if (bidType_ === "CST" && mirror_.expectedCstBalances.get(bidder_.address) < mirror_.quotesAt(timeStamp_).price) {
					bidType_ = "ETH";
					++ stats_.cstFallbacksToEth;
				}
				const result_ = await placeBidAndVerify(contracts_, game_, mirror_, bidder_, bidType_, timeStamp_, `, ${roundDescription_}, random bid ${bidIndex_}`);
				if (timeStamp_ >= mirror_.mainPrizeTime - params_.mainPrizeTimeIncrement) ++ stats_.bidsPastMainPrizeTime;
				if (bidType_ === "ETH") {
					++ stats_.ethBids;
				} else {
					++ stats_.cstBids;
					if (result_.base > 0n) ++ stats_.cstBidsAtPositiveBase; else ++ stats_.freeCstBids;
					if (result_.premium > 0n) ++ stats_.bidsWithPremium;
					if (result_.cstDutchAuctionBeginningBidPrice === maxLimit_) ++ stats_.cappedRestarts; else ++ stats_.uncappedRestarts;
				}
			}

			// The tail, deterministic in shape: a CST bid exactly when the base reaches zero, which buys no raffle weight and
			// restarts the auction at `2R`, and then one CST bid per second until the restart is capped. The mirror predicts
			// the chain: with `C == 24R`, the restarts are `2R`, about `6R`, about `14R`, and then `C`, so the chain has four bids.
			{
				const auctionEndTimeStamp_ = mirror_.beginningTimeStamp + mirror_.cstDutchAuctionDuration;
				const latestTimeStamp_ = await getLatestBlockTimestamp();
				const freeBidTimeStamp_ = (auctionEndTimeStamp_ > latestTimeStamp_) ? auctionEndTimeStamp_ : (latestTimeStamp_ + 1n);
				const expectedChainLength_ = (() => {
					let price_ = 2n * rewardPerIncrement_;
					let length_ = 1;
					while (price_ < maxLimit_) {
						price_ = getV3NewCstDutchAuctionBeginningBidPrice(getV3CstBidPriceBase(price_, 1n, multiplier_, increment_), multiplier_, params_.initialDurationUntilMainPrizeDivisor);
						++ length_;
					}
					return length_;
				})();
				expect(expectedChainLength_).equal(4);
				let timeStamp_ = freeBidTimeStamp_;
				for (let chainIndex_ = 0; chainIndex_ < expectedChainLength_; ++ chainIndex_) {
					const result_ = await placeBidAndVerify(contracts_, game_, mirror_, tailBidder_, "CST", timeStamp_, `, ${roundDescription_}, tail bid ${chainIndex_}`);
					++ stats_.cstBids;
					if (result_.premium > 0n) ++ stats_.bidsWithPremium;
					if (chainIndex_ === 0) {
						expect(result_.base, roundDescription_).equal(0n);
						expect(result_.bidRaffleWeight, roundDescription_).equal(0n);
						expect(result_.cstDutchAuctionBeginningBidPrice, roundDescription_).equal(2n * rewardPerIncrement_);
						++ stats_.freeCstBids;
					} else {
						expect(result_.base, roundDescription_).greaterThan(0n);
						expect(result_.bidRaffleWeight, roundDescription_).greaterThan(0n);
						++ stats_.cstBidsAtPositiveBase;
					}
					if (chainIndex_ === expectedChainLength_ - 1) {
						expect(result_.cstDutchAuctionBeginningBidPrice, roundDescription_).equal(maxLimit_);
						++ stats_.cappedRestarts;
					} else {
						expect(result_.cstDutchAuctionBeginningBidPrice, roundDescription_).lessThan(maxLimit_);
						++ stats_.uncappedRestarts;
					}
					timeStamp_ += 1n;
				}

				// A last free bid leaves `2R`, not `C`, in storage, which the next round's first bid must ignore (Comment-202611025).
				const result_ = await placeBidAndVerify(contracts_, game_, mirror_, tailBidder_, "CST", mirror_.beginningTimeStamp + mirror_.cstDutchAuctionDuration, `, ${roundDescription_}, last free bid`);
				++ stats_.cstBids;
				++ stats_.freeCstBids;
				++ stats_.uncappedRestarts;
				expect(result_.base, roundDescription_).equal(0n);
				expect(result_.cstDutchAuctionBeginningBidPrice, roundDescription_).equal(2n * rewardPerIncrement_);
				expect(result_.cstDutchAuctionBeginningBidPrice, roundDescription_).not.equal(maxLimit_);
			}

			// The whole round's CST accounting, and the retired V2- variables.
			for (const bidder_ of [...randomBidders_, tailBidder_]) {
				expect(await token_.balanceOf(bidder_.address), `${roundDescription_}: final CST balance of ${bidder_.address}`).equal(mirror_.expectedCstBalances.get(bidder_.address));
			}
			await assertRetiredVariablesUnchanged_();
			await finishGameRound(contracts_, game_);
			await assertRetiredVariablesUnchanged_();
			expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
			expect(await game_.cstDutchAuctionBeginningBidPrice(), "the claim leaves the last S in storage").equal(mirror_.beginningPrice);
			++ stats_.rounds;
			++ roundIndex_;
		}, 1 + numSequenceRounds_);
		expect(stats_.rounds).equal(numSequenceRounds_);

		// The V1 round and every sequence round left a beginning price other than `C` in storage.
		expect(stats_.roundsWithStaleStoragePrice).equal(numSequenceRounds_);
		expect(stats_.freeCstBids).at.least(numSequenceRounds_);
		expect(stats_.cappedRestarts).at.least(numSequenceRounds_);
		expect(stats_.uncappedRestarts).at.least(3 * numSequenceRounds_);
		expect(stats_.cstBidsAtPositiveBase).at.least(3 * numSequenceRounds_);
		console.info("%s", `CstPricingProperties: random bid sequences: ${JSON.stringify(stats_)}`);
	});

	it("accumulates at most one Wei of conservation shortfall per minted reward, exactly the floored sum of the remainders the rewards discard, over many one-second bids", async function () {
		const random_ = createSeededRandomSourceForTest("CstPricingProperties: rounding shortfall");
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const [ethBidder1_, ethBidder2_, cstBidder_] = contracts_.signers.slice(1, 4);
		const numOneSecondBids_ = 60 * ITERATION_SCALE;
		let roundIndex_ = 0;
		await testGameRounds(contracts_, game_, async (contracts_, game_) => {
			if (roundIndex_ === 0) {
				// The funding round: the CST bidder pays about `C` twice and a fraction of `C` once below, so four holds of
				// the initial duration, each earning about `C`, suffice.
				const initialDurationUntilMainPrize_ =
					(await game_.mainPrizeTimeIncrementInMicroSeconds()) / (await game_.initialDurationUntilMainPrizeDivisor());
				await fundBiddersWithCstByHoldingAndFinishRound(contracts_, game_, [ethBidder1_, ethBidder2_, cstBidder_], 4n * initialDurationUntilMainPrize_);
				++ roundIndex_;
				return;
			}
			await activateCurrentRoundDeterministically(game_, contracts_.ownerSigner);
			const mirror_ = await createRoundMirror(contracts_, game_, [ethBidder1_, ethBidder2_, cstBidder_]);
			const params_ = mirror_.params;
			const { bidCstRewardAmountMultiplier: multiplier_, mainPrizeTimeIncrementInMicroSeconds: increment_ } = params_;

			// Each one-second reward discards this remainder of a Wei (Comment-202607167). Nonzero under the default parameters,
			// otherwise the rounding this test measures would not occur.
			const remainderPerSecond_ = multiplier_ % increment_;
			expect(remainderPerSecond_, "the default parameters must make one-second rewards round").greaterThan(0n);
			expect(getBidCstRewardRemainder(1n, params_)).equal(remainderPerSecond_);

			/** Verifies the conservation figures of a CST bid against the gaps of the rewards minted since the auction began. */
			const assertShortfall_ = (result_, gaps_, description_) => {
				const conservation_ = result_.conservation;
				expect(conservation_.numRewardsMintedSinceBeginning, description_).equal(BigInt(gaps_.length));
				const shortfall_ = conservation_.beginningPrice - (conservation_.base + conservation_.rewardsMintedSinceBeginning);
				const expectedShortfall_ = gaps_.reduce((sum_, gap_) => sum_ + getBidCstRewardRemainder(gap_, params_), 0n) / increment_;
				expect(result_.base, description_).greaterThan(0n);
				expect(shortfall_, `${description_}: exact shortfall`).equal(expectedShortfall_);
				expect(shortfall_, `${description_}: at most one Wei per reward, exclusive of the last`).at.most(BigInt(gaps_.length - 1));
				expect(shortfall_, description_).at.least(0n);
				return shortfall_;
			};

			// Phase 1: the first ETH bid starts the auction at `C`; then one ETH bid per second, then a CST bid one second later.
			// All the rewards minted since `T0` are one-second rewards, so the shortfall has the closed form
			// `floor(numRewards * (multiplier mod increment) / increment)`, which grows without bound with the number of bids.
			await placeBidAndVerify(contracts_, game_, mirror_, ethBidder1_, "ETH", (await getLatestBlockTimestamp()) + 10n);
			for (let bidIndex_ = 0; bidIndex_ < numOneSecondBids_; ++ bidIndex_) {
				await placeBidAndVerify(contracts_, game_, mirror_, (bidIndex_ % 2 === 0) ? ethBidder2_ : ethBidder1_, "ETH", (await getLatestBlockTimestamp()) + 1n, `, one-second bid ${bidIndex_}`);
			}
			{
				const numRewards_ = BigInt(numOneSecondBids_ + 1);
				const result_ = await placeBidAndVerify(contracts_, game_, mirror_, cstBidder_, "CST", (await getLatestBlockTimestamp()) + 1n, ", after the one-second bids");
				const shortfall_ = assertShortfall_(result_, new Array(numOneSecondBids_ + 1).fill(1n), "phase 1");
				expect(shortfall_).equal(numRewards_ * remainderPerSecond_ / increment_);
				expect(shortfall_, "the shortfall is positive once the remainders add up to a Wei").greaterThan(0n);
				expect(numRewards_ * remainderPerSecond_).at.least(increment_);

				// Nearly the whole asking price was paid, so the restart is capped at `C`.
				expect(result_.cstDutchAuctionBeginningBidPrice).equal(params_.cstDutchAuctionBeginningBidPriceMaxLimit);
			}

			// Phase 2: random gaps of one to three seconds, so the remainders differ from bid to bid.
			{
				const gaps_ = [];
				for (let bidIndex_ = 0; bidIndex_ < numOneSecondBids_ / 2; ++ bidIndex_) {
					const gap_ = random_.nextBigIntInRange(1n, 3n);
					gaps_.push(gap_);
					await placeBidAndVerify(contracts_, game_, mirror_, (bidIndex_ % 2 === 0) ? ethBidder2_ : ethBidder1_, "ETH", (await getLatestBlockTimestamp()) + gap_, `, short-gap bid ${bidIndex_}`);
				}
				const gap_ = random_.nextBigIntInRange(1n, 3n);
				gaps_.push(gap_);
				const result_ = await placeBidAndVerify(contracts_, game_, mirror_, cstBidder_, "CST", (await getLatestBlockTimestamp()) + gap_, ", after the short-gap bids");
				assertShortfall_(result_, gaps_, "phase 2");
			}

			// Phase 3: two long gaps only, so the shortfall is at most one Wei.
			{
				const gaps_ = [random_.nextBigIntInRange(SECONDS_PER_HOUR, 5n * SECONDS_PER_HOUR), random_.nextBigIntInRange(SECONDS_PER_HOUR, 5n * SECONDS_PER_HOUR),];
				await placeBidAndVerify(contracts_, game_, mirror_, ethBidder1_, "ETH", (await getLatestBlockTimestamp()) + gaps_[0], ", long-gap bid");
				const result_ = await placeBidAndVerify(contracts_, game_, mirror_, cstBidder_, "CST", (await getLatestBlockTimestamp()) + gaps_[1], ", after the long-gap bid");
				const shortfall_ = assertShortfall_(result_, gaps_, "phase 3");
				expect(shortfall_).at.most(1n);
			}
			await finishGameRound(contracts_, game_);
			++ roundIndex_;
		}, 2);
	});
});
