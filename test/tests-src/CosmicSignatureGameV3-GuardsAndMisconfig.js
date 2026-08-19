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
			// The upgrade transaction reverts at `reinitialize`, so zero module addresses are adequate
			// for the implementation deployment here. Comment-202608245 applies.
			await expect(
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV3Factory_,
					{ kind: "uups", call: "reinitialize", constructorArgs: [hre.ethers.ZeroAddress, hre.ethers.ZeroAddress,] }
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

	it("setters whose zero value would brick or freeze the game reject a zero (Comment-202608171)", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const gameForOwner_ = game_.connect(contracts_.ownerSigner);

		// `mainPrizeNumCosmicSignatureNfts == 0` would make every `claimMainPrize` revert with `Panic(0x11)`.
		// Because both this setter and `_authorizeUpgrade` require an inactive round, a round with a bid
		// would be impossible to complete or repair, permanently bricking the game. So the setter rejects a zero.
		await expect(gameForOwner_.setMainPrizeNumCosmicSignatureNfts(0n)).revertedWithCustomError(game_, "ZeroValue");

		// A zero here would make bid pricing and/or bid placement panic with a division by zero
		// until the round completes and the owner repairs the value.
		await expect(gameForOwner_.setRoundLateBidDurationDivisor(0n)).revertedWithCustomError(game_, "ZeroValue");

		// A zero exponent would double every late bid price rather than disable the premium.
		await expect(gameForOwner_.setRoundLateBidPricePremiumAmountExponent(0n)).revertedWithCustomError(game_, "ZeroValue");

		// A zero base multiplier is valid: it disables the late bid price premium.
		await waitForTransactionReceipt(gameForOwner_.setRoundLateBidPricePremiumAmountBaseMultiplier(0n));
		expect(await game_.roundLateBidPricePremiumAmountBaseMultiplier()).equal(0n);

		// A zero reward multiplier is valid: it disables bid CST rewards.
		await waitForTransactionReceipt(gameForOwner_.setBidCstRewardAmountMultiplier(0n));
		expect(await game_.bidCstRewardAmountMultiplier()).equal(0n);

		// Nonzero values keep working, and the game remains fully functional with the premium disabled.
		await waitForTransactionReceipt(gameForOwner_.setMainPrizeNumCosmicSignatureNfts(3n));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder_ = contracts_.signers[2];
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
		expect(await game_.getNextEthBidPrice()).greaterThan(0n);
		expect(await game_.getNextCstBidPrice()).greaterThanOrEqual(0n);
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
	});

	it("the V2 CST Dutch auction duration setters remain fully functional in V3", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const gameForOwner_ = game_.connect(contracts_.ownerSigner);

		// The V3 `reinitialize` deliberately does not touch `cstDutchAuctionDuration` and
		// `cstDutchAuctionDurationChangeDivisor` (Comment-202608301): the live V2 values carry over
		// (no bids were placed on V2 here, so they still hold the V2 initialization values).
		expect(await game_.cstDutchAuctionDuration()).equal(12n * 60n * 60n);
		expect(await game_.cstDutchAuctionDurationChangeDivisor()).equal(250n);

		// The V2 setters keep working in V3 exactly like in V2, emitting the V2 events.
		await expect(gameForOwner_.setCstDutchAuctionDuration(11n * 60n * 60n))
			.emit(game_, "CstDutchAuctionDurationChanged").withArgs(11n * 60n * 60n);
		expect(await game_.cstDutchAuctionDuration()).equal(11n * 60n * 60n);
		await expect(gameForOwner_.setCstDutchAuctionDurationChangeDivisor(300n))
			.emit(game_, "CstDutchAuctionDurationChangeDivisorChanged").withArgs(300n);
		expect(await game_.cstDutchAuctionDurationChangeDivisor()).equal(300n);

		// They remain owner-only.
		await expect(game_.connect(contracts_.signers[1]).setCstDutchAuctionDuration(1n))
			.revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
		await expect(game_.connect(contracts_.signers[1]).setCstDutchAuctionDurationChangeDivisor(1n))
			.revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
	});
});
