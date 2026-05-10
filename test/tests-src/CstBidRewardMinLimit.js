"use strict";

// CST bid reward minimum-limit (front-running slippage protection) tests.
//
// V2 introduced a sqrt-time CST reward whose value depends on the elapsed time since
// the previous bid. A bidder that observes a victim's pending tx can front-run with
// their own bid, resetting `lastBidTimeStamp` to the current block and collapsing the
// victim's reward. Each V2 bid function therefore takes an optional `cstBidRewardMinLimit_`
// parameter; the bid reverts with `CstBidRewardMinLimitNotReached` if the actual reward
// is less than this value. Pass 0 to disable the check.
//
// These tests cover boundary arithmetic, first-bid / same-block edge cases, sandwich and
// race scenarios, donation-variant atomicity, and revert-reason fidelity.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { deployContractsForTestingAdvanced } = require("../../src/ContractTestingHelpers.js");
const { setRoundActivationTimeIfNeeded } = require("../../src/ContractDeploymentHelpers.js");

function sqrtBigInt(value_) {
	expect(typeof value_).equal("bigint");
	expect(value_).greaterThanOrEqual(0n);
	if (value_ < 2n) {
		return value_;
	}
	let x0_ = value_;
	let x1_ = (value_ >> 1n) + 1n;
	while (x1_ < x0_) {
		x0_ = x1_;
		x1_ = (x1_ + value_ / x1_) >> 1n;
	}
	return x0_;
}

function expectedCstBidRewardAmount(elapsedSeconds_) {
	expect(typeof elapsedSeconds_).equal("bigint");
	return sqrtBigInt(3n * elapsedSeconds_ * 10n ** 36n);
}

async function deployV2ContractsForTesting() {
	const contracts_ = await deployContractsForTestingAdvanced("CosmicSignatureGameV2");
	await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 0n);
	return contracts_;
}

async function setNextBlockTimestamp(timestamp_) {
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp_),]);
}

async function bidWithEthAt(contracts_, bidderSigner_, timestamp_) {
	await setNextBlockTimestamp(timestamp_);
	const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
	const transactionReceipt_ =
		await waitForTransactionReceipt(
			contracts_.cosmicSignatureGameProxy.connect(bidderSigner_).bidWithEth((-1), "", 0n, {value: ethBidPrice_,})
		);
	const transactionBlock_ = await transactionReceipt_.getBlock();
	expect(transactionBlock_.timestamp).equal(Number(timestamp_));
	return {ethBidPrice_, transactionReceipt_, transactionBlock_,};
}

