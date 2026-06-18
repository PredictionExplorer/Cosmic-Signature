// #region

"use strict";

// #endregion
// #region Imports

const hre = require("hardhat");
const { expect } = require("chai");
const { sqrtFloor, maxBigInt, u256 } = require("./FuzzMath.js");
const c = require("./FuzzConstants.js");

// #endregion
// #region `GameModel`

/**
Exact JS shadow model of the `CosmicSignatureGame` (V1 and V2) deterministic state machine.

The fuzz engine controls every block timestamp, so all prices, rewards, durations, champion
transitions, and `mainPrizeTime` values are exactly predictable. This class mirrors:
- `Bidding.sol` / `BiddingV2.sol` (`_bidWithEth`, `_bidWithCst`, `_bidCommon`, price getters)
- `BidStatistics.sol` (`_updateChampionsIfNeeded`, `_updateChronoWarriorIfNeeded`, `tryGetCurrentChampions`)
- `MainPrizeBase.sol` / `MainPrizeBaseV2.sol` (`_extendMainPrizeTime` clamping difference)
- `MainPrize.sol` / `MainPrizeV2.sol` (`claimMainPrize` authorization + `_prepareNextRound`)
- `SystemManagement.sol` / `SystemManagementV2.sol` (setters mutate the model config)

All state is bigint. The chrono-warrior duration sentinel `uint256(int256(-1))` is stored
as `-1n` internally and converted via `chronoWarriorDurationUint()` for chain comparisons.
*/
class GameModel {
	// #region Construction / chain sync

	constructor() {
		/**
		Game code version: 1 = V1, 2 = V2.
		@type {1 | 2}
		*/
		this.version = 1;

		// Configuration (owner-mutable).
		this.delayDurationBeforeRoundActivation = 0n;
		this.ethDutchAuctionDurationDivisor = 0n;
		this.ethDutchAuctionEndingBidPriceDivisor = 0n;
		this.ethBidPriceIncreaseDivisor = 0n;
		this.ethBidRefundAmountInGasToSwallowMaxLimit = 0n;
		this.cstDutchAuctionDurationDivisor = 0n; // V1 only
		this.cstDutchAuctionDuration = 0n; // V2 only (stored duration)
		this.cstDutchAuctionDurationChangeDivisor = 0n; // V2 only
		this.cstDutchAuctionBeginningBidPriceMinLimit = 0n;
		this.bidMessageLengthMaxLimit = 0n;
		this.bidCstRewardAmount = 0n; // V1 only
		this.bidCstRewardAmountMultiplier = 0n; // V2 only
		this.cstPrizeAmount = 0n;
		this.chronoWarriorEthPrizeAmountPercentage = 0n;
		this.raffleTotalEthPrizeAmountForBiddersPercentage = 0n;
		this.numRaffleEthPrizesForBidders = 0n;
		this.numRaffleCosmicSignatureNftsForBidders = 0n;
		this.numRaffleCosmicSignatureNftsForRandomWalkNftStakers = 0n;
		this.cosmicSignatureNftStakingTotalEthRewardAmountPercentage = 0n;
		this.initialDurationUntilMainPrizeDivisor = 0n;
		this.mainPrizeTimeIncrementIncreaseDivisor = 0n;
		this.timeoutDurationToClaimMainPrize = 0n;
		this.mainEthPrizeAmountPercentage = 0n;
		this.marketingWalletCstContributionAmount = 0n;
		this.charityEthDonationAmountPercentage = 0n;
		/** @type {string} */
		this.charityAddress = "";
		/** @type {string} */
		this.marketingWalletAddress = "";

		// Round / bidding state.
		this.roundNum = 0n;
		this.roundActivationTime = 0n;
		this.mainPrizeTime = 0n;
		this.mainPrizeTimeIncrementInMicroSeconds = 0n;
		this.ethDutchAuctionBeginningBidPrice = 0n;
		this.nextEthBidPrice = 0n;
		this.cstDutchAuctionBeginningTimeStamp = 0n;
		this.cstDutchAuctionBeginningBidPrice = 0n;
		this.nextRoundFirstCstDutchAuctionBeginningBidPrice = 0n;
		/** @type {string} */
		this.lastBidderAddress = ZERO_ADDRESS;
		/** @type {string} */
		this.lastCstBidderAddress = ZERO_ADDRESS;

		// Champions.
		this.enduranceChampionAddress = ZERO_ADDRESS;
		this.enduranceChampionStartTimeStamp = 0n;
		this.enduranceChampionDuration = 0n;
		this.prevEnduranceChampionDuration = 0n;
		this.chronoWarriorAddress = ZERO_ADDRESS;
		/** Stored as a signed value; `-1n` is the on-chain `uint256(int256(-1))` sentinel. */
		this.chronoWarriorDuration = -1n;

		/** @type {Set<string>} Random Walk NFT ids (as decimal strings) used for bidding. */
		this.usedRandomWalkNfts = new Set();

		/**
		Per-round bid statistics. Key: round number as string.
		@type {Map<string, {bidderAddresses: string[], biddersInfo: Map<string, {totalSpentEthAmount: bigint, totalSpentCstAmount: bigint, lastBidTimeStamp: bigint}>}>}
		*/
		this.rounds = new Map();
	}

