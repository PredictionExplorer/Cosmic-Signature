"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	activateCurrentRound,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	findParsedEvent,
	getLatestBlockTimestamp,
	mineAt,
} = require("../src/V2UpgradeTestHelpers.js");

const DURATION_DRIFT_ITERATIONS = 50;

async function placeEthBid(game_, bidder_) {
	const price_ = await game_.getNextEthBidPrice();
	await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: price_ }));
	return price_;
}

describe("CosmicSignatureGameV2-Economics", function () {
	it("documents zero-price CST bids minting only the computed reward", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[2];
		await mineAt((await getLatestBlockTimestamp()) + 60n);
		await placeEthBid(game_, bidder_);

		const duration_ = await game_.cstDutchAuctionDuration();
		await mineAt((await getLatestBlockTimestamp()) + duration_ + 1n);
		expect(await game_.getNextCstBidPrice()).equal(0n);

		const reward_ = await game_.getBidCstRewardAmountAdvanced(1n);
		expect(reward_).greaterThan(0n);
		const balanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(bidder_.address);
		const receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "free cst bid", 0n)
		);
		const parsed_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(parsed_).not.equal(undefined);
		expect(parsed_.args.paidCstPrice).equal(0n);
		expect(parsed_.args.bidCstRewardAmount).equal(reward_);
		expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)).equal(balanceBefore_ + reward_);
		expect(await game_.lastCstBidderAddress()).equal(bidder_.address);
	});

	it("ETH bids can abruptly reduce the current CST bid price to zero near the duration boundary", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder1_ = contracts_.signers[2];
		const bidder2_ = contracts_.signers[3];
		await mineAt((await getLatestBlockTimestamp()) + 60n);
		await placeEthBid(game_, bidder1_);

		const duration_ = await game_.cstDutchAuctionDuration();
		await mineAt((await getLatestBlockTimestamp()) + duration_ - 60n);
		const priceBefore_ = await game_.getNextCstBidPrice();
		expect(priceBefore_).greaterThan(0n);
		const priceBeforeAhead_ = await game_.getNextCstBidPriceAdvanced(30n);
		expect(priceBeforeAhead_).greaterThan(0n);
		expect(priceBeforeAhead_).lessThan(priceBefore_);

		await placeEthBid(game_, bidder2_);
		const priceAfter_ = await game_.getNextCstBidPrice();
		expect(priceAfter_).equal(0n);
	});

	it("cstDutchAuctionDuration drifts down on ETH bids and up on CST bids", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const initialDuration_ = await game_.cstDutchAuctionDuration();
		const durationStack_ = [initialDuration_];
		let prevDuration_ = await game_.cstDutchAuctionDuration();
		for (let counter_ = 0; counter_ < DURATION_DRIFT_ITERATIONS; ++ counter_) {
			await mineAt((await getLatestBlockTimestamp()) + 60n);
			await placeEthBid(game_, contracts_.signers[2 + counter_ % (contracts_.signers.length - 2)]);
			const newDuration_ = await game_.cstDutchAuctionDuration();
			expect(newDuration_).lessThan(prevDuration_);
			durationStack_.push(newDuration_);
			prevDuration_ = newDuration_;
		}

		for (let counter_ = 0; counter_ < DURATION_DRIFT_ITERATIONS; ++ counter_) {
			await mineAt((await getLatestBlockTimestamp()) + prevDuration_ + 1n);
			const price_ = await game_.getNextCstBidPrice();
			const balance_ = await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address);
			expect(balance_).gte(price_);
			await waitForTransactionReceipt(
				game_.connect(contracts_.signers[2]).bidWithCst(hre.ethers.MaxUint256, "duration up", 0n)
			);
			const newDuration_ = await game_.cstDutchAuctionDuration();
			expect(newDuration_).greaterThan(prevDuration_);
			durationStack_.pop();
			expect(newDuration_).equal(durationStack_[durationStack_.length - 1]);
			prevDuration_ = newDuration_;
		}
		expect(await game_.cstDutchAuctionDuration()).equal(initialDuration_);
	});
});