describe("CST bid reward min limit", function () {
	// #region Boundary arithmetic

	describe("boundary arithmetic", function () {
		it("ETH bid with minLimit==0 succeeds even when reward is 0", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const bidder_ = contracts_.signers[0];
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(bidder_).bidWithEth((-1), "", 0n, {value: ethBidPrice_,})
			).emit(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinted").withArgs(0n, bidder_.address, 0n);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)).equal(0n);
		});

		it("ETH bid with minLimit==actualReward succeeds (boundary equality)", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const elapsed_ = 3600n;
			const expected_ = expectedCstBidRewardAmount(elapsed_);
			const bidder_ = contracts_.signers[1];
			await setNextBlockTimestamp(firstBidTimestamp_ + elapsed_);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(bidder_).bidWithEth((-1), "", expected_, {value: ethBidPrice_,})
			).emit(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinted").withArgs(0n, bidder_.address, expected_);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)).equal(expected_);
		});

		it("ETH bid with minLimit==actualReward+1 reverts (off-by-one failure)", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const elapsed_ = 3600n;
			const expected_ = expectedCstBidRewardAmount(elapsed_);
			const tooHigh_ = expected_ + 1n;
			const bidder_ = contracts_.signers[1];
			await setNextBlockTimestamp(firstBidTimestamp_ + elapsed_);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(bidder_).bidWithEth((-1), "", tooHigh_, {value: ethBidPrice_,})
			)
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached")
				.withArgs(expected_, tooHigh_);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)).equal(0n);
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(contracts_.signers[0].address);
		});

		it("ETH bid with minLimit==MaxUint256 always reverts", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			await setNextBlockTimestamp(firstBidTimestamp_ + 86400n);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1), "", hre.ethers.MaxUint256, {value: ethBidPrice_,})
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached");
		});

		it("CST bid with minLimit==actualReward succeeds and minLimit==actualReward+1 reverts", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);
			const ethBidder_ = contracts_.signers[1];
			const secondBidTimestamp_ = firstBidTimestamp_ + 3600n;
			await bidWithEthAt(contracts_, ethBidder_, secondBidTimestamp_);

			const elapsed_ = 21600n - 3600n;
			const expected_ = expectedCstBidRewardAmount(elapsed_);
			const cstBidTimestamp_ = secondBidTimestamp_ + elapsed_;
			await setNextBlockTimestamp(cstBidTimestamp_);
			const cstPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice();
			const balanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(ethBidder_.address);

			// First, the failing path with minLimit one wei above actual reward.
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(ethBidder_).bidWithCst(cstPrice_, "", expected_ + 1n)
			)
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached")
				.withArgs(expected_, expected_ + 1n);
			// CST balance unchanged: the burn never happened.
			expect(await contracts_.cosmicSignatureToken.balanceOf(ethBidder_.address)).equal(balanceBefore_);

			// Then the boundary success: same block + 1 (one second more elapsed time).
			const cstBidTimestampSuccess_ = cstBidTimestamp_ + 1n;
			await setNextBlockTimestamp(cstBidTimestampSuccess_);
			const expectedAtSuccess_ = expectedCstBidRewardAmount(elapsed_ + 1n);
			const cstPriceSuccess_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(ethBidder_).bidWithCst(cstPriceSuccess_, "", expectedAtSuccess_)
			).emit(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinted").withArgs(0n, ethBidder_.address, expectedAtSuccess_);
		});

		it("sweep across a range of elapsed durations: boundary holds for both ETH and CST bids", async function () {
			for (const elapsed_ of [1n, 60n, 3600n, 86400n,]) {
				const contracts_ = await deployV2ContractsForTesting();
				const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
				await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

				const expected_ = expectedCstBidRewardAmount(elapsed_);
				const bidder_ = contracts_.signers[1];
				await setNextBlockTimestamp(firstBidTimestamp_ + elapsed_);
				const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();

				await waitForTransactionReceipt(
					contracts_.cosmicSignatureGameProxy.connect(bidder_).bidWithEth((-1), "", expected_, {value: ethBidPrice_,})
				);
				expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)).equal(expected_);
			}
		});
	});

	// #endregion
	// #region First-bid edge cases

	describe("first-bid and round-rollover edge cases", function () {
		it("first bid of the very first round: minLimit>0 reverts; minLimit==0 succeeds", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth((-1), "", 1n, {value: ethBidPrice_,})
			)
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached")
				.withArgs(0n, 1n);

			await waitForTransactionReceipt(
				contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth((-1), "", 0n, {value: ethBidPrice_,})
			);
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(contracts_.signers[0].address);
		});

		it("first bid of a subsequent round still has reward 0; minLimit>0 reverts after the round rolls", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);
			await setNextBlockTimestamp((await contracts_.cosmicSignatureGameProxy.mainPrizeTime()) + 1n);
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());
			const nextRoundActivationTime_ = await contracts_.cosmicSignatureGameProxy.roundActivationTime();
			await setNextBlockTimestamp(nextRoundActivationTime_);

			const newRoundFirstBidder_ = contracts_.signers[1];
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(newRoundFirstBidder_).bidWithEth((-1), "", 1n, {value: ethBidPrice_,})
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached")
				.withArgs(0n, 1n);
		});
	});

	// #endregion
	// #region Same-block / batch protection

	describe("same-block and in-tx batch protection", function () {
		it("two bids same block: second bidder with minLimit>0 reverts", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const secondPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			const thirdPrice_ = secondPrice_ + secondPrice_ / (await contracts_.cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()) + 1n;

			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			try {
				const tx2_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1), "", 0n, {value: secondPrice_,});
				const tx3_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth((-1), "", 1n, {value: thirdPrice_,});
				await hre.ethers.provider.send("evm_mine");
				await tx2_.wait();
				// Reverted txs throw on `.wait()` — `.catch` lets us continue and verify state.
				const receipt3OrError_ = await tx3_.wait().catch((err_) => err_);
				expect(receipt3OrError_).is.an("error");
				expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(contracts_.signers[1].address);
				expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address)).equal(0n);
			} finally {
				await hre.ethers.provider.send("evm_setAutomine", [true,]);
			}
		});

		it("BidderContract.doBidWithEthManyV2 with minLimit==0: full batch farms zero CST", async function () {
			const numBids_ = 10n;
			const contracts_ = await deployV2ContractsForTesting();
			const factory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
			const bidderContract_ = await factory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
			await bidderContract_.waitForDeployment();
			const bidderAddr_ = await bidderContract_.getAddress();

			await waitForTransactionReceipt(
				bidderContract_.doBidWithEthManyV2(numBids_, 0n, {value: hre.ethers.parseEther("1.0"),})
			);
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(bidderAddr_);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidderAddr_)).equal(0n);
		});

		it("BidderContract.doBidWithEthManyV2 with minLimit>0: whole batch reverts on the second iteration", async function () {
			const numBids_ = 5n;
			const contracts_ = await deployV2ContractsForTesting();
			const factory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
			const bidderContract_ = await factory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
			await bidderContract_.waitForDeployment();
			const bidderAddr_ = await bidderContract_.getAddress();
			const balanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(bidderAddr_);

			await expect(
				bidderContract_.doBidWithEthManyV2(numBids_, 1n, {value: hre.ethers.parseEther("1.0"),})
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached")
				.withArgs(0n, 1n);
			// Whole batch reverts atomically, including the first bid: no state change.
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidderAddr_)).equal(balanceBefore_);
		});
	});

	// #endregion
	// #region Front-running scenarios

	describe("front-running / MEV scenarios", function () {
		it("ETH→ETH same-block sandwich: attacker mined first, victim with minLimit reverts", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			// Advance time so the victim *thinks* they will earn `expected_` CST.
			const victimExpectedElapsed_ = 3600n;
			const victimExpected_ = expectedCstBidRewardAmount(victimExpectedElapsed_);

			// Attacker bids first (same block as the victim) at firstBidTimestamp_+expectedElapsed_.
			const attackBlockTimestamp_ = firstBidTimestamp_ + victimExpectedElapsed_;
			await setNextBlockTimestamp(attackBlockTimestamp_);
			const attackerPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			const victimPrice_ = attackerPrice_ + attackerPrice_ / (await contracts_.cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()) + 1n;

			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			try {
				const attackerTx_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1), "attacker", 0n, {value: attackerPrice_,});
				const victimTx_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth((-1), "victim", victimExpected_, {value: victimPrice_,});
				await hre.ethers.provider.send("evm_mine");
				await attackerTx_.wait();
				const victimReceiptOrError_ = await victimTx_.wait().catch((err_) => err_);
				expect(victimReceiptOrError_).is.an("error");
			} finally {
				await hre.ethers.provider.send("evm_setAutomine", [true,]);
			}

			// Verify attacker now holds the latest bid; victim's CST balance is zero (no mint occurred).
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(contracts_.signers[1].address);
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address)).equal(0n);
			// Attacker received the elapsed-time reward (since they were first to bid in this block, elapsed > 0).
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[1].address)).equal(victimExpected_);
		});

		it("ETH→CST same-block sandwich: attacker resets clock; victim's CST bid with minLimit reverts", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);
			// Establish a CST bidder with sufficient CST (signer[1] gets reward via an ETH bid).
			const cstVictim_ = contracts_.signers[1];
			await bidWithEthAt(contracts_, cstVictim_, firstBidTimestamp_ + 7200n);

			const blockTime_ = firstBidTimestamp_ + 7200n + 3600n;
			await setNextBlockTimestamp(blockTime_);
			const expectedReward_ = expectedCstBidRewardAmount(3600n);
			const cstPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice();
			const attackerEthPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();

			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			try {
				const attackerTx_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth((-1), "attacker", 0n, {value: attackerEthPrice_,});
				const victimTx_ = await contracts_.cosmicSignatureGameProxy.connect(cstVictim_).bidWithCst(cstPrice_, "victim", expectedReward_);
				await hre.ethers.provider.send("evm_mine");
				await attackerTx_.wait();
				const victimReceiptOrError_ = await victimTx_.wait().catch((err_) => err_);
				expect(victimReceiptOrError_).is.an("error");
			} finally {
				await hre.ethers.provider.send("evm_setAutomine", [true,]);
			}
			// CST victim's balance is unchanged — no burn happened because we reverted before mintAndBurnMany.
			// Their balance equals the reward they had earned from the earlier ETH bid (3600s elapsed).
			expect(await contracts_.cosmicSignatureToken.balanceOf(cstVictim_.address)).equal(expectedCstBidRewardAmount(7200n));
		});

		it("two-victim race in same block: only first-mined succeeds, second reverts", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const elapsed_ = 600n;
			const expected_ = expectedCstBidRewardAmount(elapsed_);
			const blockTime_ = firstBidTimestamp_ + elapsed_;
			await setNextBlockTimestamp(blockTime_);
			const firstPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			const secondPrice_ = firstPrice_ + firstPrice_ / (await contracts_.cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()) + 1n;

			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			try {
				const tx1_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1), "", expected_, {value: firstPrice_,});
				const tx2_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth((-1), "", expected_, {value: secondPrice_,});
				await hre.ethers.provider.send("evm_mine");
				await tx1_.wait();
				const tx2Result_ = await tx2_.wait().catch((err_) => err_);
				expect(tx2Result_).is.an("error");
			} finally {
				await hre.ethers.provider.send("evm_setAutomine", [true,]);
			}
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[1].address)).equal(expected_);
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address)).equal(0n);
		});

		it("attacker cannot influence victim's minLimit — they sign their own tx", async function () {
			// This is structural rather than testable via state, but we verify that even when the
			// attacker bids first AND last (a sandwich), the victim's tx outcome depends only on
			// the elapsed time at the moment their tx is mined and the minLimit they signed.
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			// Victim's signed minLimit = 1 wei (extremely low). Even an attacker front-run cannot make this fail
			// unless they reset the clock to the same block as the victim, which we test elsewhere.
			const elapsed_ = 60n;
			await setNextBlockTimestamp(firstBidTimestamp_ + elapsed_);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await waitForTransactionReceipt(
				contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1), "victim with low minLimit", 1n, {value: ethBidPrice_,})
			);
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(contracts_.signers[1].address);
		});
	});

	// #endregion
	// #region Atomicity / state rollback

	describe("atomicity on revert", function () {
		it("ETH bid revert: no state mutated, no events emitted, no ETH transferred", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const lastBidderBefore_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
			const nextEthBidPriceBefore_ = await contracts_.cosmicSignatureGameProxy.nextEthBidPrice();
			const roundNumBefore_ = await contracts_.cosmicSignatureGameProxy.roundNum();
			const mainPrizeTimeBefore_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();

			const bidder_ = contracts_.signers[1];
			const bidderEthBefore_ = await hre.ethers.provider.getBalance(bidder_.address);

			await setNextBlockTimestamp(firstBidTimestamp_ + 60n);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(bidder_).bidWithEth((-1), "", hre.ethers.MaxUint256, {value: ethBidPrice_,})
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached");

			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(lastBidderBefore_);
			expect(await contracts_.cosmicSignatureGameProxy.nextEthBidPrice()).equal(nextEthBidPriceBefore_);
			expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(roundNumBefore_);
			expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTime()).equal(mainPrizeTimeBefore_);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)).equal(0n);
			// Bidder's ETH balance only differs by gas; no `paidEthPrice_` was deducted.
			const bidderEthAfter_ = await hre.ethers.provider.getBalance(bidder_.address);
			expect(bidderEthAfter_).greaterThan(bidderEthBefore_ - ethBidPrice_);
		});

		it("CST bid revert: no burn, no mint, no state mutated", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);
			const cstBidder_ = contracts_.signers[1];
			await bidWithEthAt(contracts_, cstBidder_, firstBidTimestamp_ + 3600n);

			const cstBalanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(cstBidder_.address);
			const lastBidderBefore_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
			const lastCstBidderBefore_ = await contracts_.cosmicSignatureGameProxy.lastCstBidderAddress();
			const cstAuctionBeginningBefore_ = await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningTimeStamp();

			await setNextBlockTimestamp(firstBidTimestamp_ + 7200n);
			const cstPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(cstBidder_).bidWithCst(cstPrice_, "", hre.ethers.MaxUint256)
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached");

			expect(await contracts_.cosmicSignatureToken.balanceOf(cstBidder_.address)).equal(cstBalanceBefore_);
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(lastBidderBefore_);
			expect(await contracts_.cosmicSignatureGameProxy.lastCstBidderAddress()).equal(lastCstBidderBefore_);
			expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningTimeStamp()).equal(cstAuctionBeginningBefore_);
		});
	});

	// #endregion
	// #region Donation variants

	describe("donation variants on revert do not deliver donations", function () {
		it("bidWithEthAndDonateToken: revert with high minLimit leaves the donation untransferred", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const erc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", contracts_.deployerSigner);
			const erc20_ = await erc20Factory_.deploy();
			await erc20_.waitForDeployment();
			const donor_ = contracts_.signers[1];
			const donateAmount_ = 1_000n * 10n ** 18n;
			await waitForTransactionReceipt(erc20_.mint(donor_.address, donateAmount_));
			await waitForTransactionReceipt(erc20_.connect(donor_).approve(await contracts_.prizesWallet.getAddress(), donateAmount_));

			await setNextBlockTimestamp(firstBidTimestamp_ + 60n);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(donor_).bidWithEthAndDonateToken(
					(-1), "", hre.ethers.MaxUint256, await erc20_.getAddress(), donateAmount_, {value: ethBidPrice_,}
				)
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached");
			// Donor's tokens were never moved.
			expect(await erc20_.balanceOf(donor_.address)).equal(donateAmount_);
			expect(await erc20_.balanceOf(await contracts_.prizesWallet.getAddress())).equal(0n);
		});

		it("bidWithEthAndDonateNft: revert leaves the NFT with the donor", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const erc721Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc721", contracts_.deployerSigner);
			const erc721_ = await erc721Factory_.deploy();
			await erc721_.waitForDeployment();
			const donor_ = contracts_.signers[1];
			const mintReceipt_ = await waitForTransactionReceipt(erc721_.mint(donor_.address));
			// FuzzTestMockErc721 mints sequentially starting at 1; the first call yields tokenId 1.
			const nftId_ = 1n;
			expect(await erc721_.ownerOf(nftId_)).equal(donor_.address);
			expect(mintReceipt_).is.not.null;
			await waitForTransactionReceipt(erc721_.connect(donor_).approve(await contracts_.prizesWallet.getAddress(), nftId_));

			await setNextBlockTimestamp(firstBidTimestamp_ + 60n);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(donor_).bidWithEthAndDonateNft(
					(-1), "", hre.ethers.MaxUint256, await erc721_.getAddress(), nftId_, {value: ethBidPrice_,}
				)
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached");
			expect(await erc721_.ownerOf(nftId_)).equal(donor_.address);
		});

		it("bidWithCstAndDonateToken: revert preserves CST balance and leaves the token donation untransferred", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);
			const cstBidder_ = contracts_.signers[1];
			await bidWithEthAt(contracts_, cstBidder_, firstBidTimestamp_ + 3600n);

			const erc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", contracts_.deployerSigner);
			const erc20_ = await erc20Factory_.deploy();
			await erc20_.waitForDeployment();
			const donateAmount_ = 1_000n * 10n ** 18n;
			await waitForTransactionReceipt(erc20_.mint(cstBidder_.address, donateAmount_));
			await waitForTransactionReceipt(erc20_.connect(cstBidder_).approve(await contracts_.prizesWallet.getAddress(), donateAmount_));

			const cstBalanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(cstBidder_.address);
			await setNextBlockTimestamp(firstBidTimestamp_ + 7200n);
			const cstPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(cstBidder_).bidWithCstAndDonateToken(
					cstPrice_, "", hre.ethers.MaxUint256, await erc20_.getAddress(), donateAmount_
				)
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached");
			expect(await contracts_.cosmicSignatureToken.balanceOf(cstBidder_.address)).equal(cstBalanceBefore_);
			expect(await erc20_.balanceOf(cstBidder_.address)).equal(donateAmount_);
		});

		it("bidWithCstAndDonateNft: revert preserves CST and the NFT", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);
			const cstBidder_ = contracts_.signers[1];
			await bidWithEthAt(contracts_, cstBidder_, firstBidTimestamp_ + 3600n);

			const erc721Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc721", contracts_.deployerSigner);
			const erc721_ = await erc721Factory_.deploy();
			await erc721_.waitForDeployment();
			await waitForTransactionReceipt(erc721_.mint(cstBidder_.address));
			const nftId_ = 1n;
			await waitForTransactionReceipt(erc721_.connect(cstBidder_).approve(await contracts_.prizesWallet.getAddress(), nftId_));

			const cstBalanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(cstBidder_.address);
			await setNextBlockTimestamp(firstBidTimestamp_ + 7200n);
			const cstPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(cstBidder_).bidWithCstAndDonateNft(
					cstPrice_, "", hre.ethers.MaxUint256, await erc721_.getAddress(), nftId_
				)
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached");
			expect(await contracts_.cosmicSignatureToken.balanceOf(cstBidder_.address)).equal(cstBalanceBefore_);
			expect(await erc721_.ownerOf(nftId_)).equal(cstBidder_.address);
		});

		it("happy path: bidWithEthAndDonateToken with sufficient minLimit delivers the donation", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const erc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", contracts_.deployerSigner);
			const erc20_ = await erc20Factory_.deploy();
			await erc20_.waitForDeployment();
			const donor_ = contracts_.signers[1];
			const donateAmount_ = 1_000n * 10n ** 18n;
			await waitForTransactionReceipt(erc20_.mint(donor_.address, donateAmount_));
			await waitForTransactionReceipt(erc20_.connect(donor_).approve(await contracts_.prizesWallet.getAddress(), donateAmount_));

			const elapsed_ = 60n;
			const expected_ = expectedCstBidRewardAmount(elapsed_);
			await setNextBlockTimestamp(firstBidTimestamp_ + elapsed_);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			const roundNum_ = await contracts_.cosmicSignatureGameProxy.roundNum();
			await waitForTransactionReceipt(
				contracts_.cosmicSignatureGameProxy.connect(donor_).bidWithEthAndDonateToken(
					(-1), "", expected_, await erc20_.getAddress(), donateAmount_, {value: ethBidPrice_,}
				)
			);
			expect(await contracts_.cosmicSignatureToken.balanceOf(donor_.address)).equal(expected_);
			expect(await erc20_.balanceOf(donor_.address)).equal(0n);
			// Donated tokens are held in a per-round, per-token `DonatedTokenHolder` contract — verify via the wallet getter.
			expect(await contracts_.prizesWallet.getDonatedTokenBalanceAmount(roundNum_, await erc20_.getAddress())).equal(donateAmount_);
		});
	});

	// #endregion
	// #region receive() unprotected

	describe("receive() bare-ETH transfer is unprotected", function () {
		it("sending bare ETH equals bidWithEth(-1, \"\", 0); succeeds even with reward 0", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			// Same-block follow-up via bare ETH transfer: reward 0, but no minLimit, so no revert.
			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			try {
				const tx_ = await contracts_.signers[1].sendTransaction({
					to: contracts_.cosmicSignatureGameProxyAddress,
					value: await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(),
				});
				const followUpTx_ = await contracts_.signers[2].sendTransaction({
					to: contracts_.cosmicSignatureGameProxyAddress,
					value: (await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice()) * 2n,
				});
				await hre.ethers.provider.send("evm_mine");
				await tx_.wait();
				await followUpTx_.wait();
			} finally {
				await hre.ethers.provider.send("evm_setAutomine", [true,]);
			}
			expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(contracts_.signers[2].address);
			// Second bidder got 0 CST since they bid in the same block as the first.
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address)).equal(0n);
		});
	});

	// #endregion
	// #region Revert reason fidelity

	describe("revert reason fidelity", function () {
		it("emits exactly the CstBidRewardMinLimitNotReached error with correct args, not a generic revert", async function () {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

			const elapsed_ = 60n;
			const expected_ = expectedCstBidRewardAmount(elapsed_);
			const minLimit_ = expected_ + 12345n;
			await setNextBlockTimestamp(firstBidTimestamp_ + elapsed_);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			await expect(
				contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth((-1), "", minLimit_, {value: ethBidPrice_,})
			).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CstBidRewardMinLimitNotReached")
				.withArgs(expected_, minLimit_);
		});
	});

	// #endregion
});