	/**
	Reads every getter from the deployed game once, so the model starts exactly in sync.
	@param {import("ethers").Contract} game_ Game proxy with V1 or V2 ABI matching `version_`.
	@param {1 | 2} version_
	*/
	async initFromChain(game_, version_) {
		this.version = version_;
		this.delayDurationBeforeRoundActivation = await game_.delayDurationBeforeRoundActivation();
		this.ethDutchAuctionDurationDivisor = await game_.ethDutchAuctionDurationDivisor();
		this.ethDutchAuctionEndingBidPriceDivisor = await game_.ethDutchAuctionEndingBidPriceDivisor();
		this.ethBidPriceIncreaseDivisor = await game_.ethBidPriceIncreaseDivisor();
		this.ethBidRefundAmountInGasToSwallowMaxLimit = await game_.ethBidRefundAmountInGasToSwallowMaxLimit();
		if (version_ === 1) {
			this.cstDutchAuctionDurationDivisor = await game_.cstDutchAuctionDurationDivisor();
			this.bidCstRewardAmount = await game_.bidCstRewardAmount();
		} else {
			this.cstDutchAuctionDuration = await game_.cstDutchAuctionDuration();
			this.cstDutchAuctionDurationChangeDivisor = await game_.cstDutchAuctionDurationChangeDivisor();
			this.bidCstRewardAmountMultiplier = await game_.bidCstRewardAmountMultiplier();
		}
		this.cstDutchAuctionBeginningBidPriceMinLimit = await game_.cstDutchAuctionBeginningBidPriceMinLimit();
		this.bidMessageLengthMaxLimit = await game_.bidMessageLengthMaxLimit();
		this.cstPrizeAmount = await game_.cstPrizeAmount();
		this.chronoWarriorEthPrizeAmountPercentage = await game_.chronoWarriorEthPrizeAmountPercentage();
		this.raffleTotalEthPrizeAmountForBiddersPercentage = await game_.raffleTotalEthPrizeAmountForBiddersPercentage();
		this.numRaffleEthPrizesForBidders = await game_.numRaffleEthPrizesForBidders();
		this.numRaffleCosmicSignatureNftsForBidders = await game_.numRaffleCosmicSignatureNftsForBidders();
		this.numRaffleCosmicSignatureNftsForRandomWalkNftStakers = await game_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers();
		this.cosmicSignatureNftStakingTotalEthRewardAmountPercentage = await game_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage();
		this.initialDurationUntilMainPrizeDivisor = await game_.initialDurationUntilMainPrizeDivisor();
		this.mainPrizeTimeIncrementIncreaseDivisor = await game_.mainPrizeTimeIncrementIncreaseDivisor();
		this.timeoutDurationToClaimMainPrize = await game_.timeoutDurationToClaimMainPrize();
		this.mainEthPrizeAmountPercentage = await game_.mainEthPrizeAmountPercentage();
		this.marketingWalletCstContributionAmount = await game_.marketingWalletCstContributionAmount();
		this.charityEthDonationAmountPercentage = await game_.charityEthDonationAmountPercentage();
		this.charityAddress = (await game_.charityAddress()).toLowerCase();
		this.marketingWalletAddress = (await game_.marketingWallet()).toLowerCase();

		this.roundNum = await game_.roundNum();
		this.roundActivationTime = await game_.roundActivationTime();
		this.mainPrizeTime = await game_.mainPrizeTime();
		this.mainPrizeTimeIncrementInMicroSeconds = await game_.mainPrizeTimeIncrementInMicroSeconds();
		this.ethDutchAuctionBeginningBidPrice = await game_.ethDutchAuctionBeginningBidPrice();
		this.nextEthBidPrice = await game_.nextEthBidPrice();
		this.cstDutchAuctionBeginningTimeStamp = await game_.cstDutchAuctionBeginningTimeStamp();
		this.cstDutchAuctionBeginningBidPrice = await game_.cstDutchAuctionBeginningBidPrice();
		this.nextRoundFirstCstDutchAuctionBeginningBidPrice = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		this.lastBidderAddress = (await game_.lastBidderAddress()).toLowerCase();
		this.lastCstBidderAddress = (await game_.lastCstBidderAddress()).toLowerCase();
		this.enduranceChampionAddress = (await game_.enduranceChampionAddress()).toLowerCase();
		this.enduranceChampionStartTimeStamp = await game_.enduranceChampionStartTimeStamp();
		this.enduranceChampionDuration = await game_.enduranceChampionDuration();
		this.prevEnduranceChampionDuration = await game_.prevEnduranceChampionDuration();
		this.chronoWarriorAddress = (await game_.chronoWarriorAddress()).toLowerCase();
		this.chronoWarriorDuration = BigInt.asIntN(256, await game_.chronoWarriorDuration());
	}

