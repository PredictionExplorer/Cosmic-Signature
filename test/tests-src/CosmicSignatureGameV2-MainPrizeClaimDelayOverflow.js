"use strict";

// Tests for Comment-202606235: `MainPrizeV2._prepareNextRound` wraps its body in an `unchecked` block so a
// malicious/compromised owner can no longer brick `claimMainPrize` by setting `delayDurationBeforeRoundActivation`
// to a value that overflows `block.timestamp + delayDurationBeforeRoundActivation`. Because the round-activation
// setter (Comment-202503106) has no round-state guard, the owner could previously make the overflow revert the
// claim, lock the rightful winner out during their exclusive window, wait out the claim timeout, and then atomically
// restore a safe value and claim the prize themselves. The `unchecked` block makes the addition wrap instead of
// reverting, so the winner's claim can never be blocked this way.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { ENABLE_SMTCHECKER, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	MAX_UINT256,
	activateCurrentRound,
	blockTimestampOfReceipt,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	mineAtOrAfter,
} = require("../src/V2UpgradeTestHelpers.js");

// Deploys V1, completes round 0, upgrades to V2, activates round 1, and places one ETH bid so the bidder is the
// last bidder (the round's prospective main prize winner). Returns the V2 proxy and the relevant signers.
async function setUpActiveV2RoundWithOneBid() {
	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
	const game_ = contracts_.cosmicSignatureGameV2Proxy;
	await activateCurrentRound(game_, contracts_.ownerSigner);

	const winner_ = contracts_.signers[2];
	const price_ = await game_.getNextEthBidPrice();
	await waitForTransactionReceipt(game_.connect(winner_).bidWithEth(-1n, "", 0n, { value: price_ }));
	return { contracts_, game_, winner_ };
}

async function claimMainPrizeWithOverflowingDelay(game_, winner_) {
	const claimPromise_ = game_.connect(winner_).claimMainPrize();
	if (ENABLE_SMTCHECKER > 0) {
		// SMTChecker builds comment out the `unchecked` marker so the overflow remains visible to the checker.
		await expect(claimPromise_).revertedWithPanic(0x11);
		return undefined;
	}
	return waitForTransactionReceipt(claimPromise_);
}

