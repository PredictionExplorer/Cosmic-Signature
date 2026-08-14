"use strict";

// Tests `BiddingV3`'s linear bid CST reward:
// the reward accrues at `bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` CST Wei
// per second since the last bid, and when someone places a bid, the WHOLE reward is minted to the bidder
// being outbid (`lastBidderAddress`). Nothing is minted on the first bid in a bidding round,
// and no more than 1 bid per second is permitted (`BidPlacedWithinCurrentSecond`).

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
	activateCurrentRound,
	findParsedEvent,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	assertDefaultV3Initialization,
	getV3BidCstRewardAmount,
	findTimeStampWithAffordableCstBidPrice,
} = require("../src/V3UpgradeTestHelpers.js");

// #region Local helpers.

/** Collects all the parsed events with the given name that the given contract emitted in the given receipt. */
function findParsedEvents(receipt_, contract_, eventName_) {
	const parsedEvents_ = [];
	for (const log_ of receipt_.logs) {
		try {
			const parsed_ = contract_.interface.parseLog(log_);
			if (parsed_?.name === eventName_) {
				parsedEvents_.push(parsed_);
			}
		} catch {
			// Ignore logs belonging to other contracts.
		}
	}
	return parsedEvents_;
}

/** Executes an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function bidWithEthAt(game_, bidderSigner_, timeStamp_, bidCstRewardAmountMinLimit_ = 0n) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", bidCstRewardAmountMinLimit_, {value: ethBidPrice_,})
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

// #endregion

describe("CosmicSignatureGameV3-BidCstReward", function () {
	it("reinitialize sets bidCstRewardAmountMultiplier so the reward accrues at ~1 CST per minute", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await assertDefaultV3Initialization(game_);
		expect(await game_.bidCstRewardAmountMultiplier()).equal(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);
		expect(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER).equal(6n * 10n ** 25n);

		// The reward rate divides the multiplier by `mainPrizeTimeIncrementInMicroSeconds`, which has grown 1%
		// on the round 0 main prize claim, so in round 1 a minute-long wait yields slightly less than 1 CST.
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await bidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 10n);
		const rewardPerMinute_ = await game_.getBidCstRewardAmountAdvanced(60n);
		expect(rewardPerMinute_).equal(60n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER / mainPrizeTimeIncrementInMicroSeconds_);
		expect(rewardPerMinute_).greaterThan(10n ** 18n * 98n / 100n);
		expect(rewardPerMinute_).lessThanOrEqual(10n ** 18n);
	});

	it("the reward getter returns 0 before the first bid and mirrors the linear formula after it", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();

		// Comment-202608176: with no bids in the current bidding round there is nobody to reward,
		// so the getter returns zero at any time offset.
		for (const currentTimeOffset_ of [0n, 1n, 60n, 3_600n, 7n * 24n * 60n * 60n,]) {
			expect(
				await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_),
				`before the first bid, at offset ${currentTimeOffset_}`
			).equal(0n);
		}
		expect(await game_.getBidCstRewardAmount()).equal(0n);

		// Place the first bid at a known timestamp.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, contracts_.signers[1], firstBidTimeStamp_);

		// After a bid, the reward accrues since that bid.
		{
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			expect(latestTimeStamp_).equal(firstBidTimeStamp_);
			for (const currentTimeOffset_ of [-11n, -1n, 0n, 1n, 59n, 60n, 61n, 89n, 90n, 3_600n, 100n * 60n * 60n,]) {
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
	});

	it("nothing is minted on the first bid; the whole reward is minted to the outbid bidder afterwards", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		// #region The first bid in the round mints nothing at all.

		const roundActivationTime_ = await game_.roundActivationTime();
		const firstBidTimeStamp_ = roundActivationTime_ + 100n;
		{
			const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
			const totalSupplyBefore_ = await token_.totalSupply();
			const { receipt_ } = await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);

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
			const { receipt_ } = await bidWithEthAt(game_, bidder2_, secondBidTimeStamp_);
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
			await bidWithEthAt(game_, bidder2_, thirdBidTimeStamp_);
			const totalRewardAmount_ = getV3BidCstRewardAmount(200n, DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, mainPrizeTimeIncrementInMicroSeconds_);
			expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal(totalRewardAmount_);
		}

		// #endregion
	});

	it("a CST bid burns the price and mints the whole reward to the outbid bidder in a single transaction", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;

		// A high reward rate, so that the bidders can quickly afford CST bids: ~60 CST per minute.
		const bidCstRewardAmountMultiplier_ = 60n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(bidCstRewardAmountMultiplier_));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		const rewardAt_ = (elapsedDuration_) =>
			getV3BidCstRewardAmount(elapsedDuration_, bidCstRewardAmountMultiplier_, mainPrizeTimeIncrementInMicroSeconds_);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		// Accumulate CST for bidder2: it places the 2nd bid and gets outbid 400 seconds later,
		// which mints it ~400 CST.
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 30n);
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 400n);

		const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
		const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);
		const totalSupplyBefore_ = await token_.totalSupply();
		const lastBidTimeStamp_ = await getLatestBlockTimestamp();
		const cstBidTimeStamp_ = lastBidTimeStamp_ + 300n;

		// Make sure bidder2 can afford the CST bid price.
		expect(await game_.getNextCstBidPriceAdvanced(cstBidTimeStamp_ - lastBidTimeStamp_)).lessThanOrEqual(bidder2CstBalanceBefore_);

		const { receipt_, cstBidPrice_ } = await bidWithCstAt(game_, bidder2_, cstBidTimeStamp_);
		expect(cstBidPrice_).greaterThan(0n);

		const totalRewardAmount_ = rewardAt_(300n);

		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.paidCstPrice).equal(cstBidPrice_);
		expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);

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

		// A CST bid by the same bidder again nets `totalReward - paidPrice` to that bidder.
		{
			const bidder2CstBalanceBefore2_ = await token_.balanceOf(bidder2_.address);
			const { timeStamp: cstBidTimeStamp2_ } =
				await findTimeStampWithAffordableCstBidPrice(game_, bidder2CstBalanceBefore2_, cstBidTimeStamp_ + 123n);
			const { cstBidPrice_: cstBidPrice2_ } = await bidWithCstAt(game_, bidder2_, cstBidTimeStamp2_);
			const totalRewardAmount2_ = rewardAt_(cstBidTimeStamp2_ - cstBidTimeStamp_);
			expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore2_).equal(totalRewardAmount2_ - cstBidPrice2_);
		}
	});

	it("no more than 1 bid within a second: the second same-second bid reverts", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);
		const bidder2EthBalanceBefore_ = await hre.ethers.provider.getBalance(bidder2_.address);

		const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(100n);
		try {
			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			const transactionResponse1_ = await game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_ * 2n, gasLimit: 2_000_000n,});
			const transactionResponse2_ = await game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_ * 3n, gasLimit: 2_000_000n,});
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
			await hre.ethers.provider.send("evm_mine");
			const receipt1_ = await transactionResponse1_.wait();
			const receipt2_ = await hre.ethers.provider.getTransactionReceipt(transactionResponse2_.hash);
			expect(receipt1_.blockNumber).equal(receipt2_.blockNumber);
			expect(receipt1_.status).equal(1);

			// The second bid landed within the same second as the first one, so it reverted,
			// losing only the transaction fee.
			expect(receipt2_.status).equal(0);
			await expect(
				game_.connect(bidder2_).bidWithEth.staticCall(-1n, "", 0n, {value: ethBidPrice_ * 3n, blockTag: receipt2_.blockNumber,})
			).revertedWithCustomError(game_, "BidPlacedWithinCurrentSecond");
			expect(await token_.balanceOf(bidder2_.address)).equal(bidder2CstBalanceBefore_);
			expect(await hre.ethers.provider.getBalance(bidder2_.address))
				.equal(bidder2EthBalanceBefore_ - receipt2_.gasUsed * receipt2_.gasPrice);
			expect((await game_.lastBidderAddress())).equal(bidder1_.address);
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
		}

		// In the next second, bidding works again.
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 1n);
	});

	it("bidCstRewardAmountMinLimit_ compares against the whole reward; on the first bid it's ignored", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		// On the first bid in a round, there is no reward, and the min limit is ignored.
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n, (1n << 200n));
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
			const { receipt_ } = await bidWithEthAt(game_, bidder2_, bidTimeStamp_, totalRewardAmount_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
		}
	});

	it("setBidCstRewardAmountMultiplier: authorization, round-inactive guard, event, effect", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const newMultiplier_ = 5n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;

		// The round is currently inactive (the V3 upgrade requires that), so the owner can set the parameter.
		await expect(game_.connect(bidder1_).setBidCstRewardAmountMultiplier(newMultiplier_))
			.revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
		await expect(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(newMultiplier_))
			.emit(game_, "BidCstRewardAmountMultiplierChanged").withArgs(newMultiplier_);
		expect(await game_.bidCstRewardAmountMultiplier()).equal(newMultiplier_);

		// The new multiplier drives both the getter and the actual minting.
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		expect(await game_.getBidCstRewardAmountAdvanced(60n))
			.equal(getV3BidCstRewardAmount(60n, newMultiplier_, mainPrizeTimeIncrementInMicroSeconds_));
		{
			const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
			await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 120n);
			const totalRewardAmount_ = getV3BidCstRewardAmount(120n, newMultiplier_, mainPrizeTimeIncrementInMicroSeconds_);
			expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_).equal(totalRewardAmount_);
		}

		// While the round is active, the owner cannot change the parameter.
		await expect(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER))
			.revertedWithCustomError(game_, "RoundIsActive");
	});

	it("a zero multiplier disables rewards without breaking bidding or corrupting the ETH Dutch auction anchor", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
		const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);

		const { ethBidPrice_: firstEthBidPrice_ } = await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);

		// Comment-202605192: the first bid of the round anchors the next round's ETH Dutch auction beginning bid price.
		const ethDutchAuctionBeginningBidPriceAfterFirstBid_ = await game_.ethDutchAuctionBeginningBidPrice();
		expect(ethDutchAuctionBeginningBidPriceAfterFirstBid_).equal(firstEthBidPrice_ * 2n);

		// A further bid with a zero reward mints nothing, but must NOT be treated as a first bid.
		// Comment-202608166: before that hardening, it would overwrite `ethDutchAuctionBeginningBidPrice`.
		const { receipt_ } = await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 3_600n);
		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.bidCstRewardAmount).equal(0n);
		expect(findParsedEvents(receipt_, token_, "Transfer").length).equal(0);
		expect(await token_.balanceOf(bidder1_.address)).equal(bidder1CstBalanceBefore_);
		expect(await token_.balanceOf(bidder2_.address)).equal(bidder2CstBalanceBefore_);
		expect(await game_.ethDutchAuctionBeginningBidPrice(), "the ETH Dutch auction anchor must not be overwritten")
			.equal(ethDutchAuctionBeginningBidPriceAfterFirstBid_);

		// A CST bid with a zero reward works too: it burns the price and mints a zero amount to the outbid bidder.
		{
			const { timeStamp: cstBidTimeStamp_ } = await findTimeStampWithAffordableCstBidPrice(
				game_,
				await token_.balanceOf(bidder2_.address),
				(await getLatestBlockTimestamp()) + 60n
			);
			await bidWithCstAt(game_, bidder2_, cstBidTimeStamp_);
			expect((await game_.lastBidderAddress())).equal(bidder2_.address);
		}
	});

	it("randomized campaign: exact CST accounting across many random bids and reward multipliers", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;

		// A tiny xorshift PRNG. The seed is logged so that a failure can be investigated.
		let randomState_ = generateRandomUInt256() & ((1n << 64n) - 1n);
		if (randomState_ === 0n) {
			randomState_ = 0x9e3779b97f4a7c15n;
		}
		console.info("%s", `Random seed: 0x${randomState_.toString(16)}`);
		const nextRandom_ = () => {
			randomState_ ^= (randomState_ << 13n) & ((1n << 64n) - 1n);
			randomState_ ^= randomState_ >> 7n;
			randomState_ ^= (randomState_ << 17n) & ((1n << 64n) - 1n);
			return randomState_;
		};
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
	});
});