	// #endregion
	// #region Round bid statistics

	/** @returns Round record for the current round, creating it lazily. */
	_currentRound() {
		const key_ = this.roundNum.toString();
		let round_ = this.rounds.get(key_);
		if (round_ === undefined) {
			round_ = { bidderAddresses: [], biddersInfo: new Map() };
			this.rounds.set(key_, round_);
		}
		return round_;
	}

	/**
	@param {bigint} roundNum_
	@param {string} bidderAddress_ Lowercase.
	*/
	getBidderInfo(roundNum_, bidderAddress_) {
		const round_ = this.rounds.get(roundNum_.toString());
		const info_ = round_?.biddersInfo.get(bidderAddress_.toLowerCase());
		return info_ ?? { totalSpentEthAmount: 0n, totalSpentCstAmount: 0n, lastBidTimeStamp: 0n };
	}

	_bidderInfoForUpdate(bidderAddress_) {
		const round_ = this._currentRound();
		const key_ = bidderAddress_.toLowerCase();
		let info_ = round_.biddersInfo.get(key_);
		if (info_ === undefined) {
			info_ = { totalSpentEthAmount: 0n, totalSpentCstAmount: 0n, lastBidTimeStamp: 0n };
			round_.biddersInfo.set(key_, info_);
		}
		return info_;
	}

	/** Number of bids in the given round. */
	getTotalNumBids(roundNum_) {
		return BigInt(this.rounds.get(roundNum_.toString())?.bidderAddresses.length ?? 0);
	}

	getBidderAddresses(roundNum_) {
		return this.rounds.get(roundNum_.toString())?.bidderAddresses ?? [];
	}

	// #endregion
	// #region Price / reward views (exact mirrors of on-chain getters)

	/** `uint256(int256(-1))` for chain comparisons. */
	chronoWarriorDurationUint() {
		return BigInt.asUintN(256, this.chronoWarriorDuration);
	}

	/**
	Whether the active code uses V1 mechanics (fixed CST reward, divisor-based CST Dutch auction,
	`mainPrizeTime` clamped to `block.timestamp`).
	*/
	isV1Like() {
		return this.version === 1;
	}

	/** Mirrors `getMainPrizeTimeIncrement`. */
	getMainPrizeTimeIncrement() {
		return this.mainPrizeTimeIncrementInMicroSeconds / c.MICROSECONDS_PER_SECOND;
	}

	/** Mirrors `getInitialDurationUntilMainPrize`. */
	getInitialDurationUntilMainPrize() {
		return this.mainPrizeTimeIncrementInMicroSeconds / this.initialDurationUntilMainPrizeDivisor;
	}

	/** Mirrors `_getEthDutchAuctionDuration`. */
	getEthDutchAuctionDuration() {
		return this.mainPrizeTimeIncrementInMicroSeconds / this.ethDutchAuctionDurationDivisor;
	}

	/**
	Mirrors `getNextEthBidPriceAdvanced(0)` evaluated at block timestamp `ts_`.
	The contract body is `unchecked`; the fuzz model treats any wrap in this pricing path as a bug unless
	a caller explicitly marks the operation as an accepted owner-adversarial scenario.
	*/
	getNextEthBidPrice(ts_) {
		if (this.lastBidderAddress !== ZERO_ADDRESS) {
			return this.nextEthBidPrice;
		}
		let price_ = this.ethDutchAuctionBeginningBidPrice;
		if (price_ === 0n) {
			// First round only; V2 never runs in this state.
			return c.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
		}
		const elapsed_ = ts_ - this.roundActivationTime;
		if (elapsed_ <= 0n) {
			return price_;
		}
		const endingPrice_ = u256(price_ / this.ethDutchAuctionEndingBidPriceDivisor + 1n);
		const duration_ = this.getEthDutchAuctionDuration();
		if (elapsed_ < duration_) {
			const diff_ = u256(price_ - endingPrice_);
			return u256(price_ - u256(diff_ * elapsed_) / duration_);
		}
		return endingPrice_;
	}

