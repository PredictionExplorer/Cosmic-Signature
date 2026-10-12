"use strict";

// Tests `BiddingV3`'s linear bid CST reward:
// the reward accrues at `bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` CST Wei
// per second since the last bid, and when someone places a bid, the WHOLE reward is minted to the bidder
// being outbid (`lastBidderAddress`). Nothing is minted on the first bid in a bidding round.
// The same rate is the rate at which the CST bid price base declines (Comment-202611023), so the reward is the unit
// the CST side of the game is measured in; the tests near the end check the economics that follow from that.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, SECONDS_PER_HOUR } = require("../../src/CosmicSignatureConstants.js");
const { maxBigInt } = require("../../src/BigIntMathHelpers.js");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, findParsedEvent, getLatestBlockTimestamp, blockTimestampOfReceipt } = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	assertDefaultV3Initialization,
	findTimeStampWithAffordableCstBidPrice,
	getRoundLateBidPricePremiumAmount,
	getV3BidCstRewardAmount,
	getV3NewCstDutchAuctionBeginningBidPrice,
	getV3CstBidPriceBase,
	getV3CstBidRaffleWeight,
	readCstPricingParams,
	readV3CstDutchAuctionBeginningBidPrice,
	getLastBidRaffleWeight,
} = require("../src/V3UpgradeTestHelpers.js");
const { getPriceAndBidWithEthAt, getPriceAndBidWithCstAt, findParsedEvents } = require("../src/BidCstRewardTestHelpers.js");
const { configureRewardAndDeployHostileBidder, hostileBidWithEthAt } = require("../src/AdversarialTestHelpers.js");
const { testAcrossGameVersions, finishGameRound, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

describe("CosmicSignatureGameV3-BidCstReward", function () {
	it("reinitialize sets bidCstRewardAmountMultiplier so the reward accrues at ~1 CST per minute", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await assertDefaultV3Initialization(game_);
		expect(await game_.bidCstRewardAmountMultiplier()).equal(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);
		expect(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER).equal(6n * 10n ** 25n);

		// The reward rate divides the multiplier by `mainPrizeTimeIncrementInMicroSeconds`, which has grown 1%
		// on the round 0 main prize claim, so in round 1 a minute-long wait yields slightly less than 1 CST.
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await getPriceAndBidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 10n);
		const rewardPerMinute_ = await game_.getBidCstRewardAmountAdvanced(60n);
		expect(rewardPerMinute_).equal(60n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER / mainPrizeTimeIncrementInMicroSeconds_);
		expect(rewardPerMinute_).greaterThan(10n ** 18n * 98n / 100n);
		expect(rewardPerMinute_).lessThanOrEqual(10n ** 18n);
	});

	it("the reward getter accrues since the last bid", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();

			// // Comment-202610021 applies.
			// // Before the first bid, the zero address's bidder record has timestamp zero. The getter therefore
			// // reports the purely mathematical accrual since Unix epoch, even though the first ETH bid ignores it.
			// const latestTimeStampBeforeFirstBid_ = await getLatestBlockTimestamp();
			// for (const currentTimeOffset_ of [0n, 1n, 60n, SECONDS_PER_HOUR, 7n * SECONDS_PER_DAY,]) {
			// 	expect(
			// 		await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_),
			// 		`before the first bid, at offset ${currentTimeOffset_}`
			// 	).equal(
			// 		getV3BidCstRewardAmount(
			// 			latestTimeStampBeforeFirstBid_ + currentTimeOffset_,
			// 			DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
			// 			mainPrizeTimeIncrementInMicroSeconds_
			// 		)
			// 	);
			// }
			// expect(await game_.getBidCstRewardAmount()).equal(
			// 	getV3BidCstRewardAmount(
			// 		latestTimeStampBeforeFirstBid_,
			// 		DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
			// 		mainPrizeTimeIncrementInMicroSeconds_
			// 	)
			// );

			// Place the first bid at a known timestamp.
			const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
			await getPriceAndBidWithEthAt(game_, contracts_.signers[1], firstBidTimeStamp_);

			// After a bid, the reward accrues since that bid.
			{
				const latestTimeStamp_ = await getLatestBlockTimestamp();
				expect(latestTimeStamp_).equal(firstBidTimeStamp_);
				for (const currentTimeOffset_ of [-11n, -1n, 0n, 1n, 59n, 60n, 61n, 89n, 90n, SECONDS_PER_HOUR, 100n * SECONDS_PER_HOUR,]) {
					const expectedRewardAmount_ = getV3BidCstRewardAmount(
						currentTimeOffset_,
						DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
						mainPrizeTimeIncrementInMicroSeconds_
					);
					expect(
						await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_),
						`after the first bid, at offset ${currentTimeOffset_}`
					).equal(expectedRewardAmount_);
				}
				expect(await game_.getBidCstRewardAmount()).equal(0n);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("nothing is minted on the first bid; the whole reward is minted to the outbid bidder afterwards", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			// #region

			const token_ = contracts_.cosmicSignatureToken;
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
			const bidder1_ = contracts_.signers[1];
			const bidder2_ = contracts_.signers[2];

			// #endregion
			// #region The first bid in the round mints nothing at all.

			const roundActivationTime_ = await game_.roundActivationTime();
			const firstBidTimeStamp_ = roundActivationTime_ + 100n;
			{
				const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
				const totalSupplyBefore_ = await token_.totalSupply();
				const { receipt_ } = await getPriceAndBidWithEthAt(game_, bidder1_, firstBidTimeStamp_);

				// `BidPlaced` reports a zero reward; nothing got minted; no `Transfer` events at all.
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.bidCstRewardAmount).equal(0n);
				expect(await token_.balanceOf(bidder1_.address)).equal(bidder1CstBalanceBefore_);
				expect(await token_.totalSupply()).equal(totalSupplyBefore_);
				expect(findParsedEvents(receipt_, token_, "Transfer").length).equal(0);
			}

			// #endregion
			// #region The second bid mints the whole reward to the outbid bidder; the new bidder gets nothing.

			{
				const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
				const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);
				const totalSupplyBefore_ = await token_.totalSupply();
				const secondBidTimeStamp_ = firstBidTimeStamp_ + 61n;
				const { receipt_ } = await getPriceAndBidWithEthAt(game_, bidder2_, secondBidTimeStamp_);
				const totalRewardAmount_ = getV3BidCstRewardAmount(61n, DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, mainPrizeTimeIncrementInMicroSeconds_);
				expect(totalRewardAmount_).greaterThan(0n);

				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
				expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_, "outbid bidder reward").equal(totalRewardAmount_);
				expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_, "new bidder gets nothing").equal(0n);
				expect(await token_.totalSupply() - totalSupplyBefore_).equal(totalRewardAmount_);

				// Exactly 1 mint happened, to the outbid bidder.
				const transfers_ = findParsedEvents(receipt_, token_, "Transfer");
				expect(transfers_.length).equal(1);
				expect(transfers_[0].args.from).equal(hre.ethers.ZeroAddress);
				expect(transfers_[0].args.to).equal(bidder1_.address);
				expect(transfers_[0].args.value).equal(totalRewardAmount_);
			}

			// #endregion
			// #region A bidder outbidding themself receives their own reward.

			{
				const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);
				const thirdBidTimeStamp_ = (await getLatestBlockTimestamp()) + 200n;
				await getPriceAndBidWithEthAt(game_, bidder2_, thirdBidTimeStamp_);
				const totalRewardAmount_ = getV3BidCstRewardAmount(200n, DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, mainPrizeTimeIncrementInMicroSeconds_);
				expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal(totalRewardAmount_);
			}

			// #endregion
			// #region

			await finishGameRound(contracts_, game_);

			// #endregion
		}, 3, 3);
	});

	it("a CST bid burns the price and mints the whole reward to the outbid bidder in a single transaction", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const params_ = await readCstPricingParams(game_);
			const {
				bidCstRewardAmountMultiplier: multiplier_,
				mainPrizeTimeIncrementInMicroSeconds: increment_,
				initialDurationUntilMainPrizeDivisor: divisor_,
				mainPrizeTimeIncrement: mainPrizeTimeIncrement_,
				initialDurationUntilMainPrize: initialDurationUntilMainPrize_,
				cstDutchAuctionBeginningBidPriceMaxLimit: maxLimit_,
			} = params_;
			const rewardAt_ = (elapsedDuration_) => getV3BidCstRewardAmount(elapsedDuration_, multiplier_, increment_);
			const bidder1_ = contracts_.signers[1];
			const bidder2_ = contracts_.signers[2];

			// The CST bid price base begins at the reward of the initial duration until main prize and declines at the reward
			// rate (Comment-202611023), so a bidder must hold the last bidder position for a good part of that duration
			// to afford a CST bid. bidder2 places the 2nd bid and gets outbid three quarters of the initial duration later,
			// which mints it about three quarters of the maximum CST bid price.
			for (const [bidder_, elapsedDuration_] of [
				[bidder1_, 10n],
				[bidder2_, 30n],
				[bidder1_, initialDurationUntilMainPrize_ * 3n / 4n],
			]) {
				const { receipt_ } = await getPriceAndBidWithEthAt(game_, bidder_, (await getLatestBlockTimestamp()) + elapsedDuration_);

				// No CST bid has been placed in the round, so the auction began at the maximum; an ETH bid does not change that.
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice).equal(maxLimit_);
			}

			const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
			const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);
			const totalSupplyBefore_ = await token_.totalSupply();
			const lastBidTimeStamp_ = await getLatestBlockTimestamp();
			const cstBidTimeStamp_ = lastBidTimeStamp_ + mainPrizeTimeIncrement_;

			// Make sure bidder2 can afford the CST bid price, which is premium-free this far before `mainPrizeTime`.
			const cstBidPriceBase_ = await game_.getNextCstBidPriceBaseAdvanced(cstBidTimeStamp_ - lastBidTimeStamp_);
			expect(cstBidPriceBase_).greaterThan(0n);
			expect(await game_.getNextCstBidPriceAdvanced(cstBidTimeStamp_ - lastBidTimeStamp_)).equal(cstBidPriceBase_);
			expect(cstBidPriceBase_).lessThanOrEqual(bidder2CstBalanceBefore_);

			const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, bidder2_, cstBidTimeStamp_);
			expect(cstBidPrice_).equal(cstBidPriceBase_);
			const totalRewardAmount_ = rewardAt_(mainPrizeTimeIncrement_);

			// The next auction begins at twice the base paid plus one increment of reward (Comment-202611024).
			const newBeginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(cstBidPriceBase_, multiplier_, divisor_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.paidCstPrice).equal(cstBidPrice_);
			expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
			expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice).equal(newBeginningPrice_);
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(newBeginningPrice_);

			// bidder1 was the last bidder: it gets the whole reward; bidder2 pays the price and gets nothing.
			expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_).equal(totalRewardAmount_);
			expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal( - cstBidPrice_ );
			expect(await token_.totalSupply() - totalSupplyBefore_).equal(totalRewardAmount_ - cstBidPrice_);

			// Exactly 2 transfers happened. `CosmicSignatureToken.mintAndBurnMany` iterates the specs in the direct order:
			// the price burn from the bidder, then the whole reward mint to the outbid bidder.
			const transfers_ = findParsedEvents(receipt_, token_, "Transfer");
			expect(transfers_.length).equal(2);
			expect(transfers_[0].args.from).equal(bidder2_.address);
			expect(transfers_[0].args.to).equal(hre.ethers.ZeroAddress);
			expect(transfers_[0].args.value).equal(cstBidPrice_);
			expect(transfers_[1].args.from).equal(hre.ethers.ZeroAddress);
			expect(transfers_[1].args.to).equal(bidder1_.address);
			expect(transfers_[1].args.value).equal(totalRewardAmount_);

			// A CST bid by the same bidder again nets `totalReward - paidCstPrice` to that bidder.
			{
				const bidder2CstBalanceBefore2_ = await token_.balanceOf(bidder2_.address);
				const { timeStamp: cstBidTimeStamp2_ } =
					await findTimeStampWithAffordableCstBidPrice(game_, bidder2CstBalanceBefore2_, cstBidTimeStamp_ + 123n);
				const { receipt_: receipt2_, cstBidPrice_: cstBidPrice2_ } = await getPriceAndBidWithCstAt(game_, bidder2_, cstBidTimeStamp2_);
				const totalRewardAmount2_ = rewardAt_(cstBidTimeStamp2_ - cstBidTimeStamp_);
				expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore2_).equal(totalRewardAmount2_ - cstBidPrice2_);
				const cstBidPriceBase2_ = getV3CstBidPriceBase(newBeginningPrice_, cstBidTimeStamp2_ - cstBidTimeStamp_, multiplier_, increment_);
				expect(cstBidPrice2_).equal(cstBidPriceBase2_);
				expect(findParsedEvent(receipt2_, game_, "BidPlaced").args.cstDutchAuctionBeginningBidPrice)
					.equal(getV3NewCstDutchAuctionBeginningBidPrice(cstBidPriceBase2_, multiplier_, divisor_));
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("bidCstRewardAmountMinLimit_ compares against the whole reward; on the first bid it's ignored", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
			const bidder1_ = contracts_.signers[1];
			const bidder2_ = contracts_.signers[2];

			// On the first bid in a round, there is no reward, and the min limit is ignored.
			await getPriceAndBidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n, (1n << 200n));
			const lastBidTimeStamp_ = await getLatestBlockTimestamp();

			// A min limit above the whole reward reverts, even though the bidder would personally receive nothing anyway.
			{
				const bidTimeStamp_ = lastBidTimeStamp_ + 60n;
				const totalRewardAmount_ = getV3BidCstRewardAmount(60n, DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, mainPrizeTimeIncrementInMicroSeconds_);
				expect(totalRewardAmount_).greaterThan(0n);
				const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(bidTimeStamp_ - lastBidTimeStamp_);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);

				// Note: this reverted transaction still gets mined, in a block with the pinned timestamp.
				await expect(
					game_.connect(bidder2_).bidWithEth(-1n, "", totalRewardAmount_ + 1n, {value: ethBidPrice_,})
				).revertedWithCustomError(game_, "BidCstRewardAmountMinLimitNotReached").withArgs(totalRewardAmount_, totalRewardAmount_ + 1n);
			}

			// A min limit equal the whole reward succeeds, even though the reward goes to the outbid bidder.
			{
				const bidTimeStamp_ = lastBidTimeStamp_ + 120n;
				const totalRewardAmount_ = getV3BidCstRewardAmount(120n, DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, mainPrizeTimeIncrementInMicroSeconds_);
				const { receipt_ } = await getPriceAndBidWithEthAt(game_, bidder2_, bidTimeStamp_, totalRewardAmount_);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("bidCstRewardAmountMultiplier controls the reward getter and minting", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;
			const bidder1_ = contracts_.signers[1];
			const bidder2_ = contracts_.signers[2];
			const newMultiplier_ = 5n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;

			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(newMultiplier_));

			// The new multiplier drives both the getter and the actual minting.
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
			await getPriceAndBidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
			expect(await game_.getBidCstRewardAmountAdvanced(60n))
				.equal(getV3BidCstRewardAmount(60n, newMultiplier_, mainPrizeTimeIncrementInMicroSeconds_));
			{
				const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
				await getPriceAndBidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 120n);
				const totalRewardAmount_ = getV3BidCstRewardAmount(120n, newMultiplier_, mainPrizeTimeIncrementInMicroSeconds_);
				expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_).equal(totalRewardAmount_);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("the amount a CST bid burns equals the beginning bid price minus all bid CST rewards minted since the auction began, up to rounding", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;
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
			const [bidder1_, bidder2_, bidder3_] = contracts_.signers.slice(1, 4);

			/** The total of the bid CST rewards minted by the bids with the given receipts. */
			const sumMintedRewards_ = (receipts_) =>
				receipts_.reduce((sum_, receipt_) => sum_ + findParsedEvent(receipt_, game_, "BidPlaced").args.bidCstRewardAmount, 0n);

			/**
			Places a CST bid `delay_` seconds after the latest block and checks the conservation invariant of Comment-202611023
			against the bids placed since the current auction began, whose receipts are given: the CST burned plus
			all the rewards minted since the auction began equals the beginning bid price, except that each reward rounds down
			separately, and that a bid placed after the base reached zero burns no base while the rewards keep accruing.
			The late-bid premium, if any, is a toll on top of the base, which is burned too but is not part of the invariant.
			*/
			const bidWithCstAndCheckConservation_ = async (bidder_, delay_, receiptsSinceBeginning_) => {
				const beginningPrice_ = await readV3CstDutchAuctionBeginningBidPrice(game_, params_);
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + delay_;
				const expectedBase_ =
					getV3CstBidPriceBase(beginningPrice_, bidTimeStamp_ - (await game_.cstDutchAuctionBeginningTimeStamp()), multiplier_, increment_);
				const expectedPremiumAmount_ =
					getRoundLateBidPricePremiumAmount(
						maxBigInt(expectedBase_, rewardPerIncrement_),
						(await game_.mainPrizeTime()) - bidTimeStamp_,
						params_.roundLateBidDuration,
						increment_,
						params_.roundLateBidPricePremiumAmountBaseMultiplier,
						params_.roundLateBidPricePremiumAmountExponent
					);
				expect(await game_.getNextCstBidPriceBaseAdvanced(delay_)).equal(expectedBase_);
				expect(await game_.getNextCstBidPriceAdvanced(delay_)).equal(expectedBase_ + expectedPremiumAmount_);
				const totalSupplyBefore_ = await token_.totalSupply();
				const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, bidder_, bidTimeStamp_);
				expect(cstBidPrice_).equal(expectedBase_ + expectedPremiumAmount_);

				// The reward is minted and the price burned in the same transaction, so the burned amount is derived from both.
				const rewardAmount_ = findParsedEvent(receipt_, game_, "BidPlaced").args.bidCstRewardAmount;
				const burnedAmount_ = rewardAmount_ - ((await token_.totalSupply()) - totalSupplyBefore_);
				expect(burnedAmount_).equal(cstBidPrice_);
				const burnTransfers_ = findParsedEvents(receipt_, token_, "Transfer").filter((transfer_) => transfer_.args.to === hre.ethers.ZeroAddress);
				expect(burnTransfers_.reduce((sum_, transfer_) => sum_ + transfer_.args.value, 0n)).equal(cstBidPrice_);

				const burnedBase_ = burnedAmount_ - expectedPremiumAmount_;
				const mintedSinceBeginning_ = sumMintedRewards_([...receiptsSinceBeginning_, receipt_]);
				const numMintsSinceBeginning_ = BigInt(receiptsSinceBeginning_.length + 1);
				if (burnedBase_ > 0n) {
					expect(burnedBase_ + mintedSinceBeginning_, "conservation").at.most(beginningPrice_);
				}
				expect(burnedBase_ + mintedSinceBeginning_ + numMintsSinceBeginning_ - 1n, "conservation").at.least(beginningPrice_);
				return { receipt_, cstBidPriceBase_: burnedBase_, };
			};

			// The first auction begins at C with the round's first bid. bidder1 and bidder2 hold for half and a quarter
			// of the initial duration, earning about C/2 and C/4; then bidder1 buys the remaining quarter of C,
			// minus the half increment bidder3 earns, premium-free because every bid pushed `mainPrizeTime`.
			await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
			const receiptsSinceBeginning1_ = [];
			receiptsSinceBeginning1_.push(await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + initialDurationUntilMainPrize_ / 2n));
			receiptsSinceBeginning1_.push(await bidWithEthAt(game_, bidder3_, (await getLatestBlockTimestamp()) + initialDurationUntilMainPrize_ / 4n));
			expect(await token_.balanceOf(bidder1_.address)).at.least(maxLimit_ * 45n / 100n);
			expect((await game_.mainPrizeTime()) - (await getLatestBlockTimestamp())).greaterThan(params_.roundLateBidDuration + mainPrizeTimeIncrement_);
			const { cstBidPriceBase_: cstBidPriceBase1_ } =
				await bidWithCstAndCheckConservation_(bidder1_, mainPrizeTimeIncrement_ / 2n, receiptsSinceBeginning1_);
			expect(cstBidPriceBase1_).greaterThan(4n * rewardPerIncrement_);
			expect(cstBidPriceBase1_).lessThan(maxLimit_ / 4n);

			// The second auction begins at twice the base paid plus one increment, about 13R, and lasts as many increments.
			// bidder3 holds for two increments, then bidder1 pays the base after four more, premium-free as well.
			const beginningPrice2_ = await game_.cstDutchAuctionBeginningBidPrice();
			expect(beginningPrice2_).equal(getV3NewCstDutchAuctionBeginningBidPrice(cstBidPriceBase1_, multiplier_, divisor_));
			const receiptsSinceBeginning2_ = [];
			receiptsSinceBeginning2_.push(await bidWithEthAt(game_, bidder3_, (await getLatestBlockTimestamp()) + 2n * mainPrizeTimeIncrement_));
			expect((await game_.mainPrizeTime()) - (await getLatestBlockTimestamp())).greaterThan(params_.roundLateBidDuration + 4n * mainPrizeTimeIncrement_);
			const { cstBidPriceBase_: cstBidPriceBase2_ } =
				await bidWithCstAndCheckConservation_(bidder1_, 4n * mainPrizeTimeIncrement_, receiptsSinceBeginning2_);
			expect(cstBidPriceBase2_).greaterThan(6n * rewardPerIncrement_);
			expect(cstBidPriceBase2_).lessThan(8n * rewardPerIncrement_);

			// The third auction is left to end. By then `mainPrizeTime` has passed, so the CST bid at a zero base pays
			// the maximum premium calculated from R, which is burned, while the rewards minted meanwhile exceed
			// the beginning bid price.
			{
				const duration3_ = (await game_.getCstDutchAuctionDurations())[0];
				expect(await token_.balanceOf(bidder2_.address)).at.least(5n * rewardPerIncrement_);
				const { receipt_, cstBidPriceBase_: cstBidPriceBase3_ } =
					await bidWithCstAndCheckConservation_(bidder2_, duration3_ + 1_000n, []);
				expect(cstBidPriceBase3_).equal(0n);
				const paidCstPrice_ = findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice;
				expect(paidCstPrice_).greaterThan(4n * rewardPerIncrement_ * 99n / 100n);
				expect(paidCstPrice_).lessThan(4n * rewardPerIncrement_ * 101n / 100n);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("holding the deadline with one CST bid per main prize time increment starts free and then escalates along the restart recursion, with the free bid weighing nothing in the raffle", async function () {
		let fundingRoundDone_ = false;
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;
			const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);
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
				roundLateBidDuration: roundLateBidDuration_,
			} = params_;

			// The first V3 round only funds the bidders: each earns about 5C by holding for five initial durations,
			// which the chains in the following rounds spend.
			if ( ! fundingRoundDone_ ) {
				await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
				await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 5n * initialDurationUntilMainPrize_);
				await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 5n * initialDurationUntilMainPrize_);
				expect(await token_.balanceOf(bidder1_.address)).at.least(4n * maxLimit_);
				expect(await token_.balanceOf(bidder2_.address)).at.least(4n * maxLimit_);
				fundingRoundDone_ = true;
				await finishGameRound(contracts_, game_);
				return;
			}
			const roundNum_ = await game_.roundNum();

			// The round's first bid starts the first auction at C, which declines to zero over about the initial duration.
			// An immediate second ETH bid pushes `mainPrizeTime` by one increment, so that the auction ends before
			// the premium window opens. An ETH bid's raffle weight is its ETH bid price base (Comment-202609098).
			{
				const ethBidPriceBase_ = await game_.getNextEthBidPriceAdvanced(10n);
				await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
			}
			{
				const ethBidPriceBase_ = await game_.nextEthBidPrice();
				await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 1n);
				expect(await getLastBidRaffleWeight(game_, roundNum_)).equal(ethBidPriceBase_);
			}
			const ethBidPriceBase_ = await game_.nextEthBidPrice();
			const firstAuctionBeginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const firstAuctionEndTimeStamp_ = firstAuctionBeginningTimeStamp_ + (await game_.getCstDutchAuctionDurations())[0];
			expect(firstAuctionEndTimeStamp_ + roundLateBidDuration_).at.most(await game_.mainPrizeTime());

			// The JS mirror of the chain: the first CST bid exactly when the first auction ends, then one per increment.
			// Each bid pushes `mainPrizeTime` by the same increment, so the bids hold the deadline where it is,
			// and the bases follow `nextBase = 2 * base + R`: 0, R, 3R, 7R, 15R, up to rounding.
			const numChainBids_ = 5;
			const expectedBases_ = [];
			{
				let beginningPrice_ = maxLimit_;
				let beginningTimeStamp_ = firstAuctionBeginningTimeStamp_;
				let bidTimeStamp_ = firstAuctionEndTimeStamp_;
				for (let bidIndex_ = 0; bidIndex_ < numChainBids_; ++ bidIndex_) {
					const base_ = getV3CstBidPriceBase(beginningPrice_, bidTimeStamp_ - beginningTimeStamp_, multiplier_, increment_);
					expectedBases_.push(base_);
					beginningPrice_ = getV3NewCstDutchAuctionBeginningBidPrice(base_, multiplier_, divisor_);
					beginningTimeStamp_ = bidTimeStamp_;
					bidTimeStamp_ += mainPrizeTimeIncrement_;
				}
			}
			expect(expectedBases_[0]).equal(0n);
			for (let bidIndex_ = 1; bidIndex_ < numChainBids_; ++ bidIndex_) {
				const expectedApproximateBase_ = ((1n << BigInt(bidIndex_)) - 1n) * rewardPerIncrement_;
				expect(expectedBases_[bidIndex_], `chain bid ${bidIndex_}`).greaterThan(expectedBases_[bidIndex_ - 1]);
				expect(expectedBases_[bidIndex_], `chain bid ${bidIndex_}`).at.least(expectedApproximateBase_ * 99n / 100n);
				expect(expectedBases_[bidIndex_], `chain bid ${bidIndex_}`).at.most(expectedApproximateBase_ * 101n / 100n);
			}
			const expectedTotalPaid_ = expectedBases_.reduce((sum_, base_) => sum_ + base_, 0n);
			expect(expectedTotalPaid_).at.least(26n * rewardPerIncrement_ * 99n / 100n);
			expect(expectedTotalPaid_).at.most(26n * rewardPerIncrement_ * 101n / 100n);

			// Execute the chain, alternating the bidders, and check every bid against the mirror.
			// The raffle weight of a CST bid is the ETH bid price base scaled by the fraction of the asking price paid
			// (Comment-202611027), so the free bid weighs nothing.
			let totalPaid_ = 0n;
			let bidTimeStamp_ = firstAuctionEndTimeStamp_;
			for (let bidIndex_ = 0; bidIndex_ < numChainBids_; ++ bidIndex_) {
				const description_ = `chain bid ${bidIndex_}`;
				const bidder_ = (bidIndex_ % 2 === 0) ? bidder1_ : bidder2_;
				const beginningPrice_ = await readV3CstDutchAuctionBeginningBidPrice(game_, params_);
				const currentTimeOffset_ = bidTimeStamp_ - (await getLatestBlockTimestamp());
				expect((await game_.mainPrizeTime()) - bidTimeStamp_, description_).at.least(roundLateBidDuration_);
				expect(await game_.getNextCstBidPriceBaseAdvanced(currentTimeOffset_), description_).equal(expectedBases_[bidIndex_]);
				expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_), description_).equal(expectedBases_[bidIndex_]);
				const { receipt_, cstBidPrice_ } = await getPriceAndBidWithCstAt(game_, bidder_, bidTimeStamp_);
				expect(cstBidPrice_, description_).equal(expectedBases_[bidIndex_]);
				totalPaid_ += cstBidPrice_;
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice, description_).equal(expectedBases_[bidIndex_]);
				expect(bidPlaced_.args.cstDutchAuctionBeginningBidPrice, description_)
					.equal(getV3NewCstDutchAuctionBeginningBidPrice(expectedBases_[bidIndex_], multiplier_, divisor_));
				const expectedBidRaffleWeight_ = getV3CstBidRaffleWeight(ethBidPriceBase_, expectedBases_[bidIndex_], beginningPrice_);
				if (bidIndex_ === 0) {
					expect(expectedBidRaffleWeight_).equal(0n);
				} else {
					expect(expectedBidRaffleWeight_, description_).greaterThan(0n);
					expect(expectedBidRaffleWeight_, description_).lessThan(ethBidPriceBase_);
				}
				expect(await getLastBidRaffleWeight(game_, roundNum_), description_).equal(expectedBidRaffleWeight_);
				bidTimeStamp_ += mainPrizeTimeIncrement_;
			}
			expect(totalPaid_).equal(expectedTotalPaid_);
			expect((await game_.roundStats(roundNum_)).totalSpentCstAmount).equal(expectedTotalPaid_);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	// Proves that the attack discussed in Comment-202607163 is impossible: a bidder contract that cannot
	// (or refuses to) receive anything cannot block the bid CST reward minting to the last bidder,
	// and therefore cannot prevent other people from bidding, nor prevent the bidding round from completing.
	// `CosmicSignatureToken` performs no call into the token recipient, neither on a minting nor on a transfer.
	it("a bidder contract that rejects all incoming calls cannot block subsequent ETH or CST bids", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const { hostileBidder_, rewardAt_ } = await configureRewardAndDeployHostileBidder(contracts_, game_);
			const token_ = contracts_.cosmicSignatureToken;
			const hostileBidderAddress_ = await hostileBidder_.getAddress();
			const deployerOfHostileContract_ = contracts_.signers[10];
			const eoaBidder1_ = contracts_.signers[1];
			const eoaBidder2_ = contracts_.signers[2];

			// The first bid in the round is placed by a normal EOA.
			await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 10n);

			// Try every hostility flavor: revert with a reason, panic, burn all gas.
			for (const hostilityModeCode_ of [1n, 2n, 3n,]) {
				await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(hostilityModeCode_));

				// While already hostile, the contract places a bid (paying the exact price, so no ETH refund is attempted),
				// which makes it the last bidder, whom the next bidder's whole CST reward must be paid to.
				let lastBidTimeStamp_ = (await getLatestBlockTimestamp()) + 30n;
				await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, lastBidTimeStamp_);
				expect(await game_.lastBidderAddress()).equal(hostileBidderAddress_);

				// Sanity check: the hostile contract really is hostile - a plain ETH transfer to it fails.
				await expect(
					eoaBidder1_.sendTransaction({to: hostileBidderAddress_, value: 1n, gasLimit: 1_000_000n,})
				).reverted;

				// An EOA outbids the hostile contract with an ETH bid. If the reward were transferred or pushed
				// with a recipient callback, this would revert; it must succeed, minting the whole reward
				// to the hostile contract.
				{
					const hostileCstBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
					const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 60n;
					const receipt_ = await bidWithEthAt(game_, eoaBidder2_, bidTimeStamp_);
					const totalRewardAmount_ = await rewardAt_(bidTimeStamp_ - lastBidTimeStamp_);
					expect(totalRewardAmount_).greaterThan(0n);
					const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
					expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
					expect(
						await token_.balanceOf(hostileBidderAddress_) - hostileCstBalanceBefore_,
						"the hostile contract must have been paid its whole reward"
					).equal(totalRewardAmount_);
				}

				// The hostile contract becomes the last bidder again, and an EOA outbids it with a CST bid this time.
				{
					lastBidTimeStamp_ = (await getLatestBlockTimestamp()) + 30n;
					await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, lastBidTimeStamp_);
					const hostileCstBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
					const { timeStamp: bidTimeStamp_, price: cstBidPrice_ } = await findTimeStampWithAffordableCstBidPrice(
						game_,
						await token_.balanceOf(eoaBidder2_.address),
						(await getLatestBlockTimestamp()) + 90n
					);
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
					const receipt_ = await waitForTransactionReceipt(game_.connect(eoaBidder2_).bidWithCst(cstBidPrice_, "", 0n));
					expect(await blockTimestampOfReceipt(receipt_)).equal(bidTimeStamp_);
					const totalRewardAmount_ = await rewardAt_(bidTimeStamp_ - lastBidTimeStamp_);
					expect(totalRewardAmount_).greaterThan(0n);
					expect(await token_.balanceOf(hostileBidderAddress_) - hostileCstBalanceBefore_).equal(totalRewardAmount_);
				}
			}

			// While hostile, the contract can even place a CST bid itself (its own CST gets burned and the reward
			// minted to the bidder it outbids; no ETH or callback touches it).
			{
				const lastBidTimeStamp_ = (await getLatestBlockTimestamp()) + 30n;
				await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, lastBidTimeStamp_);
				const hostileCstBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
				const { timeStamp: bidTimeStamp_, price: cstBidPrice_ } = await findTimeStampWithAffordableCstBidPrice(
					game_,
					hostileCstBalanceBefore_,
					(await getLatestBlockTimestamp()) + 60n
				);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
				const receipt_ = await waitForTransactionReceipt(
					hostileBidder_.connect(deployerOfHostileContract_).doBidWithCst((1n << 255n), "hostile CST bid", 0n)
				);
				expect(await blockTimestampOfReceipt(receipt_)).equal(bidTimeStamp_);

				// The hostile contract outbids itself: it receives its own whole reward, minus the burned price.
				const totalRewardAmount_ = await rewardAt_(bidTimeStamp_ - lastBidTimeStamp_);
				expect(await token_.balanceOf(hostileBidderAddress_) - hostileCstBalanceBefore_).equal(totalRewardAmount_ - cstBidPrice_);
			}

			// And a normal EOA can still bid afterwards.
			await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 45n);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("randomized campaign: exact CST accounting across many random bids and reward multipliers", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;

			// A tiny xorshift PRNG. The seed is logged so that a failure can be investigated.
			let randomState_ = generateRandomUInt256() & ((1n << 64n) - 1n);
			if (randomState_ === 0n) {
				// Issue. This logic kinda smells. I would instead keep generating random numbers until a nonzero is generated.
				randomState_ = 0x9e3779b97f4a7c15n;
			}
			// console.info("%s", `Random seed: 0x${randomState_.toString(16)}`);
			const nextRandom_ = () => {
				randomState_ ^= (randomState_ << 13n) & ((1n << 64n) - 1n);
				randomState_ ^= randomState_ >> 7n;
				randomState_ ^= (randomState_ << 17n) & ((1n << 64n) - 1n);
				return randomState_;
			};

			/**
			@param {bigint} minValue_
			@param {bigint} maxValue_
			*/
			const nextRandomRange_ = (minValue_, maxValue_) => minValue_ + nextRandom_() % (maxValue_ - minValue_ + 1n);

			// A random reward multiplier: either a multiple of the default (~1 to ~100 CST per minute),
			// or a completely arbitrary value.
			const bidCstRewardAmountMultiplier_ =
				(nextRandom_() % 2n === 0n) ?
				nextRandomRange_(1n, 100n) * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER :
				nextRandomRange_(1n, 10n ** 27n);
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(bidCstRewardAmountMultiplier_));
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();

			const actorSigners_ = contracts_.signers.slice(1, 6);
			const expectedCstBalances_ = new Map();
			for (const actorSigner_ of actorSigners_) {
				expectedCstBalances_.set(actorSigner_.address, await token_.balanceOf(actorSigner_.address));
			}
			const expectedTotalSupplyBefore_ = await token_.totalSupply();
			let expectedTotalSupplyChange_ = 0n;

			let lastBidderAddress_ = null;
			let lastBidTimeStamp_ = 0n;
			const numBids_ = 60;
			for (let bidIndex_ = 0; bidIndex_ < numBids_; ++ bidIndex_) {
				const actorSigner_ = actorSigners_[Number(nextRandomRange_(0n, BigInt(actorSigners_.length - 1)))];
				const gapDuration_ = nextRandomRange_(1n, 5_400n);
				const latestTimeStamp_ = await getLatestBlockTimestamp();
				const bidTimeStamp_ = (latestTimeStamp_ > lastBidTimeStamp_ ? latestTimeStamp_ : lastBidTimeStamp_) + gapDuration_;
				const totalRewardAmount_ =
					(lastBidderAddress_ === null) ?
					0n :
					getV3BidCstRewardAmount(bidTimeStamp_ - lastBidTimeStamp_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_);

				// A CST bid is possible if this is not the first bid of the round and the actor can afford the price.
				let receipt_ = null;
				let paidCstPrice_ = 0n;
				if (lastBidderAddress_ !== null && nextRandom_() % 3n === 0n) {
					const cstBidPrice_ = await game_.getNextCstBidPriceAdvanced(bidTimeStamp_ - latestTimeStamp_);
					if (expectedCstBalances_.get(actorSigner_.address) >= cstBidPrice_) {
						await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
						receipt_ = await waitForTransactionReceipt(game_.connect(actorSigner_).bidWithCst(cstBidPrice_, "", 0n));
						paidCstPrice_ = cstBidPrice_;
					}
				}
				if (receipt_ === null) {
					const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(bidTimeStamp_ - latestTimeStamp_);
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
					receipt_ = await waitForTransactionReceipt(game_.connect(actorSigner_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_,}));
				}
				expect(await blockTimestampOfReceipt(receipt_)).equal(bidTimeStamp_);

				// Apply the model: the whole reward goes to the bidder being outbid; nothing on the first bid.
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.bidCstRewardAmount, `bid ${bidIndex_} total reward`).equal(totalRewardAmount_);
				if (lastBidderAddress_ !== null) {
					expectedCstBalances_.set(lastBidderAddress_, expectedCstBalances_.get(lastBidderAddress_) + totalRewardAmount_);
					expectedTotalSupplyChange_ += totalRewardAmount_;
				}
				expectedCstBalances_.set(actorSigner_.address, expectedCstBalances_.get(actorSigner_.address) - paidCstPrice_);
				expectedTotalSupplyChange_ -= paidCstPrice_;
				lastBidderAddress_ = actorSigner_.address;
				lastBidTimeStamp_ = bidTimeStamp_;
			}

			// The chain state must exactly match the model.
			for (const actorSigner_ of actorSigners_) {
				expect(await token_.balanceOf(actorSigner_.address), `final CST balance of ${actorSigner_.address}`)
					.equal(expectedCstBalances_.get(actorSigner_.address));
			}
			expect(await token_.totalSupply() - expectedTotalSupplyBefore_, "final CST total supply").equal(expectedTotalSupplyChange_);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});
});
