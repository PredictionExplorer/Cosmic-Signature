"use strict";

// Helpers for the property-based and differential tests of the V3 CST bid pricing rules (Comment-202611022)
// in `test/tests-src/CosmicSignatureGameV3-CstPricingProperties.js`:
// a seeded random source, the live parameter reader, a JS mirror of one bidding round's CST pricing state,
// and a bid executor that checks every quote getter, event field, storage variable, token balance, raffle weight,
// and the invariants I1 and I2 of `docs/cosmic-signature-game-cst-bid-pricing.md` on every bid.

const { expect } = require("chai");
const hre = require("hardhat");
const { maxBigInt, minBigInt } = require("../../src/BigIntMathHelpers.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { findParsedEvent, getLatestBlockTimestamp } = require("./V2UpgradeTestHelpers.js");
const {
	getRoundLateBidPricePremiumAmount,
	getV3BidCstRewardAmount,
	getV3NewCstDutchAuctionBeginningBidPrice,
	getV3CstBidPriceBase,
	getV3CstDutchAuctionDuration,
	getV3CstBidRaffleWeight,
	readCstPricingParams,
	bidWithCstAt,
	tryIncreaseValueExponentially,
} = require("./V3UpgradeTestHelpers.js");
const { finishGameRound, bidWithEthAt } = require("./GameRoundTestHelpers.js");

// #region Seeded randomness

// #endregion
// #region Deterministic block times

/**
Pins the next block to the latest block timestamp plus one, so that a transaction that does not pin its own timestamp
is mined at a time that does not depend on the wall clock (Comment-202501193, issue 3).
@returns {Promise<bigint>} The pinned timestamp.
*/
async function pinNextBlockTimeStamp() {
	const timeStamp_ = (await getLatestBlockTimestamp()) + 1n;
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	return timeStamp_;
}

/**
Activates the current bidding round at a deterministic time: the setter is mined at the latest block timestamp plus one,
and the round activates one second after that.
*/
async function activateCurrentRoundDeterministically(game_, ownerSigner_) {
	const setterTimeStamp_ = await pinNextBlockTimeStamp();
	await waitForTransactionReceipt(game_.connect(ownerSigner_).setRoundActivationTime(setterTimeStamp_ + 1n));
	expect(await getLatestBlockTimestamp()).equal(setterTimeStamp_);
}

/**
Calls an owner setter in a block pinned by `pinNextBlockTimeStamp`.
@param {() => Promise<import("ethers").TransactionResponse>} submitTransaction_
*/
async function sendPinnedTransaction(submitTransaction_) {
	await pinNextBlockTimeStamp();
	return waitForTransactionReceipt(submitTransaction_());
}

// #endregion
// #region Parameters

/**
The remainder that the bid CST reward of `elapsedDuration_` seconds discards by rounding down (Comment-202607167),
in units of `1 / mainPrizeTimeIncrementInMicroSeconds` CST Wei. The sum of these remainders over the rewards minted since
a CST Dutch auction began, divided by the increment, is the exact amount by which the conservation invariant I2 falls short:
`floor(e * m / i) - sum(floor(g_k * m / i)) == floor(sum((g_k * m) mod i) / i)` for `e == sum(g_k)`.
@param {bigint} elapsedDuration_ May be non-positive.
@returns {bigint}
*/
function getBidCstRewardRemainder(elapsedDuration_, params_) {
	return (elapsedDuration_ <= 0n) ?
		0n :
		(elapsedDuration_ * params_.bidCstRewardAmountMultiplier) % params_.mainPrizeTimeIncrementInMicroSeconds;
}

// #endregion
// #region `CstPricingRoundMirror`

/**
The JS mirror of everything the V3 CST pricing rules depend on during one bidding round: the live parameters,
the current CST Dutch auction (`S`, `T0`), the last bid, `mainPrizeTime`, the concurrent ETH bid price base,
the cumulative raffle weight, the expected CST balances of the bidders, and the bid CST rewards minted since
the auction began, which the conservation invariant I2 is checked against.
*/
class CstPricingRoundMirror {
	/**
	@param {object} params_ From `readCstPricingParams`.
	@param {bigint} roundNum_
	@param {object} staleState_ The storage the round inherits before its first bid:
	`beginningTimeStamp` (`cstDutchAuctionBeginningTimeStamp`) and `mainPrizeTime`, both from the previous round.
	*/
	constructor(params_, roundNum_, staleState_) {
		/** @type {Awaited<ReturnType<typeof readCstPricingParams>>} */
		this.params = params_;

		/** @type {bigint} */
		this.roundNum = roundNum_;

		/** `S`. Before the round's first CST bid, the auction begins at `C` (Comment-202611025). @type {bigint} */
		this.beginningPrice = params_.cstDutchAuctionBeginningBidPriceMaxLimit;

		/** `T0`. The first bid in the round resets it. @type {bigint} */
		this.beginningTimeStamp = staleState_.beginningTimeStamp;

		/** @type {bigint} */
		this.mainPrizeTime = staleState_.mainPrizeTime;

		this.lastBidderAddress = hre.ethers.ZeroAddress;
		this.lastCstBidderAddress = hre.ethers.ZeroAddress;

		/** @type {bigint} */
		this.lastBidTimeStamp = 0n;

		/** `nextEthBidPrice` after the first bid; `undefined` before it, when the ETH Dutch auction sets the price. @type {bigint | undefined} */
		this.ethBidPriceBase = undefined;

		/** @type {bigint} */
		this.numBids = 0n;

		/** @type {bigint} */
		this.cumulativeRaffleWeight = 0n;

		/** @type {bigint} */
		this.rewardsMintedSinceBeginning = 0n;

		/** @type {bigint} */
		this.numRewardsMintedSinceBeginning = 0n;

		/** @type {bigint} */
		this.rewardRemaindersSinceBeginning = 0n;

		/** @type {Map<string, bigint>} The expected CST balances of the addresses the test cares about. */
		this.expectedCstBalances = new Map();
	}

	get hasBidder() {
		return this.lastBidderAddress !== hre.ethers.ZeroAddress;
	}

	/** JS mirror of `BiddingV3._getCstDutchAuctionDuration` for the current auction. */
	get cstDutchAuctionDuration() {
		return getV3CstDutchAuctionDuration(this.beginningPrice, this.params.bidCstRewardAmountMultiplier, this.params.mainPrizeTimeIncrementInMicroSeconds);
	}

	/** The late-bid premium of `premiumBase_` at `timeStamp_`; zero before the round's first bid. */
	premiumAt(premiumBase_, timeStamp_) {
		if ( ! this.hasBidder ) {
			return 0n;
		}
		return getRoundLateBidPricePremiumAmount(
			premiumBase_,
			this.mainPrizeTime - timeStamp_,
			this.params.roundLateBidDuration,
			this.params.mainPrizeTimeIncrementInMicroSeconds,
			this.params.roundLateBidPricePremiumAmountBaseMultiplier,
			this.params.roundLateBidPricePremiumAmountExponent
		);
	}

	/**
	The values the quote getters must return at `timeStamp_`, which may be in the past.
	`rewardAmount` and `ethBidPrice` are `undefined` before the round's first bid: the reward getter is then
	meaningless (Comment-202501022), and the ETH price comes from the ETH Dutch auction, which this mirror does not model.
	*/
	quotesAt(timeStamp_) {
		const { bidCstRewardAmountMultiplier: multiplier_, mainPrizeTimeIncrementInMicroSeconds: increment_ } = this.params;
		const base_ = getV3CstBidPriceBase(this.beginningPrice, timeStamp_ - this.beginningTimeStamp, multiplier_, increment_);

		// Comment-202611026 applies.
		const premium_ = this.premiumAt(maxBigInt(base_, this.params.rewardAmountPerMainPrizeTimeIncrement), timeStamp_);

		return {
			base: base_,
			premium: premium_,
			price: base_ + premium_,
			rewardAmount: this.hasBidder ? getV3BidCstRewardAmount(timeStamp_ - this.lastBidTimeStamp, multiplier_, increment_) : undefined,
			ethBidPrice: this.hasBidder ? (this.ethBidPriceBase + this.premiumAt(this.ethBidPriceBase, timeStamp_)) : undefined,
		};
	}

	/** Applies what `BiddingV2Base._bidCommon` does to the mirrored state, except the last bidder fields. */
	_applyCommonBidEffects(timeStamp_) {
		if (this.hasBidder) {
			this.mainPrizeTime += this.params.mainPrizeTimeIncrement;
		} else {
			this.beginningTimeStamp = timeStamp_;
			this.mainPrizeTime = timeStamp_ + this.params.initialDurationUntilMainPrize;
		}
		++ this.numBids;
	}

	/** Mints the reward of the elapsed duration to the previous last bidder, as `getBidCstRewardAmountAdvanced` reports it. */
	_applyRewardMinting(timeStamp_, rewardAmount_) {
		this.rewardsMintedSinceBeginning += rewardAmount_;
		++ this.numRewardsMintedSinceBeginning;
		this.rewardRemaindersSinceBeginning += getBidCstRewardRemainder(timeStamp_ - this.lastBidTimeStamp, this.params);
		this._addCstBalance(this.lastBidderAddress, rewardAmount_);
	}

	_addCstBalance(address_, amount_) {
		if (this.expectedCstBalances.has(address_)) {
			this.expectedCstBalances.set(address_, this.expectedCstBalances.get(address_) + amount_);
		}
	}

	/**
	Applies an ETH bid. `ethBidPriceBase_` is the concurrent ETH bid price base: `nextEthBidPrice` after the first bid,
	or the ETH Dutch auction price for the first bid.
	@returns The expected raffle weight and `BidPlaced` field 8 (Comment-202611028).
	*/
	applyEthBid(bidderAddress_, timeStamp_, ethBidPriceBase_) {
		const quotes_ = this.quotesAt(timeStamp_);
		if (this.hasBidder) {
			expect(ethBidPriceBase_).equal(this.ethBidPriceBase);
			this._applyRewardMinting(timeStamp_, quotes_.rewardAmount);
		}
		this._applyCommonBidEffects(timeStamp_);
		this.lastBidderAddress = bidderAddress_;
		this.lastBidTimeStamp = timeStamp_;

		// Comment-202501061 applies.
		this.ethBidPriceBase = tryIncreaseValueExponentially(ethBidPriceBase_, this.params.ethBidPriceIncreaseDivisor) + 1n;

		// Comment-202609098 applies.
		this.cumulativeRaffleWeight += ethBidPriceBase_;

		return {
			bidRaffleWeight: ethBidPriceBase_,
			cstDutchAuctionBeginningBidPrice: this.beginningPrice,
			bidCstRewardAmount: quotes_.rewardAmount ?? 0n,
		};
	}

	/**
	Applies a CST bid, which must not be the round's first bid.
	@returns The expected paid price, raffle weight, the new `S`, and the conservation figures of invariant I2.
	*/
	applyCstBid(bidderAddress_, timeStamp_) {
		expect(this.hasBidder, "a CST bid cannot be the round's first bid").equal(true);
		const quotes_ = this.quotesAt(timeStamp_);
		const prevBeginningPrice_ = this.beginningPrice;
		this._addCstBalance(bidderAddress_, ( - quotes_.price ));
		this._applyRewardMinting(timeStamp_, quotes_.rewardAmount);

		// Invariant I2 (Comment-202611023): the base burned plus the rewards minted since `T0`, including this bid's,
		// equals `S` up to the rounding of each reward. The exact shortfall is the floored sum of the discarded remainders.
		const conservation_ = {
			beginningPrice: prevBeginningPrice_,
			base: quotes_.base,
			rewardsMintedSinceBeginning: this.rewardsMintedSinceBeginning,
			numRewardsMintedSinceBeginning: this.numRewardsMintedSinceBeginning,
			expectedShortfall: this.rewardRemaindersSinceBeginning / this.params.mainPrizeTimeIncrementInMicroSeconds,
		};

		// Comment-202611027 applies.
		/** @type {bigint} */
		const bidRaffleWeight_ = getV3CstBidRaffleWeight(this.ethBidPriceBase, quotes_.base, prevBeginningPrice_);
		this.cumulativeRaffleWeight += bidRaffleWeight_;

		// Comment-202611024 applies.
		this.beginningPrice =
			getV3NewCstDutchAuctionBeginningBidPrice(quotes_.base, this.params.bidCstRewardAmountMultiplier, this.params.initialDurationUntilMainPrizeDivisor);

		this._applyCommonBidEffects(timeStamp_);
		this.beginningTimeStamp = timeStamp_;
		this.rewardsMintedSinceBeginning = 0n;
		this.numRewardsMintedSinceBeginning = 0n;
		this.rewardRemaindersSinceBeginning = 0n;
		this.lastBidderAddress = bidderAddress_;
		this.lastCstBidderAddress = bidderAddress_;
		this.lastBidTimeStamp = timeStamp_;
		return {
			paidCstPrice: quotes_.price,
			base: quotes_.base,
			premium: quotes_.premium,
			bidRaffleWeight: bidRaffleWeight_,
			cstDutchAuctionBeginningBidPrice: this.beginningPrice,
			bidCstRewardAmount: quotes_.rewardAmount,
			conservation: conservation_,
		};
	}
}

// #endregion
// #region Quote getter checks

/**
Checks every quote getter at `timeStamp_` (which may precede the latest block) against the mirror.
@returns The mirrored quotes.
*/
async function assertQuoteGettersMatchMirrorAt(game_, mirror_, timeStamp_, description_) {
	const currentTimeOffset_ = timeStamp_ - (await getLatestBlockTimestamp());
	const quotes_ = mirror_.quotesAt(timeStamp_);
	const message_ = `${description_}, offset ${currentTimeOffset_}`;
	expect(await game_.getNextCstBidPriceBaseAdvanced(currentTimeOffset_), `CST base ${message_}`).equal(quotes_.base);
	expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_), `CST price ${message_}`).equal(quotes_.price);
	if (mirror_.hasBidder) {
		expect(await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_), `reward ${message_}`).equal(quotes_.rewardAmount);
		expect(await game_.getNextEthBidPriceAdvanced(currentTimeOffset_), `ETH price ${message_}`).equal(quotes_.ethBidPrice);
	}
	if (currentTimeOffset_ === 0n) {
		expect(await game_.getNextCstBidPriceBase(), `CST base now ${description_}`).equal(quotes_.base);
		expect(await game_.getNextCstBidPrice(), `CST price now ${description_}`).equal(quotes_.price);
		if (mirror_.hasBidder) {
			expect(await game_.getBidCstRewardAmount(), `reward now ${description_}`).equal(quotes_.rewardAmount);
			expect(await game_.getNextEthBidPrice(), `ETH price now ${description_}`).equal(quotes_.ethBidPrice);
		}
	}
	return quotes_;
}

