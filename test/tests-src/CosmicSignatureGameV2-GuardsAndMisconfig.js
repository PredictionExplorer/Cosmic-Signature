"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { ENABLE_ASSERTS, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	activateCurrentRound,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	getLatestBlockTimestamp,
	mineAtOrAfter,
	upgradeToV2,
} = require("../src/V2UpgradeTestHelpers.js");

describe("CosmicSignatureGameV2-GuardsAndMisconfig", function () {
	it("documents that roundNum > 0 is assert-only in initializeV2", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);
		expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(0n);
		const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);

		if (ENABLE_ASSERTS) {
			await expect(
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					factory_,
					{ kind: "uups", call: "initializeV2" }
				)
			).revertedWithPanic(0x1);
		} else {
			await upgradeToV2(contracts_);
			expect(await contracts_.cosmicSignatureGameV2Proxy.roundNum()).equal(0n);
			expect(await contracts_.cosmicSignatureGameV2Proxy.getNextEthBidPrice()).equal(0n);
		}
	});

	it("covers V2 pre-bid round-state and bidding guard paths", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;

		expect(await game_.getDurationUntilRoundActivation()).greaterThan(0n);
		expect(await game_.getDurationUntilMainPrize()).equal(0n);
		await expect(game_.connect(contracts_.signers[2]).bidWithEth(-1n, "inactive", 0n, { value: 10n ** 18n }))
			.revertedWithCustomError(game_, "RoundIsInactive");

		await activateCurrentRound(game_, contracts_.ownerSigner);
		await mineAtOrAfter(await game_.roundActivationTime());
		expect(await game_.getDurationUntilRoundActivation()).lessThanOrEqual(0n);

		await expect(game_.connect(contracts_.signers[2]).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
		await expect(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(game_, "InvalidOperationInCurrentState");
		await expect(game_.connect(contracts_.signers[2]).bidWithCst(hre.ethers.MaxUint256, "first cst", 0n))
			.revertedWithCustomError(game_, "WrongBidType");

		const bidder_ = contracts_.signers[2];
		const ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "first eth", 0n, { value: ethPrice_ }));
		await expect(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(game_, "BidHasBeenPlacedInCurrentRound");
		expect(await game_.getDurationUntilMainPrize()).greaterThan(0n);
	});

	it("documents zero CST duration owner misconfiguration", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		expect(await game_.getNextCstBidPrice()).equal(0n);
		await expect(game_.getNextCstBidPriceAdvanced( - (await getLatestBlockTimestamp()) - 1n )).revertedWithPanic(0x12);
	});

	// // This tests Comment-202607016.
	// it("raises the V2 next-round first CST price when the owner raises the CST minimum", async function () {
	// 	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
	// 	const game_ = contracts_.cosmicSignatureGameV2Proxy;
	// 	const newMinLimit_ = 300n * 10n ** 18n;
	// 	await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionBeginningBidPriceMinLimit(newMinLimit_));
	// 	expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(newMinLimit_);
	// 	expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(newMinLimit_);
	// 	
	// 	await activateCurrentRound(game_, contracts_.ownerSigner);
	// 	const bidder_ = contracts_.signers[2];
	// 	const ethPrice_ = await game_.getNextEthBidPrice();
	// 	await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "raised cst min", 0n, {value: ethPrice_,}));
	// 	expect(await game_.getNextCstBidPrice()).equal(newMinLimit_);
	// });

	it("documents zero CST duration change divisor owner misconfiguration", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDurationChangeDivisor(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[2];
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
		const ethPrice_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "duration to zero", 0n, { value: ethPrice_ }));
		expect(await game_.cstDutchAuctionDuration()).equal(0n);

		await expect(
			game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "cst duration divisor zero", 0n)
		).revertedWithPanic(0x12);
	});

	it("documents changeDivisor greater than duration as a no-op reduction boundary", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(10n));
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDurationChangeDivisor(100n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[2];
		const before_ = await game_.cstDutchAuctionDuration();
		const ethPrice_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "boundary", 0n, { value: ethPrice_ }));
		const after_ = await game_.cstDutchAuctionDuration();
		expect(after_).equal(before_);
	});
});