	/** Mirrors `getEthPlusRandomWalkNftBidPrice` (contract body is `unchecked`). */
	getEthPlusRandomWalkNftBidPrice(ethBidPrice_) {
		return u256(ethBidPrice_ + (c.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1n)) / c.RANDOMWALK_NFT_BID_PRICE_DIVISOR;
	}

	/** CST Dutch auction total duration (V1: derived; V2: stored). */
	getCstDutchAuctionDuration() {
		return this.isV1Like() ?
			this.mainPrizeTimeIncrementInMicroSeconds / this.cstDutchAuctionDurationDivisor :
			this.cstDutchAuctionDuration;
	}

	/** Mirrors `getNextCstBidPriceAdvanced(0)` evaluated at block timestamp `ts_`. */
	getNextCstBidPrice(ts_) {
		const duration_ = this.getCstDutchAuctionDuration();
		const elapsed_ = ts_ - this.cstDutchAuctionBeginningTimeStamp;
		const remaining_ = duration_ - elapsed_;
		if (remaining_ <= 0n) {
			return 0n;
		}
		const beginningPrice_ =
			(this.lastCstBidderAddress === ZERO_ADDRESS) ?
			this.nextRoundFirstCstDutchAuctionBeginningBidPrice :
			this.cstDutchAuctionBeginningBidPrice;
		// Contract body is `unchecked`: the product wraps mod 2^256 before the division.
		return u256(beginningPrice_ * remaining_) / duration_;
	}

	/** Mirrors V2 `getBidCstRewardAmountAdvanced(0)` evaluated at block timestamp `ts_`. */
	getBidCstRewardAmount(ts_) {
		if (this.isV1Like()) {
			return this.bidCstRewardAmount;
		}
		const lastBidTimeStamp_ =
			(this.lastBidderAddress === ZERO_ADDRESS) ?
			this.roundActivationTime :
			this.getBidderInfo(this.roundNum, this.lastBidderAddress).lastBidTimeStamp;
		const elapsed_ = ts_ - lastBidTimeStamp_;
		if (elapsed_ <= 0n) {
			return 0n;
		}
		// Contract body is `unchecked`: the product wraps mod 2^256 before the division.
		const radicand_ = u256(elapsed_ * this.bidCstRewardAmountMultiplier) / this.mainPrizeTimeIncrementInMicroSeconds;
		return sqrtFloor(radicand_);
	}

	/**
	Mirrors `tryGetCurrentChampions` evaluated at block timestamp `ts_`.
	@returns {{enduranceChampionAddress: string, enduranceChampionDuration: bigint, chronoWarriorAddress: string, chronoWarriorDuration: bigint}}
	*/
	tryGetCurrentChampions(ts_) {
		if (this.lastBidderAddress === ZERO_ADDRESS) {
			return {
				enduranceChampionAddress: ZERO_ADDRESS,
				enduranceChampionDuration: 0n,
				chronoWarriorAddress: ZERO_ADDRESS,
				chronoWarriorDuration: 0n,
			};
		}
		let endurance_ = this.enduranceChampionAddress;
		let enduranceStart_ = this.enduranceChampionStartTimeStamp;
		let enduranceDuration_ = this.enduranceChampionDuration;
		let prevEnduranceDuration_ = this.prevEnduranceChampionDuration;
		let chrono_ = this.chronoWarriorAddress;
		let chronoDuration_ = this.chronoWarriorDuration;
		const lastBidTs_ = this.getBidderInfo(this.roundNum, this.lastBidderAddress).lastBidTimeStamp;
		const lastBidDuration_ = ts_ - lastBidTs_;
		if (endurance_ === ZERO_ADDRESS) {
			endurance_ = this.lastBidderAddress;
			enduranceStart_ = lastBidTs_;
			enduranceDuration_ = lastBidDuration_;
		} else if (lastBidDuration_ > enduranceDuration_) {
			{
				const chronoEnd_ = lastBidTs_ + enduranceDuration_;
				const chronoStart_ = enduranceStart_ + prevEnduranceDuration_;
				const dur_ = chronoEnd_ - chronoStart_;
				if (dur_ > chronoDuration_) {
					chrono_ = endurance_;
					chronoDuration_ = dur_;
				}
			}
			prevEnduranceDuration_ = enduranceDuration_;
			endurance_ = this.lastBidderAddress;
			enduranceStart_ = lastBidTs_;
			enduranceDuration_ = lastBidDuration_;
		}
		{
			const chronoStart_ = enduranceStart_ + prevEnduranceDuration_;
			const dur_ = ts_ - chronoStart_;
			if (dur_ > chronoDuration_) {
				chrono_ = endurance_;
				chronoDuration_ = dur_;
			}
		}
		return {
			enduranceChampionAddress: endurance_,
			enduranceChampionDuration: enduranceDuration_,
			chronoWarriorAddress: chrono_,
			chronoWarriorDuration: BigInt.asUintN(256, chronoDuration_),
		};
	}

