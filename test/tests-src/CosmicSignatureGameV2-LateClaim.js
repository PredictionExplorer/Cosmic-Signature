"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	activateCurrentRound,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	getLatestBlockTimestamp,
	mineAtOrAfter,
} = require("../src/V2UpgradeTestHelpers.js");

describe("CosmicSignatureGameV2-LateClaim", function () {
	it("allows a late bidder to bid and immediately claim when mainPrizeTime remains in the past", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const firstBidder_ = contracts_.signers[2];
		let price_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(firstBidder_).bidWithEth(-1n, "first", 0n, { value: price_ }));

		const mainPrizeTime_ = await game_.mainPrizeTime();
		const increment_ = await game_.getMainPrizeTimeIncrement();
		await mineAtOrAfter(mainPrizeTime_ + increment_ + 100n);

		const lateBidder_ = contracts_.signers[3];
		price_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(lateBidder_).bidWithEth(-1n, "late", 0n, { value: price_ }));
		const blockTime_ = await getLatestBlockTimestamp();
		expect(await game_.mainPrizeTime()).lte(blockTime_);

		await expect(game_.connect(firstBidder_).claimMainPrize())
			.revertedWithCustomError(game_, "MainPrizeClaimDenied");

		await waitForTransactionReceipt(game_.connect(lateBidder_).claimMainPrize());
		expect(await game_.roundNum()).equal(2n);
	});

	it("preserves timeout claiming for non-last bidders", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[2];
		const other_ = contracts_.signers[3];
		const price_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "first", 0n, { value: price_ }));

		await mineAtOrAfter(await game_.mainPrizeTime());
		await expect(game_.connect(other_).claimMainPrize())
			.revertedWithCustomError(game_, "MainPrizeClaimDenied");

		await mineAtOrAfter((await game_.mainPrizeTime()) + (await game_.timeoutDurationToClaimMainPrize()) + 1n);
		await waitForTransactionReceipt(game_.connect(other_).claimMainPrize());
		expect(await game_.roundNum()).equal(2n);
	});
});