/** Checks the offset-free getters: the auction durations and the late-bid window, against the mirror. */
async function assertDurationGettersMatchMirror(game_, mirror_, description_) {
	const [duration_, elapsedDuration_] = await game_.getCstDutchAuctionDurations();
	expect(duration_, `auction duration ${description_}`).equal(mirror_.cstDutchAuctionDuration);
	expect(elapsedDuration_, `auction elapsed duration ${description_}`).equal((await getLatestBlockTimestamp()) - mirror_.beginningTimeStamp);
	expect(await game_.getRoundLateBidDuration(), `late-bid duration ${description_}`).equal(mirror_.params.roundLateBidDuration);
}

// #endregion
// #region Bids

/**
Places an ETH or a CST bid at exactly `timeStamp_` and checks it against the mirror, which it updates:
the quote getters before the bid, the `BidPlaced` fields, the CST Dutch auction storage, the raffle weight derived from
`getBidInfoAt`, `nextEthBidPrice`, `mainPrizeTime`, the CST balances, and, for a CST bid, the invariants I1 and I2.
A CST bid is placed with `cstPriceMaxLimit_` equal to the mirrored price, so a mispriced quote reverts the bid.
@param {CstPricingRoundMirror} mirror_
@param {"ETH" | "CST"} bidType_
@returns {Promise<object>} The expected figures returned by the mirror plus `receipt`.
*/
async function placeBidAndVerify(contracts_, game_, mirror_, bidder_, bidType_, timeStamp_, description_ = "") {
	const token_ = contracts_.cosmicSignatureToken;
	const params_ = mirror_.params;
	const bidderAddress_ = bidder_.address;
	const message_ = `${bidType_} bid at ${timeStamp_}${description_}`;
	const prevLastBidderAddress_ = mirror_.lastBidderAddress;
	const prevCumulativeRaffleWeight_ = mirror_.cumulativeRaffleWeight;
	const prevNumBids_ = mirror_.numBids;
	const isFirstBidInRound_ = ! mirror_.hasBidder;
	expect(await game_.lastBidderAddress(), message_).equal(prevLastBidderAddress_);
	await assertDurationGettersMatchMirror(game_, mirror_, `before the ${message_}`);
	const quotes_ = await assertQuoteGettersMatchMirrorAt(game_, mirror_, timeStamp_, `before the ${message_}`);

	let receipt_;
	let expected_;
	if (bidType_ === "ETH") {
		// Before the first bid, the ETH Dutch auction sets the price and there is no premium (`lastBidderAddress` is zero),
		// so the quote is the base. Afterwards, the base is `nextEthBidPrice`.
		const ethBidPriceBase_ =
			isFirstBidInRound_ ?
			await game_.getNextEthBidPriceAdvanced(timeStamp_ - (await getLatestBlockTimestamp())) :
			mirror_.ethBidPriceBase;
		const ethBidPrice_ = isFirstBidInRound_ ? ethBidPriceBase_ : quotes_.ethBidPrice;
		receipt_ = await bidWithEthAt(game_, bidder_, timeStamp_);
		expected_ = mirror_.applyEthBid(bidderAddress_, timeStamp_, ethBidPriceBase_);
		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.paidEthPrice, message_).equal(ethBidPrice_);
		expect(bidPlaced_.args.paidCstPrice, message_).equal(-1n);

		// Comment-202611028 applies: an ETH bid reports the beginning price of the auction in effect, which is `C`
		// until the round's first CST bid, regardless of the stale `cstDutchAuctionBeginningBidPrice` in storage.
		expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, message_).equal(expected_.cstDutchAuctionBeginningBidPrice);
		if (mirror_.lastCstBidderAddress === hre.ethers.ZeroAddress) {
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, message_).equal(params_.cstDutchAuctionBeginningBidPriceMaxLimit);
		} else {
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, message_).equal(await game_.cstDutchAuctionBeginningBidPrice());
		}
		expect(bidPlaced_.args.bidCstRewardAmount, message_).equal(expected_.bidCstRewardAmount);
	} else {
		expect(isFirstBidInRound_, `${message_}: the first bid in a round must be ETH`).equal(false);
		expect(mirror_.expectedCstBalances.get(bidderAddress_) ?? 0n, `${message_}: the bidder must afford the price`).at.least(quotes_.price);

		// Rule 3 (Comment-202611026): the price paid is the base plus the premium calculated from `max(base, R)`,
		// evaluated before the bid moves `mainPrizeTime`.
		const expectedPaidCstPrice_ = quotes_.price;
		receipt_ = await bidWithCstAt(game_, bidder_, timeStamp_, expectedPaidCstPrice_);
		expected_ = mirror_.applyCstBid(bidderAddress_, timeStamp_);
		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.paidEthPrice, message_).equal(-1n);
		expect(bidPlaced_.args.paidCstPrice, message_).equal(expectedPaidCstPrice_);

		// Rule 2 (Comment-202611024, Comment-202611028): field 8 is the new `S == min(2 * (base + R), C)`, also written to storage.
		const expectedNewBeginningPrice_ =
			minBigInt(
				(expected_.base + params_.rewardAmountPerMainPrizeTimeIncrement) * 2n,
				params_.cstDutchAuctionBeginningBidPriceMaxLimit
			);
		expect(expected_.cstDutchAuctionBeginningBidPrice).equal(expectedNewBeginningPrice_);
		expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, message_).equal(expectedNewBeginningPrice_);
		expect(await game_.cstDutchAuctionBeginningBidPrice(), message_).equal(expectedNewBeginningPrice_);
		expect(await game_.cstDutchAuctionBeginningTimeStamp(), message_).equal(timeStamp_);
		expect(await game_.lastCstBidderAddress(), message_).equal(bidderAddress_);
		expect(bidPlaced_.args.bidCstRewardAmount, message_).equal(expected_.bidCstRewardAmount);

		// Invariant I1: `S` stays within `[2R, C]`, or equals `C` if the configuration makes `C < 2R`.
		expect(expectedNewBeginningPrice_, `${message_}: I1 lower bound`)
			.at.least(minBigInt(2n * params_.rewardAmountPerMainPrizeTimeIncrement, params_.cstDutchAuctionBeginningBidPriceMaxLimit));
		expect(expectedNewBeginningPrice_, `${message_}: I1 upper bound`).at.most(params_.cstDutchAuctionBeginningBidPriceMaxLimit);

		// Invariant I2, with the on-chain base (checked against the mirror above) and the on-chain rewards (from the events,
		// accumulated by the mirror). While the base is positive, the shortfall is between zero and one Wei per minted reward,
		// exclusive of the last, and equals the floored sum of the remainders the rewards discarded. Once the base is zero,
		// the rewards alone are at least that close to `S`.
		const conservation_ = expected_.conservation;
		const conservedAmount_ = conservation_.base + conservation_.rewardsMintedSinceBeginning;
		expect(conservation_.numRewardsMintedSinceBeginning, message_).at.least(1n);
		expect(conservation_.expectedShortfall, message_).at.most(conservation_.numRewardsMintedSinceBeginning - 1n);
		if (conservation_.base > 0n) {
			expect(conservedAmount_, `${message_}: I2 upper bound`).at.most(conservation_.beginningPrice);
			expect(conservation_.beginningPrice - conservedAmount_, `${message_}: I2 exact shortfall`).equal(conservation_.expectedShortfall);
		}
		expect(conservedAmount_ + conservation_.expectedShortfall, `${message_}: I2 lower bound`).at.least(conservation_.beginningPrice);
	}

	// Rule 4 (Comment-202611027, Comment-202609098): the raffle weight, derived from the cumulative weights.
	{
		const bidIndex_ = prevNumBids_;
		expect((await game_.roundStats(mirror_.roundNum)).numBids, message_).equal(bidIndex_ + 1n);
		const bidInfo_ = await game_.getBidInfoAt(mirror_.roundNum, bidIndex_);
		expect(bidInfo_.bidderAddress, message_).equal(bidderAddress_);
		expect(bidInfo_.raffleCumulativeWeight - prevCumulativeRaffleWeight_, `${message_}: raffle weight`).equal(expected_.bidRaffleWeight);
		expect(bidInfo_.raffleCumulativeWeight, message_).equal(mirror_.cumulativeRaffleWeight);
	}

	{
		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.roundNum, message_).equal(mirror_.roundNum);
		expect(bidPlaced_.args.lastBidderAddress, message_).equal(bidderAddress_);
		expect(bidPlaced_.args.mainPrizeTime, message_).equal(mirror_.mainPrizeTime);
	}
	expect(await game_.lastBidderAddress(), message_).equal(bidderAddress_);
	expect(await game_.mainPrizeTime(), message_).equal(mirror_.mainPrizeTime);
	expect(await game_.nextEthBidPrice(), message_).equal(mirror_.ethBidPriceBase);
	expect(await game_.cstDutchAuctionBeginningTimeStamp(), message_).equal(mirror_.beginningTimeStamp);
	expect(await game_.lastCstBidderAddress(), message_).equal(mirror_.lastCstBidderAddress);
	expect((await game_.biddersInfo(mirror_.roundNum, bidderAddress_)).lastBidTimeStamp, message_).equal(timeStamp_);
	for (const address_ of [bidderAddress_, prevLastBidderAddress_]) {
		if (mirror_.expectedCstBalances.has(address_)) {
			expect(await token_.balanceOf(address_), `${message_}: CST balance of ${address_}`).equal(mirror_.expectedCstBalances.get(address_));
		}
	}
	await assertDurationGettersMatchMirror(game_, mirror_, `after the ${message_}`);
	await assertQuoteGettersMatchMirrorAt(game_, mirror_, timeStamp_, `after the ${message_}`);
	return { ...expected_, receipt: receipt_, };
}

