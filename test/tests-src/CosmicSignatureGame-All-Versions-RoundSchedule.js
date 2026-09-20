"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const { SECONDS_PER_HOUR, SECONDS_PER_DAY } = require("../../src/CosmicSignatureConstants.js");
const { MAX_UINT256, asUint256 } = require("../../src/BigIntMathHelpers.js");
const { ENABLE_SMTCHECKER, generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, mineAtOrAfter, getLatestBlockTimestamp, blockTimestampOfReceipt } = require("../src/V2UpgradeTestHelpers.js");
const { testAcrossGameVersions, finishGameRound, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

async function testOverflowingActivationDelay(delay_) {
	await testAcrossGameVersions(async (contracts_, game_, roundNum_) => {
		const gameForOwner_ = game_.connect(contracts_.ownerSigner);
		const normalDelay_ = await game_.delayDurationBeforeRoundActivation();
		const winner_ = contracts_.signers[2];
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await bidWithEthAt(game_, winner_, (await getLatestBlockTimestamp()) + 1n);
		await waitForTransactionReceipt(gameForOwner_.setDelayDurationBeforeRoundActivation(delay_));
		await mineAtOrAfter(await game_.mainPrizeTime());
		await expect(game_.connect(contracts_.signers[3]).claimMainPrize())
			.revertedWithCustomError(game_, "MainPrizeClaimDenied");

		// Comment-202606235: an overflowing activation delay must not block the winner's production claim.
		if (ENABLE_SMTCHECKER > 0) {
			await expect(game_.connect(winner_).claimMainPrize()).revertedWithPanic(0x11);
			expect(await game_.roundNum()).equal(roundNum_);
			expect(await game_.lastBidderAddress()).equal(winner_.address);
			await waitForTransactionReceipt(gameForOwner_.setDelayDurationBeforeRoundActivation(normalDelay_));
			await finishGameRound(contracts_, game_);
		} else {
			const receipt_ = await waitForTransactionReceipt(game_.connect(winner_).claimMainPrize());
			const claimTimeStamp_ = await blockTimestampOfReceipt(receipt_);
			expect(await game_.roundActivationTime()).equal(asUint256(claimTimeStamp_ + delay_));
			await waitForTransactionReceipt(gameForOwner_.setDelayDurationBeforeRoundActivation(normalDelay_));
		}
		expect(await game_.roundNum()).equal(roundNum_ + 1n);

		// A wrapped activation time is in the past; leave the next round inactive for the upgrade.
		await waitForTransactionReceipt(gameForOwner_.setRoundActivationTime((await getLatestBlockTimestamp()) + SECONDS_PER_HOUR));
	});
}

describe("CosmicSignatureGame-All-Versions-RoundSchedule", function () {
	it("setDelayDurationBeforeRoundActivation takes effect only when a new round activation is scheduled", async function () {
		await testAcrossGameVersions(async (contracts_, game_, roundNum_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const bidder_ = contracts_.signers[2];

			const oldRoundActivationTime_ = await game_.roundActivationTime();
			await mineAtOrAfter(oldRoundActivationTime_);
			await bidWithEthAt(game_, bidder_, await getLatestBlockTimestamp() + 1n);
			const mainPrizeTime_ = await game_.mainPrizeTime();

			// Zero would activate the next round immediately and prevent upgrading.
			// Allow at least an hour for the upgrade, including on slower coverage runs.
			const newDelay_ = SECONDS_PER_HOUR + BigInt(generateRandomUInt32() % Number(7n * SECONDS_PER_DAY - SECONDS_PER_HOUR));

			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(newDelay_));
			expect(await game_.delayDurationBeforeRoundActivation()).equal(newDelay_);
			expect(await game_.roundActivationTime()).equal(oldRoundActivationTime_);
			expect(await game_.mainPrizeTime()).equal(mainPrizeTime_);

			await mineAtOrAfter(mainPrizeTime_);
			const beforeClaimBlockTime_ = await getLatestBlockTimestamp();
			await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
			expect(await game_.roundNum()).equal(roundNum_ + 1n);
			expect(await game_.roundActivationTime()).equal(beforeClaimBlockTime_ + newDelay_ + 1n);
		});
	});

	it("wraps a maximum activation delay without denying the winner's claim outside SMTChecker builds", async function () {
		await testOverflowingActivationDelay(MAX_UINT256);
	});

	it("wraps a non-maximum overflowing activation delay outside SMTChecker builds", async function () {
		await testOverflowingActivationDelay(MAX_UINT256 - 1000n);
	});
});