	// #endregion
	// #region Champion state transitions (exact mirrors of `BidStatistics`)

	/** Mirrors `_updateChampionsIfNeeded` (requires `lastBidderAddress != 0`). */
	_updateChampionsIfNeeded(ts_) {
		const lastBidTs_ = this.getBidderInfo(this.roundNum, this.lastBidderAddress).lastBidTimeStamp;
		const lastBidDuration_ = ts_ - lastBidTs_;
		if (this.enduranceChampionAddress === ZERO_ADDRESS) {
			this.enduranceChampionAddress = this.lastBidderAddress;
			this.enduranceChampionStartTimeStamp = lastBidTs_;
			this.enduranceChampionDuration = lastBidDuration_;
		} else if (lastBidDuration_ > this.enduranceChampionDuration) {
			this._updateChronoWarriorIfNeeded(lastBidTs_ + this.enduranceChampionDuration);
			this.prevEnduranceChampionDuration = this.enduranceChampionDuration;
			this.enduranceChampionAddress = this.lastBidderAddress;
			this.enduranceChampionStartTimeStamp = lastBidTs_;
			this.enduranceChampionDuration = lastBidDuration_;
		}
	}

	/** Mirrors `_updateChronoWarriorIfNeeded`. */
	_updateChronoWarriorIfNeeded(chronoEndTimeStamp_) {
		const chronoStart_ = this.enduranceChampionStartTimeStamp + this.prevEnduranceChampionDuration;
		const chronoDuration_ = chronoEndTimeStamp_ - chronoStart_;
		if (chronoDuration_ > this.chronoWarriorDuration) {
			this.chronoWarriorAddress = this.enduranceChampionAddress;
			this.chronoWarriorDuration = chronoDuration_;
		}
	}

	// #endregion
	// #region Bid application

	/** Mirrors `_extendMainPrizeTime` (V1 clamps to `block.timestamp`; V2 does not). */
	_extendMainPrizeTime(ts_) {
		const increment_ = this.getMainPrizeTimeIncrement();
		if (this.isV1Like()) {
			this.mainPrizeTime = maxBigInt(this.mainPrizeTime, ts_) + increment_;
		} else {
			this.mainPrizeTime += increment_;
		}
	}

	/** Mirrors `_bidCommon` (after bid-type-specific logic). */
	_bidCommon(bidderAddress_, ts_) {
		const isFirstBid_ = this.lastBidderAddress === ZERO_ADDRESS;
		if (isFirstBid_) {
			this.cstDutchAuctionBeginningTimeStamp = ts_;
			this.mainPrizeTime = ts_ + this.getInitialDurationUntilMainPrize();
		} else {
			this._updateChampionsIfNeeded(ts_);
			this._extendMainPrizeTime(ts_);
		}
		this.lastBidderAddress = bidderAddress_.toLowerCase();
		const round_ = this._currentRound();
		round_.bidderAddresses.push(bidderAddress_.toLowerCase());
		this._bidderInfoForUpdate(bidderAddress_).lastBidTimeStamp = ts_;
		return isFirstBid_;
	}

