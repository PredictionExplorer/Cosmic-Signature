"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	activateCurrentRound,
	completeRoundZero,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	getLatestBlockTimestamp,
	mineAtOrAfter,
	upgradeToV2,
} = require("../src/V2UpgradeTestHelpers.js");

const SLOT_CST_DURATION_CHANGE_DIVISOR = 307n;

describe("CosmicSignatureGameV2-GuardsAndMisconfig", function () {
	it("enforces roundNum > 0 in initializeV2", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);
		expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(0n);
		const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);

		await expect(
			hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				factory_,
				{ kind: "uups", call: "initializeV2" }
			)
		).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FirstRound");
	});

	it("requires the owner to call initializeV2 if an implementation is upgraded without the initializer call", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		await completeRoundZero(contracts_);
		const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		const gameV2_ = await hre.upgrades.upgradeProxy(
			contracts_.cosmicSignatureGameProxy,
			factory_,
			{ kind: "uups" }
		);

		await expect(gameV2_.connect(contracts_.signers[1]).initializeV2())
			.revertedWithCustomError(gameV2_, "OwnableUnauthorizedAccount");
		await waitForTransactionReceipt(gameV2_.connect(contracts_.ownerSigner).initializeV2());
		expect(await gameV2_.cstDutchAuctionDurationChangeDivisor()).equal(250n);
	});

	it("rejects initializeV2 when the new V2 storage slot is already nonzero", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		await completeRoundZero(contracts_);
		await hre.ethers.provider.send(
			"hardhat_setStorageAt",
			[
				contracts_.cosmicSignatureGameProxyAddress,
				hre.ethers.toBeHex(SLOT_CST_DURATION_CHANGE_DIVISOR, 32),
				hre.ethers.toBeHex(1n, 32),
			]
		);

		await expect(upgradeToV2(contracts_))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidOperationInCurrentState");
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
