"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	activateCurrentRound,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	getLatestBlockTimestamp,
	mineAt,
} = require("../src/V2UpgradeTestHelpers.js");

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
		// todo-0 Isn't it known at which index within `receipt_.logs` the sought event is located?
		// todo-0 So it's possible to just parse and assert that single event and eliminate this convoluted logic.
		// todo-0 Besides, even if this convoluted logic is needed, it could be possible to replace it with a call to the `findParsedEvent` function.
		const parsed_ = receipt_.logs
			.map((log_) => {
				try { return game_.interface.parseLog(log_); } catch { return null; }
			})
			.find((event_) => event_?.name === "BidPlaced");
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

		// todo-0 Increase the number of iterations of each loop to 50.
		// todo-0 Assert that the formulas changing CST Dutch auction duration are lossless.
		// todo-0 That means that both loops will change CST Dutch auction duration to the same values,
		// todo-0 only in the opposite order. Then at the end CST Dutch auction duration will become the same value
		// todo-0 as it initially was.

		let prevDuration_ = await game_.cstDutchAuctionDuration();
		for (let counter_ = 0; counter_ < 5; ++ counter_) {
			await mineAt((await getLatestBlockTimestamp()) + 60n);
			await placeEthBid(game_, contracts_.signers[2 + counter_]);
			const newDuration_ = await game_.cstDutchAuctionDuration();
			// todo-0 This is really supposed to be less-than, unless `prevDuration_` is very small, which is not the case at this point.
			expect(newDuration_).lte(prevDuration_);
			prevDuration_ = newDuration_;
		}

		// todo-0 You call `mineAt` twice in a row. Make sense to not make one of the calls?
		await mineAt((await getLatestBlockTimestamp()) + prevDuration_ + 1n);
		for (let counter_ = 0; counter_ < 5; ++ counter_) {
			await mineAt((await getLatestBlockTimestamp()) + prevDuration_ + 1n);
			const price_ = await game_.getNextCstBidPrice();
			const balance_ = await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address);
			expect(balance_).gte(price_);
			await waitForTransactionReceipt(
				game_.connect(contracts_.signers[2]).bidWithCst(hre.ethers.MaxUint256, "duration up", 0n)
			);
			const newDuration_ = await game_.cstDutchAuctionDuration();
			// todo-0 This is really supposed to be geater-than, except in a marginal case, which is not the case at this point.
			expect(newDuration_).gte(prevDuration_);
			prevDuration_ = newDuration_;
			// todo-0 You will call `mineAt` again after this. Do not make `mineAt` calls one after another.
			await mineAt((await getLatestBlockTimestamp()) + 60n);
		}
	});
});