	/**
	Plans an ETH bid without mutating state.
	@param {bigint} ts_ Planned block timestamp.
	@param {bigint} msgValue_
	@param {bigint} gasPrice_ Exact tx gas price (the engine sends bids with an explicit legacy gas price).
	@param {bigint | null} randomWalkNftId_ `null` for a plain ETH bid.
	@returns Expected outcome (does not validate revert conditions; callers pre-check applicability).
	*/
	planEthBid(ts_, msgValue_, gasPrice_, randomWalkNftId_) {
		const ethBidPrice_ = this.getNextEthBidPrice(ts_);
		const reward_ = this.getBidCstRewardAmount(ts_);
		const basePaidPrice_ = (randomWalkNftId_ === null) ? ethBidPrice_ : this.getEthPlusRandomWalkNftBidPrice(ethBidPrice_);
		// `paidEthPrice_` is the value the contract records (BidPlaced event + `totalSpentEthAmount`);
		// `netEthPaid_` is the ETH the bidder actually loses (== what the game keeps).
		let paidEthPrice_ = basePaidPrice_;
		let netEthPaid_ = basePaidPrice_;
		let refundAmount_ = 0n;
		let swallowed_ = false;
		const overpaid_ = msgValue_ - basePaidPrice_;
		if (overpaid_ > 0n) {
			// // Comment-202607014 applies.
			// const swallowLimit_ =
			// 	(gasPrice_ > 0n) ?
			// 	(this.ethBidRefundAmountInGasToSwallowMaxLimit * gasPrice_) :
			// 	MAX_UINT256;

			const swallowLimit_ = this.ethBidRefundAmountInGasToSwallowMaxLimit * gasPrice_;
			if (overpaid_ <= swallowLimit_) {
				swallowed_ = true;
				// The swallowed overpay is kept by the game (never refunded), so the bidder loses `msg.value`.
				netEthPaid_ = msgValue_;
				paidEthPrice_ = msgValue_;
			} else {
				refundAmount_ = overpaid_;
			}
		}
		return { ethBidPrice: ethBidPrice_, paidEthPrice: paidEthPrice_, netEthPaid: netEthPaid_, refundAmount: refundAmount_, swallowed: swallowed_, insufficient: overpaid_ < 0n, bidCstRewardAmount: reward_ };
	}

	/**
	Applies a successful ETH bid (mirrors `_bidWithEth`).
	@returns Same expectations as `planEthBid` plus V2 `newCstDutchAuctionDuration`.
	*/
	applyEthBid(bidderAddress_, ts_, msgValue_, gasPrice_, randomWalkNftId_) {
		const plan_ = this.planEthBid(ts_, msgValue_, gasPrice_, randomWalkNftId_);
		expect(plan_.insufficient, "model: applying an insufficient ETH bid").to.equal(false);
		if (randomWalkNftId_ !== null) {
			this.usedRandomWalkNfts.add(randomWalkNftId_.toString());
		}
		this._bidderInfoForUpdate(bidderAddress_).totalSpentEthAmount += plan_.paidEthPrice;
		if (this.lastBidderAddress === ZERO_ADDRESS) {
			this.ethDutchAuctionBeginningBidPrice = plan_.ethBidPrice * c.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		}
		this.nextEthBidPrice = plan_.ethBidPrice + plan_.ethBidPrice / this.ethBidPriceIncreaseDivisor + 1n;
		let newCstDutchAuctionDuration_ = null;
		if (this.version === 2) {
			newCstDutchAuctionDuration_ =
				(this.cstDutchAuctionDuration + 1n) * this.cstDutchAuctionDurationChangeDivisor / (this.cstDutchAuctionDurationChangeDivisor + 1n);
			this.cstDutchAuctionDuration = newCstDutchAuctionDuration_;
		}
		this._bidCommon(bidderAddress_, ts_);
		return { ...plan_, newCstDutchAuctionDuration: newCstDutchAuctionDuration_, mainPrizeTime: this.mainPrizeTime };
	}

	/**
	Applies a successful CST bid (mirrors `_bidWithCst`).
	@returns {{paidPrice: bigint, bidCstRewardAmount: bigint, newCstDutchAuctionDuration: bigint | null, mainPrizeTime: bigint}}
	*/
	applyCstBid(bidderAddress_, ts_) {
		const paidPrice_ = this.getNextCstBidPrice(ts_);
		const reward_ = this.getBidCstRewardAmount(ts_);
		this._bidderInfoForUpdate(bidderAddress_).totalSpentCstAmount += paidPrice_;
		this.cstDutchAuctionBeginningTimeStamp = ts_;
		const newBeginningBidPrice_ =
			maxBigInt(paidPrice_ * c.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, this.cstDutchAuctionBeginningBidPriceMinLimit);
		this.cstDutchAuctionBeginningBidPrice = newBeginningBidPrice_;
		if (this.lastCstBidderAddress === ZERO_ADDRESS) {
			this.nextRoundFirstCstDutchAuctionBeginningBidPrice = newBeginningBidPrice_;
		}
		this.lastCstBidderAddress = bidderAddress_.toLowerCase();
		let newCstDutchAuctionDuration_ = null;
		if (this.version === 2) {
			newCstDutchAuctionDuration_ = this.cstDutchAuctionDuration + this.cstDutchAuctionDuration / this.cstDutchAuctionDurationChangeDivisor;
			this.cstDutchAuctionDuration = newCstDutchAuctionDuration_;
		}
		this._bidCommon(bidderAddress_, ts_);
		return { paidPrice: paidPrice_, bidCstRewardAmount: reward_, newCstDutchAuctionDuration: newCstDutchAuctionDuration_, mainPrizeTime: this.mainPrizeTime };
	}

