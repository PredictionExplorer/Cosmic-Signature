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
	mineAt,
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

	it("documents zero CST duration owner misconfiguration", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		expect(await game_.getNextCstBidPrice()).equal(0n);
		await expect(game_.getNextCstBidPriceAdvanced( - (await getLatestBlockTimestamp()) - 1n )).revertedWithPanic(0x12);
	});

	it("documents zero CST duration change divisor owner misconfiguration", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDurationChangeDivisor(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[2];
		await mineAt((await getLatestBlockTimestamp()) + 60n);
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