describe("CosmicSignatureGameV2-MainPrizeClaimDelayOverflow", function () {
	it("covers a last-bidder claim with type(uint256).max delay (wraps outside SMTChecker builds)", async function () {
		const { game_, winner_, contracts_ } = await setUpActiveV2RoundWithOneBid();

		// The owner overflows the next-round activation math while a bid is already placed (Comment-202503106 allows this).
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(MAX_UINT256)
		);
		expect(await game_.delayDurationBeforeRoundActivation()).equal(MAX_UINT256);

		await mineAtOrAfter(await game_.mainPrizeTime());
		const receipt_ = await claimMainPrizeWithOverflowingDelay(game_, winner_);
		if (ENABLE_SMTCHECKER > 0) {
			return;
		}
		const claimTs_ = await blockTimestampOfReceipt(receipt_);

		// The claim succeeds: the round advanced and the last bidder was cleared.
		expect(await game_.roundNum()).equal(2n);
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);

		// `block.timestamp + delayDurationBeforeRoundActivation` wrapped modulo 2^256 instead of reverting.
		const expectedRoundActivationTime_ = BigInt.asUintN(256, claimTs_ + MAX_UINT256);
		expect(await game_.roundActivationTime()).equal(expectedRoundActivationTime_);
		// For the specific value type(uint256).max the wrap equals claimTs - 1.
		expect(expectedRoundActivationTime_).equal(claimTs_ - 1n);
	});

	it("defuses the brick-then-steal scenario: the owner cannot block the winner's claim by overflowing the activation time", async function () {
		const { game_, winner_, contracts_ } = await setUpActiveV2RoundWithOneBid();
		const nonWinner_ = contracts_.signers[3];

		// Step 1 of the old attack: the owner sets a delay that would overflow the activation math at claim time.
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(MAX_UINT256)
		);

		await mineAtOrAfter(await game_.mainPrizeTime());

		// During the winner's exclusive window nobody else may claim, so there is nothing for the owner to steal yet.
		await expect(game_.connect(nonWinner_).claimMainPrize())
			.revertedWithCustomError(game_, "MainPrizeClaimDenied");

		// The crucial production property: the overflow no longer bricks the winner's own claim.
		await claimMainPrizeWithOverflowingDelay(game_, winner_);
		if (ENABLE_SMTCHECKER > 0) {
			return;
		}
		expect(await game_.roundNum()).equal(2n);
	});

	it("wraps roundActivationTime deterministically for a chosen overflowing delay", async function () {
		const { game_, winner_, contracts_ } = await setUpActiveV2RoundWithOneBid();

		const delay_ = MAX_UINT256 - 1000n;
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(delay_)
		);

		await mineAtOrAfter(await game_.mainPrizeTime());
		const receipt_ = await claimMainPrizeWithOverflowingDelay(game_, winner_);
		if (ENABLE_SMTCHECKER > 0) {
			return;
		}
		const claimTs_ = await blockTimestampOfReceipt(receipt_);

		expect(await game_.roundNum()).equal(2n);
		const expectedRoundActivationTime_ = BigInt.asUintN(256, claimTs_ + delay_);
		expect(await game_.roundActivationTime()).equal(expectedRoundActivationTime_);
		// claimTs + (2^256 - 1001) wraps to claimTs - 1001.
		expect(expectedRoundActivationTime_).equal(claimTs_ - 1001n);
	});

	it("still reverts the claim with a division-by-zero panic when mainPrizeTimeIncrementIncreaseDivisor is zero (unchecked does not mask 0x12)", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;

		// The divisor setter is guarded by `_onlyRoundIsInactive`, so it must be set before the round activates.
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setMainPrizeTimeIncrementIncreaseDivisor(0n)
		);
		expect(await game_.mainPrizeTimeIncrementIncreaseDivisor()).equal(0n);

		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder_ = contracts_.signers[2];
		const price_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: price_ }));

		await mineAtOrAfter(await game_.mainPrizeTime());
		// `_prepareNextRound` divides by `mainPrizeTimeIncrementIncreaseDivisor`; `unchecked` does NOT suppress a
		// division-by-zero, so the claim reverts with Panic(0x12). This lever is gated by round inactivity, so it
		// cannot be toggled mid-round and therefore cannot reproduce the brick-then-steal of Comment-202606235.
		await expect(game_.connect(bidder_).claimMainPrize()).revertedWithPanic(0x12);
	});

	it("blocks the divisor setter mid-round (RoundIsActive) while still allowing the delay setter mid-round", async function () {
		const { game_, contracts_ } = await setUpActiveV2RoundWithOneBid();

		// `setMainPrizeTimeIncrementIncreaseDivisor` carries `_onlyRoundIsInactive`, so a mid-round toggle reverts.
		await expect(game_.connect(contracts_.ownerSigner).setMainPrizeTimeIncrementIncreaseDivisor(0n))
			.revertedWithCustomError(game_, "RoundIsActive");

		// `setDelayDurationBeforeRoundActivation` deliberately omits that guard (Comment-202503106), so it is allowed
		// mid-round; Comment-202606235's `unchecked` block is what makes that permissiveness harmless.
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(MAX_UINT256)
		);
		expect(await game_.delayDurationBeforeRoundActivation()).equal(MAX_UINT256);
	});
});

describe("CosmicSignatureGameV1-MainPrizeClaimDelayOverflow (pre-fix behavior)", function () {
	it("demonstrates the vulnerability the V2 fix addresses: on V1 a max delay makes claimMainPrize revert with an overflow panic", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		const game_ = contracts_.cosmicSignatureGameProxy;
		const bidder_ = contracts_.signers[2];

		await mineAtOrAfter(await game_.roundActivationTime());
		const price_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", { value: price_ }));

		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(MAX_UINT256)
		);

		await mineAtOrAfter(await game_.mainPrizeTime());
		// V1's `_prepareNextRound` uses checked arithmetic, so `block.timestamp + delayDurationBeforeRoundActivation`
		// overflows and reverts with Panic(0x11), bricking the prize. This is the exact behavior Comment-202606235
		// eliminates in V2.
		await expect(game_.connect(bidder_).claimMainPrize()).revertedWithPanic(0x11);
	});
});