	// #endregion
	// #region Claim application

	/**
	Whether `claimerAddress_` may claim at `ts_`, and the exact expected error if not.
	@returns {{ok: boolean, errorName?: string}}
	*/
	checkClaimAuthorization(claimerAddress_, ts_) {
		if (claimerAddress_.toLowerCase() === this.lastBidderAddress && this.lastBidderAddress !== ZERO_ADDRESS) {
			if (ts_ < this.mainPrizeTime) {
				return { ok: false, errorName: "MainPrizeEarlyClaim" };
			}
			return { ok: true };
		}
		if (this.lastBidderAddress === ZERO_ADDRESS) {
			return { ok: false, errorName: "NoBidsPlacedInCurrentRound" };
		}
		const durationUntilPermitted_ = (this.mainPrizeTime - ts_) + this.timeoutDurationToClaimMainPrize;
		if (durationUntilPermitted_ > 0n) {
			return { ok: false, errorName: "MainPrizeClaimDenied" };
		}
		return { ok: true };
	}

	/**
	Applies a successful `claimMainPrize` and returns the exact expected prize breakdown.
	Raffle winner identities are random on-chain; only counts/amounts/membership are predicted.
	@param {string} claimerAddress_
	@param {bigint} ts_ Claim block timestamp.
	@param {bigint} gameEthBalance_ Game ETH balance just before the claim transaction.
	@param {bigint} numStakedCosmicSignatureNfts_
	@param {bigint} numStakedRandomWalkNfts_
	*/
	applyClaim(claimerAddress_, ts_, gameEthBalance_, numStakedCosmicSignatureNfts_, numStakedRandomWalkNfts_) {
		const claimer_ = claimerAddress_.toLowerCase();

		// Champion finalization (mirrors `claimMainPrize` pre-distribution updates).
		this._updateChampionsIfNeeded(ts_);
		this._updateChronoWarriorIfNeeded(ts_);

		const mainEthPrizeAmount_ = gameEthBalance_ * this.mainEthPrizeAmountPercentage / 100n;
		const chronoWarriorEthPrizeAmount_ = gameEthBalance_ * this.chronoWarriorEthPrizeAmountPercentage / 100n;
		const charityEthDonationAmount_ = gameEthBalance_ * this.charityEthDonationAmountPercentage / 100n;
		const stakingTotalEthRewardAmount_ = gameEthBalance_ * this.cosmicSignatureNftStakingTotalEthRewardAmountPercentage / 100n;
		const raffleTotalEthPrizeAmount_ = gameEthBalance_ * this.raffleTotalEthPrizeAmountForBiddersPercentage / 100n;
		const raffleEthPrizeAmountPerBidder_ = raffleTotalEthPrizeAmount_ / this.numRaffleEthPrizesForBidders;
		const ethDepositsTotalAmount_ = chronoWarriorEthPrizeAmount_ + raffleEthPrizeAmountPerBidder_ * this.numRaffleEthPrizesForBidders;
		const stakingDepositSucceeds_ = numStakedCosmicSignatureNfts_ > 0n;
		const numLuckyStakers_ = (numStakedRandomWalkNfts_ > 0n) ? this.numRaffleCosmicSignatureNftsForRandomWalkNftStakers : 0n;
		const hasLastCstBidder_ = this.lastCstBidderAddress !== ZERO_ADDRESS;
		// Mirrors Comment-202606011: main, lastCst?, endurance, chrono, raffle bidders, lucky stakers (+ marketing CST-only).
		const numNftMints_ = 1n + (hasLastCstBidder_ ? 1n : 0n) + 2n + this.numRaffleCosmicSignatureNftsForBidders + numLuckyStakers_;

		const breakdown_ = {
			roundNum: this.roundNum,
			claimerAddress: claimer_,
			mainEthPrizeAmount: mainEthPrizeAmount_,
			chronoWarriorEthPrizeAmount: chronoWarriorEthPrizeAmount_,
			charityEthDonationAmount: charityEthDonationAmount_,
			stakingTotalEthRewardAmount: stakingTotalEthRewardAmount_,
			stakingDepositSucceeds: stakingDepositSucceeds_,
			raffleEthPrizeAmountPerBidder: raffleEthPrizeAmountPerBidder_,
			ethDepositsTotalAmount: ethDepositsTotalAmount_,
			numLuckyStakers: numLuckyStakers_,
			hasLastCstBidder: hasLastCstBidder_,
			lastCstBidderAddress: this.lastCstBidderAddress,
			enduranceChampionAddress: this.enduranceChampionAddress,
			chronoWarriorAddress: this.chronoWarriorAddress,
			numNftMints: numNftMints_,
			cstPrizeAmount: this.cstPrizeAmount,
			marketingWalletCstContributionAmount: this.marketingWalletCstContributionAmount,
			numRaffleEthPrizesForBidders: this.numRaffleEthPrizesForBidders,
			numRaffleCosmicSignatureNftsForBidders: this.numRaffleCosmicSignatureNftsForBidders,
			bidderAddresses: this.getBidderAddresses(this.roundNum),
		};

		// `_prepareNextRound`.
		this.lastBidderAddress = ZERO_ADDRESS;
		this.lastCstBidderAddress = ZERO_ADDRESS;
		this.enduranceChampionAddress = ZERO_ADDRESS;
		this.prevEnduranceChampionDuration = 0n;
		this.chronoWarriorAddress = ZERO_ADDRESS;
		this.chronoWarriorDuration = -1n;
		this.roundNum += 1n;
		this.mainPrizeTimeIncrementInMicroSeconds += this.mainPrizeTimeIncrementInMicroSeconds / this.mainPrizeTimeIncrementIncreaseDivisor;
		// Comment-202606235: V2 intentionally accepts this owner-adversarial wrap so a bad delay cannot brick claims.
		this.roundActivationTime = u256(
			ts_ + this.delayDurationBeforeRoundActivation,
			"roundActivationTime owner-delay update",
			this.version === 2
		);

		return breakdown_;
	}

