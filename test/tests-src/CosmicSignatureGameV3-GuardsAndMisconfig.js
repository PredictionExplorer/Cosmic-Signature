"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { ENABLE_ASSERTS, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	activateCurrentRound,
	completeRoundZero,
	upgradeToV2,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	assertDefaultV3Initialization,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
} = require("../src/V3UpgradeTestHelpers.js");

describe("CosmicSignatureGameV3-GuardsAndMisconfig", function () {
	it("documents that roundNum > 0 is assert-only in reinitialize, through the whole V1 -> V2 -> V3 chain", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);
		expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(0n);

		if (ENABLE_ASSERTS) {
			// The chain already stops at the V2 upgrade (`_onlyNonFirstRound` fires); V3 is unreachable at round 0.
			const cosmicSignatureGameV2Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
			await expect(
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV2Factory_,
					{ kind: "uups", call: "reinitialize" }
				)
			).revertedWithPanic(0x1);
		} else {
			// In a production build, nothing stops upgrading all the way to V3 at round 0,
			// which leaves the game with a broken zero ETH bid price.
			await upgradeToV2(contracts_);
			await upgradeToV3(contracts_);
			const gameV3_ = contracts_.cosmicSignatureGameV3Proxy;
			expect(await gameV3_.roundNum()).equal(0n);
			await assertDefaultV3Initialization(gameV3_);
			expect(await gameV3_.getNextEthBidPrice()).equal(0n);
		}
	});

	it("documents that a skipped V2 reinitialize is caught only by the V3 assert", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		await completeRoundZero(contracts_);

		// Upgrade to V2 WITHOUT calling `reinitialize`, so the initialized version stays at 1
		// and the repurposed V2 slots keep their raw V1 values.
		await upgradeToV2(contracts_, { call: undefined });
		const gameV2_ = contracts_.cosmicSignatureGameV2Proxy;
		const rawCstDutchAuctionDurationSlotValue_ = await gameV2_.cstDutchAuctionDuration();
		expect(rawCstDutchAuctionDurationSlotValue_).not.equal(12n * 60n * 60n);

		const cosmicSignatureGameV3Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
		if (ENABLE_ASSERTS) {
			// `CosmicSignatureGameV3._checkIfPrevVersionWasInitialized` asserts `_getInitializedVersion() == 2`.
			await expect(
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV3Factory_,
					{ kind: "uups", call: "reinitialize" }
				)
			).revertedWithPanic(0x1);
		} else {
			// In a production build, `reinitializer(3)` accepts jumping from version 1, so the V3 upgrade
			// succeeds while the V2 parameters were never initialized (the raw V1 slot values leak through).
			await upgradeToV3(contracts_);
			const gameV3_ = contracts_.cosmicSignatureGameV3Proxy;
			await assertDefaultV3Initialization(gameV3_);
			expect(await gameV3_.cstDutchAuctionDuration()).equal(rawCstDutchAuctionDurationSlotValue_);
		}
	});

	it("documents that mainPrizeNumCosmicSignatureNfts = 0 owner misconfiguration bricks claimMainPrize", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setMainPrizeNumCosmicSignatureNfts(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[2];
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "count misconfigured to zero", 0n, {value: 10n ** 18n,}));

		// Once a bid exists, the owner can no longer fix the parameter or upgrade (the round is active),
		// and every claim reverts with a checked-arithmetic underflow panic: the game is bricked.
		await expect(game_.connect(contracts_.ownerSigner).setMainPrizeNumCosmicSignatureNfts(3n))
			.revertedWithCustomError(game_, "RoundIsActive");

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		await expect(game_.connect(bidder_).claimMainPrize()).revertedWithPanic(0x11);

		// Even the "anyone after a timeout" claim path stays bricked.
		const timeoutClaimTime_ = (await game_.mainPrizeTime()) + (await game_.timeoutDurationToClaimMainPrize()) + 1n;
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeoutClaimTime_),]);
		await expect(game_.connect(contracts_.signers[3]).claimMainPrize()).revertedWithPanic(0x11);
	});

	it("documents that bidCstRewardAmountMultiplier = 0 stops rewards without bricking", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[2];
		const bidder2_ = contracts_.signers[3];

		// The derived CST floor and the reward-per-increment views are 0.
		expect(await game_.getCstDutchAuctionBeginningBidPriceMinLimit()).equal(0n);
		expect(await game_.getBidCstRewardAmountPerMainPrizeTimeIncrement()).equal(0n);

		// Bidding keeps working; no CST is ever minted.
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
		const cstBidPriceAtFirstBid_ = await game_.getNextCstBidPrice();
		await waitForTransactionReceipt(
			game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: await game_.getNextEthBidPriceAdvanced(1n),})
		);
		expect(await token_.balanceOf(bidder1_.address)).equal(0n);
		expect(await token_.balanceOf(bidder2_.address)).equal(0n);

		// With a zero accrual rate, the wage-rate decline degenerates, so the price declines over the
		// duration max limit instead (Comment-202607170), and the emergent-duration view reports that limit.
		expect(cstBidPriceAtFirstBid_).greaterThan(0n);
		{
			const durationMaxLimit_ =
				12n * (await game_.mainPrizeTimeIncrementInMicroSeconds()) / 1_000_000n;
			expect((await game_.getCstDutchAuctionDurations())[0]).equal(durationMaxLimit_);
			const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const latestTimeStamp_ = await hre.ethers.provider.getBlock("latest").then((block_) => BigInt(block_.timestamp));
			const sampleOffset_ = 600n;
			const remainingDuration_ = durationMaxLimit_ - (latestTimeStamp_ + sampleOffset_ - beginningTimeStamp_);
			expect(await game_.getNextCstBidPriceAdvanced(sampleOffset_))
				.equal(cstBidPriceAtFirstBid_ * remainingDuration_ / durationMaxLimit_);
		}

		// A CST bid burns the price and mints nothing; with the floor at 0, the next auction begins at 2x the paid price.
		// (Skipped here: the bidders hold no CST at a zero rate. A free bid after the max limit still works.)
		{
			const beginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const durationMaxLimit_ = (await game_.getCstDutchAuctionDurations())[0];
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(beginningTimeStamp_ + durationMaxLimit_),]);
			await waitForTransactionReceipt(game_.connect(bidder1_).bidWithCst(0n, "", 0n));
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(0n);
			expect(await token_.balanceOf(bidder1_.address)).equal(0n);
		}

		// The claim works, after which the owner can repair the parameter.
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		await waitForTransactionReceipt(game_.connect(bidder1_).claimMainPrize());
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(6n * 10n ** 25n)
		);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		expect(await game_.getBidCstRewardAmountPerMainPrizeTimeIncrement()).greaterThan(0n);
	});

	it("documents that roundLateBidDurationDivisor = 0 owner misconfiguration freezes bidding until the claim", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundLateBidDurationDivisor(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		// The first bid of the round does not evaluate the premium (there is no last bidder), so it works.
		const bidder_ = contracts_.signers[2];
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "divisor misconfigured to zero", 0n, {value: 10n ** 18n,}));

		// From now on, every price view and every further bid panics with a division by zero.
		await expect(game_.getNextEthBidPrice()).revertedWithPanic(0x12);
		await expect(game_.getNextCstBidPrice()).revertedWithPanic(0x12);
		await expect(game_.getRoundLateBidDuration()).revertedWithPanic(0x12);
		await expect(game_.connect(contracts_.signers[3]).bidWithEth(-1n, "", 0n, {value: 10n ** 19n,}))
			.revertedWithPanic(0x12);
		await expect(game_.connect(bidder_).bidWithCst((1n << 255n), "", 0n)).revertedWithPanic(0x12);

		// The claim does not price bids, so the round still completes, after which the owner can repair the parameter.
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundLateBidDurationDivisor(3_000_000n));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		expect(await game_.getNextEthBidPrice()).greaterThan(0n);
	});
});