/**
Creates the mirror of the current round from the live state, with the CST balances of `trackedSigners_`.
Call this after the round is activated and before its first bid.
*/
async function createRoundMirror(contracts_, game_, trackedSigners_) {
	const params_ = await readCstPricingParams(game_);
	const roundNum_ = await game_.roundNum();
	expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
	const mirror_ = new CstPricingRoundMirror(params_, roundNum_, {
		beginningTimeStamp: await game_.cstDutchAuctionBeginningTimeStamp(),
		mainPrizeTime: await game_.mainPrizeTime(),
	});
	for (const signer_ of trackedSigners_) {
		mirror_.expectedCstBalances.set(signer_.address, await contracts_.cosmicSignatureToken.balanceOf(signer_.address));
	}
	return mirror_;
}

/**
Makes every given bidder earn the bid CST reward of holding the last bidder position for `holdDuration_`,
which is the only way to obtain CST, and then claims the main prize, so that the next round begins with funded bidders.
The bidders place ETH bids in turn, each `holdDuration_` after the previous one, and the first bidder finally outbids the last.
Each bidder earns about `holdDuration_ / mainPrizeTimeIncrement` times `R`.
*/
async function fundBiddersWithCstByHoldingAndFinishRound(contracts_, game_, bidderSigners_, holdDuration_) {
	await activateCurrentRoundDeterministically(game_, contracts_.ownerSigner);
	await bidWithEthAt(game_, bidderSigners_[0], (await getLatestBlockTimestamp()) + 10n);
	for (const bidderSigner_ of [...bidderSigners_.slice(1), bidderSigners_[0]]) {
		await bidWithEthAt(game_, bidderSigner_, (await getLatestBlockTimestamp()) + holdDuration_);
	}
	await finishGameRound(contracts_, game_);
}

// #endregion

module.exports = {
	pinNextBlockTimeStamp,
	activateCurrentRoundDeterministically,
	sendPinnedTransaction,
	getBidCstRewardRemainder,
	CstPricingRoundMirror,
	assertQuoteGettersMatchMirrorAt,
	assertDurationGettersMatchMirror,
	placeBidAndVerify,
	createRoundMirror,
	fundBiddersWithCstByHoldingAndFinishRound,
};