	// #endregion
	// #region Admin / upgrade application

	/**
	Mirrors `halveEthDutchAuctionEndingBidPrice` state changes (caller pre-validates conditions).
	@param {bigint} ts_
	*/
	applyHalveEthDutchAuctionEndingBidPrice(ts_) {
		const elapsed_ = ts_ - this.roundActivationTime;
		const duration_ = this.getEthDutchAuctionDuration();
		expect(elapsed_ > duration_, "model: halveEthDutchAuctionEndingBidPrice called too early").to.equal(true);
		let newEndingBidPriceDivisor_ = this.ethDutchAuctionEndingBidPriceDivisor;
		const currentEthBidPrice_ = this.ethDutchAuctionBeginningBidPrice / newEndingBidPriceDivisor_ + 1n;
		newEndingBidPriceDivisor_ *= 2n;
		const endingBidPrice_ = this.ethDutchAuctionBeginningBidPrice / newEndingBidPriceDivisor_ + 1n;
		const numerator_ = (this.ethDutchAuctionBeginningBidPrice - currentEthBidPrice_) * this.mainPrizeTimeIncrementInMicroSeconds;
		const denominator_ = (this.ethDutchAuctionBeginningBidPrice - endingBidPrice_) * elapsed_;
		const newDurationDivisor_ = numerator_ / denominator_ + 1n;
		this.ethDutchAuctionDurationDivisor = newDurationDivisor_;
		this.ethDutchAuctionEndingBidPriceDivisor = newEndingBidPriceDivisor_;
		return { newDurationDivisor: newDurationDivisor_, newEndingBidPriceDivisor: newEndingBidPriceDivisor_ };
	}

	/** Applies `initializeV2` state changes (run as the upgrade call). */
	applyUpgradeToV2() {
		this.version = 2;
		this.cstDutchAuctionDuration = c.INITIAL_CST_DUTCH_AUCTION_DURATION;
		this.cstDutchAuctionDurationChangeDivisor = c.DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR;
		this.bidCstRewardAmountMultiplier = c.DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;
		this.timeoutDurationToClaimMainPrize = c.DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2;
		this.cstDutchAuctionDurationDivisor = 0n;
		this.bidCstRewardAmount = 0n;
	}

	// #endregion
}

// #endregion
// #region

const ZERO_ADDRESS = hre.ethers.ZeroAddress;

module.exports = {
	GameModel,
	ZERO_ADDRESS,
};

// #endregion
