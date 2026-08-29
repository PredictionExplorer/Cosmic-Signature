"use strict";

// Tests `BiddingV3`'s linear bid CST reward and its 90/10 split (Comment-202607161):
// the reward accrues at `bidCstRewardAmountPerMinute` (default 1 CST per minute) since the last bid,
// and when someone places a bid, 90% of it is minted to the bidder being outbid and 10% to the new bidder.

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
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	assertDefaultV3Initialization,
	getV3BidCstRewardAmount,
	splitV3BidCstRewardAmount,
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
	it("reinitialize sets bidCstRewardAmountPerMinute to 1 CST per minute", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await assertDefaultV3Initialization(game_);
		expect(await game_.bidCstRewardAmountPerMinute()).equal(10n ** 18n);
	});

	it("the reward getter mirrors the linear formula at any elapsed duration", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		// Before the first bid in the round, the reward accrues since the round activation.
		{
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			const roundActivationTime_ = await game_.roundActivationTime();
			for (const currentTimeOffset_ of [0n, 1n, 59n, 60n, 61n, 3_600n, 7n * 24n * 60n * 60n,]) {
				const elapsedDuration_ = latestTimeStamp_ + currentTimeOffset_ - roundActivationTime_;
				expect(
					await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_),
					`before the first bid, at offset ${currentTimeOffset_}`
				).equal(getV3BidCstRewardAmount(elapsedDuration_));
			}
		}

		// Place the first bid at a known timestamp.
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, contracts_.signers[1], firstBidTimeStamp_);

		// After a bid, the reward accrues since that bid.
		{
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			expect(latestTimeStamp_).equal(firstBidTimeStamp_);
			for (const currentTimeOffset_ of [-11n, -1n, 0n, 1n, 59n, 60n, 61n, 89n, 90n, 3_600n, 100n * 60n * 60n,]) {
				const expectedRewardAmount_ = getV3BidCstRewardAmount(currentTimeOffset_);
				expect(
					await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_),
					`after the first bid, at offset ${currentTimeOffset_}`
				).equal(expectedRewardAmount_);
			}
			expect(await game_.getBidCstRewardAmount()).equal(0n);

			// Spot-check the linear formula against hardcoded values: 1 CST per minute.
			expect(await game_.getBidCstRewardAmountAdvanced(60n)).equal(10n ** 18n);
			expect(await game_.getBidCstRewardAmountAdvanced(90n)).equal(15n * 10n ** 17n);
			expect(await game_.getBidCstRewardAmountAdvanced(3_600n)).equal(60n * 10n ** 18n);
			expect(await game_.getBidCstRewardAmountAdvanced(1n)).equal(10n ** 18n / 60n);
		}
	});

	it("an ETH bid mints 90% of the reward to the sniped bidder and 10% to the sniper", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		// #region The first bid in the round mints only the new bidder share.

		const roundActivationTime_ = await game_.roundActivationTime();
		const firstBidTimeStamp_ = roundActivationTime_ + 100n;
		{
			const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
			const totalSupplyBefore_ = await token_.totalSupply();
			const { receipt_ } = await bidWithEthAt(game_, bidder1_, firstBidTimeStamp_);
			const totalRewardAmount_ = getV3BidCstRewardAmount(firstBidTimeStamp_ - roundActivationTime_);
			expect(totalRewardAmount_).greaterThan(0n);
			const { lastBidderAmount: lastBidderAmount_, newBidderAmount: newBidderAmount_, } = splitV3BidCstRewardAmount(totalRewardAmount_);
			expect(lastBidderAmount_ + newBidderAmount_).equal(totalRewardAmount_);

			// `BidPlaced` reports the total reward; only the new bidder share got minted.
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
			expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_).equal(newBidderAmount_);
			expect(await token_.totalSupply() - totalSupplyBefore_).equal(newBidderAmount_);

			// Exactly 1 mint happened.
			const transfers_ = findParsedEvents(receipt_, token_, "Transfer");
			expect(transfers_.length).equal(1);
			expect(transfers_[0].args.from).equal(hre.ethers.ZeroAddress);
			expect(transfers_[0].args.to).equal(bidder1_.address);
			expect(transfers_[0].args.value).equal(newBidderAmount_);
		}

		// #endregion
		// #region The second bid splits the reward 90/10.

		{
			const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
			const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);
			const totalSupplyBefore_ = await token_.totalSupply();
			const secondBidTimeStamp_ = firstBidTimeStamp_ + 61n;
			const { receipt_ } = await bidWithEthAt(game_, bidder2_, secondBidTimeStamp_);
			const totalRewardAmount_ = getV3BidCstRewardAmount(61n);
			const { lastBidderAmount: lastBidderAmount_, newBidderAmount: newBidderAmount_, } = splitV3BidCstRewardAmount(totalRewardAmount_);

			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
			expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_, "sniped bidder reward").equal(lastBidderAmount_);
			expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_, "sniper reward").equal(newBidderAmount_);
			expect(await token_.totalSupply() - totalSupplyBefore_).equal(totalRewardAmount_);

			// Exactly 2 mints happened.
			// `CosmicSignatureToken.mintMany` iterates the specs in the reverse order,
			// so the new bidder share `Transfer` is emitted before the sniped bidder one.
			const transfers_ = findParsedEvents(receipt_, token_, "Transfer");
			expect(transfers_.length).equal(2);
			expect(transfers_[0].args.from).equal(hre.ethers.ZeroAddress);
			expect(transfers_[0].args.to).equal(bidder2_.address);
			expect(transfers_[0].args.value).equal(newBidderAmount_);
			expect(transfers_[1].args.from).equal(hre.ethers.ZeroAddress);
			expect(transfers_[1].args.to).equal(bidder1_.address);
			expect(transfers_[1].args.value).equal(lastBidderAmount_);
		}

		// #endregion
		// #region A self-snipe mints both shares to the same bidder.

		{
			const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);
			const thirdBidTimeStamp_ = (await getLatestBlockTimestamp()) + 200n;
			await bidWithEthAt(game_, bidder2_, thirdBidTimeStamp_);
			const totalRewardAmount_ = getV3BidCstRewardAmount(200n);
			expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal(totalRewardAmount_);
		}

		// #endregion
	});

	it("a CST bid burns the price and mints the reward shares in a single transaction", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;

		// A high reward rate, so that the bidders can quickly afford CST bids: 60 CST per minute.
		const ratePerMinute_ = 60n * 10n ** 18n;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountPerMinute(ratePerMinute_));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		// Accumulate CST for bidder2: it places the 2nd bid and gets sniped 400 seconds later,
		// which mints it 90% of 400 CST.
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

		const totalRewardAmount_ = getV3BidCstRewardAmount(300n, ratePerMinute_);
		const { lastBidderAmount: lastBidderAmount_, newBidderAmount: newBidderAmount_, } = splitV3BidCstRewardAmount(totalRewardAmount_);

		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.paidCstPrice).equal(cstBidPrice_);
		expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);

		// bidder1 was the last bidder: it gets 90%; bidder2 pays the price and gets 10%.
		expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_).equal(lastBidderAmount_);
		expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal(newBidderAmount_ - cstBidPrice_);
		expect(await token_.totalSupply() - totalSupplyBefore_).equal(totalRewardAmount_ - cstBidPrice_);

		// Exactly 3 transfers happened. `CosmicSignatureToken.mintAndBurnMany` iterates the specs in the direct order:
		// the price burn, the new bidder share mint, the last bidder share mint.
		const transfers_ = findParsedEvents(receipt_, token_, "Transfer");
		expect(transfers_.length).equal(3);
		expect(transfers_[0].args.from).equal(bidder2_.address);
		expect(transfers_[0].args.to).equal(hre.ethers.ZeroAddress);
		expect(transfers_[0].args.value).equal(cstBidPrice_);
		expect(transfers_[1].args.from).equal(hre.ethers.ZeroAddress);
		expect(transfers_[1].args.to).equal(bidder2_.address);
		expect(transfers_[1].args.value).equal(newBidderAmount_);
		expect(transfers_[2].args.from).equal(hre.ethers.ZeroAddress);
		expect(transfers_[2].args.to).equal(bidder1_.address);
		expect(transfers_[2].args.value).equal(lastBidderAmount_);

		// A CST self-snipe nets `totalReward - paidPrice` to the bidder.
		// The previous CST bid restarted the CST Dutch auction at about twice the paid price,
		// so find a timestamp at which bidder2 can afford another one.
		{
			const bidder2CstBalanceBefore2_ = await token_.balanceOf(bidder2_.address);
			const { timeStamp: cstBidTimeStamp2_ } =
				await findTimeStampWithAffordableCstBidPrice(game_, bidder2CstBalanceBefore2_, cstBidTimeStamp_ + 123n);
			const { cstBidPrice_: cstBidPrice2_ } = await bidWithCstAt(game_, bidder2_, cstBidTimeStamp2_);
			const totalRewardAmount2_ = getV3BidCstRewardAmount(cstBidTimeStamp2_ - cstBidTimeStamp_, ratePerMinute_);
			expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore2_).equal(totalRewardAmount2_ - cstBidPrice2_);
		}
	});

	it("two bids at the same timestamp: the second one gets a zero reward and mints nothing", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
		const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);

		const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(100n);
		try {
			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			const transactionResponse1_ = await game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_ * 2n, gasLimit: 2_000_000n,});
			const transactionResponse2_ = await game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_ * 3n, gasLimit: 2_000_000n,});
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
			await hre.ethers.provider.send("evm_mine");
			const receipt1_ = await transactionResponse1_.wait();
			const receipt2_ = await transactionResponse2_.wait();
			expect(receipt1_.blockNumber).equal(receipt2_.blockNumber);
			expect(receipt1_.status).equal(1);
			expect(receipt2_.status).equal(1);

			// The second bid accrued nothing since the first one.
			const bidPlaced2_ = findParsedEvent(receipt2_, game_, "BidPlaced");
			expect(bidPlaced2_.args.bidCstRewardAmount).equal(0n);
			expect(findParsedEvents(receipt2_, token_, "Transfer").length).equal(0);

			// The first bid in the block did get its share of the accrual since the round activation.
			const bidPlaced1_ = findParsedEvent(receipt1_, game_, "BidPlaced");
			const totalRewardAmount1_ = getV3BidCstRewardAmount(
				(await blockTimestampOfReceipt(receipt1_)) - (await game_.roundActivationTime())
			);
			expect(bidPlaced1_.args.bidCstRewardAmount).equal(totalRewardAmount1_);
			expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_)
				.equal(splitV3BidCstRewardAmount(totalRewardAmount1_).newBidderAmount);
			expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal(0n);
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
		}
	});

	it("bidCstRewardAmountMinLimit_ compares against the total reward, not the bidder share", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		const lastBidTimeStamp_ = await getLatestBlockTimestamp();

		// Pin the next block timestamp; the total reward at it will be exactly 1 CST.
		// A min limit above the total reverts, even though it is above what the bidder would personally receive.
		{
			const bidTimeStamp_ = lastBidTimeStamp_ + 60n;
			const totalRewardAmount_ = getV3BidCstRewardAmount(60n);
			expect(totalRewardAmount_).equal(10n ** 18n);
			const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(bidTimeStamp_ - lastBidTimeStamp_);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);

			// Note: this reverted transaction still gets mined, in a block with the pinned timestamp.
			await expect(
				game_.connect(bidder2_).bidWithEth(-1n, "", totalRewardAmount_ + 1n, {value: ethBidPrice_,})
			).revertedWithCustomError(game_, "BidCstRewardAmountMinLimitNotReached").withArgs(totalRewardAmount_, totalRewardAmount_ + 1n);
		}

		// A min limit equal the total succeeds, even though the bidder personally receives only 10% of it.
		{
			const bidTimeStamp_ = lastBidTimeStamp_ + 120n;
			const totalRewardAmount_ = getV3BidCstRewardAmount(120n);
			expect(totalRewardAmount_).equal(2n * 10n ** 18n);
			const { receipt_ } = await bidWithEthAt(game_, bidder2_, bidTimeStamp_, totalRewardAmount_);
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
		}
	});

	it("setBidCstRewardAmountPerMinute: authorization, round-inactive guard, event, effect", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const newRatePerMinute_ = 5n * 10n ** 18n;

		// The round is currently inactive (the V3 upgrade requires that), so the owner can set the parameter.
		await expect(game_.connect(bidder1_).setBidCstRewardAmountPerMinute(newRatePerMinute_))
			.revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
		await expect(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountPerMinute(newRatePerMinute_))
			.emit(game_, "BidCstRewardAmountPerMinuteChanged").withArgs(newRatePerMinute_);
		expect(await game_.bidCstRewardAmountPerMinute()).equal(newRatePerMinute_);

		// The new rate drives both the getter and the actual minting.
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		expect(await game_.getBidCstRewardAmountAdvanced(60n)).equal(newRatePerMinute_);
		{
			const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
			await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 120n);
			const totalRewardAmount_ = getV3BidCstRewardAmount(120n, newRatePerMinute_);
			expect(totalRewardAmount_).equal(10n * 10n ** 18n);
			expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_)
				.equal(splitV3BidCstRewardAmount(totalRewardAmount_).lastBidderAmount);
		}

		// While the round is active, the owner cannot change the parameter.
		await expect(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountPerMinute(10n ** 18n))
			.revertedWithCustomError(game_, "RoundIsActive");
	});

	it("a zero rate disables rewards without breaking bidding", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountPerMinute(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
		const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);

		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		const { receipt_ } = await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 3_600n);
		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.bidCstRewardAmount).equal(0n);
		expect(findParsedEvents(receipt_, token_, "Transfer").length).equal(0);
		expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_).equal(0n);
		expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal(0n);
	});

	it("rounding: a tiny total reward goes entirely to the new bidder", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];

		// 1 Wei per minute.
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountPerMinute(1n));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1CstBalanceBefore_ = await token_.balanceOf(bidder1_.address);
		const bidder2CstBalanceBefore_ = await token_.balanceOf(bidder2_.address);

		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		const lastBidTimeStamp_ = await getLatestBlockTimestamp();

		// In 60 seconds the total reward is exactly 1 Wei: 90% of it truncates to 0, so the sniped bidder
		// gets a zero-value mint and the sniper gets the entire 1 Wei. Nothing is lost or double-minted.
		const totalSupplyBefore_ = await token_.totalSupply();
		const { receipt_ } = await bidWithEthAt(game_, bidder2_, lastBidTimeStamp_ + 60n);
		const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(bidPlaced_.args.bidCstRewardAmount).equal(1n);
		expect(await token_.balanceOf(bidder1_.address) - bidder1CstBalanceBefore_).equal(0n);
		expect(await token_.balanceOf(bidder2_.address) - bidder2CstBalanceBefore_).equal(1n);
		expect(await token_.totalSupply() - totalSupplyBefore_).equal(1n);

		// Comment-202607161: the sniped bidder share `Transfer` (a zero-value mint) is emitted after
		// the new bidder one, because `mintMany` iterates the specs in the reverse order.
		const transfers_ = findParsedEvents(receipt_, token_, "Transfer");
		expect(transfers_.length).equal(2);
		expect(transfers_[0].args.to).equal(bidder2_.address);
		expect(transfers_[0].args.value).equal(1n);
		expect(transfers_[1].args.to).equal(bidder1_.address);
		expect(transfers_[1].args.value).equal(0n);
	});

	it("randomized campaign: exact CST accounting across many random bids and rates", async function () {
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

		// A random reward rate: either a whole number of CST, or a completely arbitrary Wei amount, per minute.
		const ratePerMinute_ = (nextRandom_() % 2n === 0n) ? nextRandomRange_(1n, 100n) * 10n ** 18n : nextRandomRange_(1n, 10n ** 20n);
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountPerMinute(ratePerMinute_));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const actorSigners_ = contracts_.signers.slice(1, 6);
		const expectedCstBalances_ = new Map();
		for (const actorSigner_ of actorSigners_) {
			expectedCstBalances_.set(actorSigner_.address, await token_.balanceOf(actorSigner_.address));
		}
		const expectedTotalSupplyBefore_ = await token_.totalSupply();
		let expectedTotalSupplyChange_ = 0n;

		let lastBidderAddress_ = null;
		let lastBidTimeStamp_ = await game_.roundActivationTime();
		const numBids_ = 60;
		for (let bidIndex_ = 0; bidIndex_ < numBids_; ++ bidIndex_) {
			const actorSigner_ = actorSigners_[Number(nextRandomRange_(0n, BigInt(actorSigners_.length - 1)))];
			const gapDuration_ = nextRandomRange_(1n, 5_400n);
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			const bidTimeStamp_ = (latestTimeStamp_ > lastBidTimeStamp_ ? latestTimeStamp_ : lastBidTimeStamp_) + gapDuration_;
			const totalRewardAmount_ = getV3BidCstRewardAmount(bidTimeStamp_ - lastBidTimeStamp_, ratePerMinute_);
			const { lastBidderAmount: lastBidderAmount_, newBidderAmount: newBidderAmount_, } = splitV3BidCstRewardAmount(totalRewardAmount_);

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

			// Apply the model.
			const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.bidCstRewardAmount, `bid ${bidIndex_} total reward`).equal(totalRewardAmount_);
			if (lastBidderAddress_ === null) {
				expectedTotalSupplyChange_ += newBidderAmount_;
			} else {
				expectedCstBalances_.set(lastBidderAddress_, expectedCstBalances_.get(lastBidderAddress_) + lastBidderAmount_);
				expectedTotalSupplyChange_ += totalRewardAmount_;
			}
			expectedCstBalances_.set(actorSigner_.address, expectedCstBalances_.get(actorSigner_.address) + newBidderAmount_ - paidCstPrice_);
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
