// #region

"use strict";

// #endregion
// #region Imports

const { expect } = require("chai");
const hre = require("hardhat");
const { SECONDS_PER_DAY } = require("../../../src/CosmicSignatureConstants.js");
const { upgradeGameToV2, assertDefaultGameV2Initialization, expectUnknownSelector } = require("../GameV2UpgradeTestHelpers.js");
const { upgradeGameToV3, assertDefaultGameV3Initialization } = require("../GameV3UpgradeTestHelpers.js");

// #endregion
// #region Snapshot

/** Carried-over V1 getters that must be bit-for-bit identical across the upgrade (except intentional changes). */
const CARRIED_OVER_GETTERS = [
	"roundNum",
	"roundActivationTime",
	"delayDurationBeforeRoundActivation",
	"mainPrizeTime",
	"mainPrizeTimeIncrementInMicroSeconds",
	"mainPrizeTimeIncrementIncreaseDivisor",
	"initialDurationUntilMainPrizeDivisor",
	"lastBidderAddress",
	"lastCstBidderAddress",
	"enduranceChampionAddress",
	"enduranceChampionStartTimeStamp",
	"enduranceChampionDuration",
	"prevEnduranceChampionDuration",
	"chronoWarriorAddress",
	"chronoWarriorDuration",
	"ethDutchAuctionBeginningBidPrice",
	"ethDutchAuctionEndingBidPriceDivisor",
	"ethDutchAuctionDurationDivisor",
	"nextEthBidPrice",
	"ethBidPriceIncreaseDivisor",
	"ethBidRefundAmountInGasToSwallowMaxLimit",
	"cstDutchAuctionBeginningTimeStamp",
	"cstDutchAuctionBeginningBidPrice",
	"nextRoundFirstCstDutchAuctionBeginningBidPrice",
	"cstDutchAuctionBeginningBidPriceMinLimit",
	"bidMessageLengthMaxLimit",
	"cstPrizeAmount",
	"chronoWarriorEthPrizeAmountPercentage",
	"raffleTotalEthPrizeAmountForBiddersPercentage",
	"numRaffleEthPrizesForBidders",
	"numRaffleCosmicSignatureNftsForBidders",
	"numRaffleCosmicSignatureNftsForRandomWalkNftStakers",
	"cosmicSignatureNftStakingTotalEthRewardAmountPercentage",
	"mainEthPrizeAmountPercentage",
	"token",
	"randomWalkNft",
	"nft",
	"prizesWallet",
	"stakingWalletRandomWalkNft",
	"stakingWalletCosmicSignatureNft",
	"marketingWallet",
	"marketingWalletCstContributionAmount",
	"charityAddress",
	"charityEthDonationAmountPercentage",
];

/**
Getters that must survive the V2 -> V3 upgrade unchanged. V3 reinitializes the CST beginning-price
minimum and reward multiplier and overwrites the five ETH prize percentages, while leaving the
vestigial V2 duration fields untouched.
*/
const OVERWRITTEN_GETTERS_ACROSS_V3 = new Set([
	"cstDutchAuctionBeginningBidPriceMinLimit",
	"chronoWarriorEthPrizeAmountPercentage",
	"raffleTotalEthPrizeAmountForBiddersPercentage",
	"cosmicSignatureNftStakingTotalEthRewardAmountPercentage",
	"mainEthPrizeAmountPercentage",
	"charityEthDonationAmountPercentage",
]);
const CARRIED_OVER_GETTERS_ACROSS_V3 = [
	...CARRIED_OVER_GETTERS.filter((getterName_) => ( ! OVERWRITTEN_GETTERS_ACROSS_V3.has(getterName_))),
	"cstDutchAuctionDuration",
	"cstDutchAuctionDurationChangeDivisor",
];

/** Reads all the given getters into a plain object (values stringified for diffing). */
async function snapshotCarriedOverState(game_, getters_ = CARRIED_OVER_GETTERS) {
	const snapshot_ = {};
	for (const getter_ of getters_) {
		const value_ = await game_[getter_]();
		snapshot_[getter_] = (typeof value_ === "string") ? value_.toLowerCase() : value_.toString();
	}
	return snapshot_;
}

// #endregion
// #region Upgrade execution

/**
Performs the real V1 -> V2 UUPS upgrade with full state-diff assertions, then re-binds all
campaign state to the V2 ABI and re-syncs the model.

The caller must have driven the campaign to a round-inactive state with no bid placed yet
(round just claimed or freshly frozen). The model and ledger are already in sync.

@returns {Promise<void>}
*/
async function performGameUpgradeToV2(ctx_) {
	const { engine, model, ledger, contracts } = ctx_;
	const v1Game_ = ctx_.game.contract;
	const prevImplementation_ = await hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);

	// 1. Freeze the round far in the future so `_authorizeUpgrade`'s `_onlyRoundIsInactive` holds.
	const freezeActivation_ = engine.lastTs + 10n * 365n * SECONDS_PER_DAY;
	const freezeResult_ = await engine.execTx({
		signer: contracts.ownerSigner,
		buildTx: (overrides_) => v1Game_.connect(contracts.ownerSigner).setRoundActivationTime(freezeActivation_, overrides_),
	});
	engine.expectOk(freezeResult_, "freeze round before upgrade");
	model.roundActivationTime = freezeActivation_;

	// 2. Snapshot the carried-over state (after the freeze; the upgrade itself must change nothing here).
	const before_ = await snapshotCarriedOverState(v1Game_);
	const gameEthBefore_ = await engine.provider.getBalance(contracts.cosmicSignatureGameProxyAddress);

	// 3. Upgrade negative probes (must fail) before the real upgrade.
	await runV1UpgradeNegativeProbes(ctx_);

	// 4. The real upgrade (UUPS `upgradeToAndCall` + `reinitialize`), via the project helper.
	await upgradeGameToV2(contracts);
	const v2Proxy_ = contracts.cosmicSignatureGameV2Proxy;

	// The upgrade plugin mined its own blocks (new implementation deploy + `upgradeToAndCall` from the owner),
	// outside the engine. Re-sync the clock and the owner's untracked gas cost.
	await engine.resyncTime();
	await ledger.resyncEth(contracts.ownerSigner.address);

	const newImplementation_ = await hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);
	expect(newImplementation_, "implementation address must change after upgrade").to.not.equal(prevImplementation_);

	// 5. Carried-over state must be unchanged.
	const after_ = await snapshotCarriedOverState(v2Proxy_);
	for (const getter_ of CARRIED_OVER_GETTERS) {
		expect(after_[getter_], `carried-over state '${getter_}' changed across upgrade`).to.equal(before_[getter_]);
	}
	expect(await engine.provider.getBalance(contracts.cosmicSignatureGameProxyAddress), "game ETH balance changed across upgrade").to.equal(gameEthBefore_);

	// 6. V2 initialization values.
	await assertDefaultGameV2Initialization(v2Proxy_);

	// 7. Dead V1 selectors must revert as unknown.
	await expectUnknownSelector(v2Proxy_, hre.ethers.id("cstDutchAuctionDurationDivisor()").slice(0, 10));
	await expectUnknownSelector(v2Proxy_, hre.ethers.id("bidCstRewardAmount()").slice(0, 10));
	await expectUnknownSelector(v2Proxy_, hre.ethers.id("initialize(address)").slice(0, 10));
	await expectUnknownSelector(v2Proxy_, hre.ethers.id("bidWithEth(int256,string)").slice(0, 10));
	await expectUnknownSelector(v2Proxy_, hre.ethers.id("setCstDutchAuctionDurationDivisor(uint256)").slice(0, 10));
	await expectUnknownSelector(v2Proxy_, hre.ethers.id("setBidCstRewardAmount(uint256)").slice(0, 10));

	// 8. Double `reinitialize` must revert. In a production build the `reinitializer(2)` guard throws
	// `InvalidInitialization`; in an assert-enabled build the `_onlyIfPrevVersionWasInitialized` assert
	// (which checks `_getInitializedVersion() == 1`) fires first as a panic. Accept either.
	const doubleReinitializeResult_ = await engine.execTx({
		signer: contracts.ownerSigner,
		buildTx: (overrides_) => v2Proxy_.connect(contracts.ownerSigner).reinitialize(overrides_),
	});
	expect(doubleReinitializeResult_.ok, "reinitialize must revert").to.equal(false);
	expect(
		doubleReinitializeResult_.revert.name === "InvalidInitialization" || doubleReinitializeResult_.revert.kind === "panic",
		`reinitialize reverted with unexpected error: ${doubleReinitializeResult_.revert.name}`
	).to.equal(true);

	// 9. Re-bind campaign state to the V2 ABI and re-sync the model.
	ctx_.rebindGame(v2Proxy_, 2);
	model.applyUpgradeToV2();

	const stats_ = engine._statsFor("upgradeGameToV2");
	++ stats_.attempted;
	++ stats_.succeeded;
}

// #endregion
// #region V2 -> V3 upgrade execution

/**
Performs the real V2 -> V3 UUPS upgrade with full state-diff assertions, then re-binds all
campaign state to the V3 ABI and re-syncs the model. Mirrors `performGameUpgradeToV2`.

The caller must have driven the campaign to a round-inactive state with no bid placed yet.
The round is left FROZEN (activation far in the future); the caller re-activates it.

@returns {Promise<void>}
*/
async function performGameUpgradeToV3(ctx_) {
	const { engine, model, ledger, contracts } = ctx_;
	const v2Game_ = ctx_.game.contract;
	const prevImplementation_ = await hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);

	// 1. Freeze the round far in the future so `_authorizeUpgrade`'s `_onlyRoundIsInactive` holds.
	const freezeActivation_ = engine.lastTs + 10n * 365n * SECONDS_PER_DAY;
	const freezeResult_ = await engine.execTx({
		signer: contracts.ownerSigner,
		buildTx: (overrides_) => v2Game_.connect(contracts.ownerSigner).setRoundActivationTime(freezeActivation_, overrides_),
	});
	engine.expectOk(freezeResult_, "freeze round before V3 upgrade");
	model.roundActivationTime = freezeActivation_;

	// 2. Snapshot the carried-over state (V1 getters + the V2 parameters).
	const before_ = await snapshotCarriedOverState(v2Game_, CARRIED_OVER_GETTERS_ACROSS_V3);
	const roundZeroNumBids_ = await v2Game_.getTotalNumBids(0n);
	const gameEthBefore_ = await engine.provider.getBalance(contracts.cosmicSignatureGameProxyAddress);

	// 3. Upgrade negative probes (must fail) before the real upgrade.
	{
		// Non-owner cannot upgrade.
		const attacker_ = ctx_.actors[0].signer;
		const dummyImpl_ = contracts.cosmicSignatureGameImplementationAddress;
		const result_ = await engine.execTx({
			signer: attacker_,
			buildTx: (overrides_) => v2Game_.connect(attacker_).upgradeToAndCall(dummyImpl_, "0x", overrides_),
		});
		expect(result_.ok, "non-owner V3 upgrade must revert").to.equal(false);
		expect(["OwnableUnauthorizedAccount"].includes(result_.revert.name), `non-owner V3 upgrade wrong error: ${result_.revert.name}`).to.equal(true);

		// The new V3 getters do not exist on V2 yet.
		await expectUnknownSelector(v2Game_, hre.ethers.id("roundLateBidDurationDivisor()").slice(0, 10));
		await expectUnknownSelector(v2Game_, hre.ethers.id("cstBidPriceDeclineMultiplier()").slice(0, 10));
		await expectUnknownSelector(v2Game_, hre.ethers.id("cstBidPriceDeclineMultiplierChangeDivisor()").slice(0, 10));
		await expectUnknownSelector(v2Game_, hre.ethers.id("mainPrizeNumCosmicSignatureNfts()").slice(0, 10));
		await expectUnknownSelector(v2Game_, hre.ethers.id("getRoundLateBidDuration()").slice(0, 10));
	}

	// 4. The real upgrade (UUPS `upgradeToAndCall` + `reinitialize`), via the project helper.
	await upgradeGameToV3(contracts);
	const v3Proxy_ = contracts.cosmicSignatureGameV3Proxy;

	// The upgrade plugin mined its own blocks outside the engine; re-sync the clock and the owner's gas.
	await engine.resyncTime();
	await ledger.resyncEth(contracts.ownerSigner.address);

	const newImplementation_ = await hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);
	expect(newImplementation_, "implementation address must change after the V3 upgrade").to.not.equal(prevImplementation_);

	// 5. Remaining carried-over state (including the vestigial V2 parameters) must be unchanged.
	const after_ = await snapshotCarriedOverState(v3Proxy_, CARRIED_OVER_GETTERS_ACROSS_V3);
	for (const getter_ of CARRIED_OVER_GETTERS_ACROSS_V3) {
		expect(after_[getter_], `carried-over state '${getter_}' changed across the V3 upgrade`).to.equal(before_[getter_]);
	}
	expect(await engine.provider.getBalance(contracts.cosmicSignatureGameProxyAddress), "game ETH balance changed across the V3 upgrade").to.equal(gameEthBefore_);

	// 6. V3 initialization values.
	await assertDefaultGameV3Initialization(v3Proxy_);

	// 7. V3 exposes the historical bid count through roundStats instead of the V2 getter.
	expect((await v3Proxy_.roundStats(0n)).numBids).to.equal(roundZeroNumBids_);
	await expect(v2Game_.getTotalNumBids(0n)).revertedWithoutReason();
	expect(await v3Proxy_.getBidCstRewardAmount()).to.be.greaterThanOrEqual(0n);

	// 8. Double `reinitialize` must revert. In a production build the `reinitializer(3)` guard throws
	// `InvalidInitialization`; in an assert-enabled build the `_onlyIfPrevVersionWasInitialized` assert
	// (which checks `_getInitializedVersion() == 2`) fires first as a panic. Accept either.
	const doubleReinitializeResult_ = await engine.execTx({
		signer: contracts.ownerSigner,
		buildTx: (overrides_) => v3Proxy_.connect(contracts.ownerSigner).reinitialize(overrides_),
	});
	expect(doubleReinitializeResult_.ok, "V3 reinitialize must revert").to.equal(false);
	expect(
		doubleReinitializeResult_.revert.name === "InvalidInitialization" || doubleReinitializeResult_.revert.kind === "panic",
		`V3 reinitialize reverted with unexpected error: ${doubleReinitializeResult_.revert.name}`
	).to.equal(true);

	// 9. Re-bind campaign state to the V3 ABI and re-sync the model.
	ctx_.rebindGame(v3Proxy_, 3);
	model.applyUpgradeToV3();

	const stats_ = engine._statsFor("upgradeGameToV3");
	++ stats_.attempted;
	++ stats_.succeeded;
}

// #endregion
// #region Upgrade negative probes

/** Probes that must revert while still on V1 (run just before the real upgrade). */
async function runV1UpgradeNegativeProbes(ctx_) {
	const { engine, contracts } = ctx_;
	const game_ = ctx_.game.contract;

	// Non-owner cannot upgrade.
	{
		const attacker_ = ctx_.actors[0].signer;
		const dummyImpl_ = contracts.cosmicSignatureGameImplementationAddress;
		const result_ = await engine.execTx({
			signer: attacker_,
			buildTx: (overrides_) => game_.connect(attacker_).upgradeToAndCall(dummyImpl_, "0x", overrides_),
		});
		expect(result_.ok, "non-owner upgrade must revert").to.equal(false);
		expect(["OwnableUnauthorizedAccount"].includes(result_.revert.name), `non-owner upgrade wrong error: ${result_.revert.name}`).to.equal(true);
	}

	// `reinitialize()` does not exist on V1 yet, so it must revert as an unknown selector (no reason data).
	await expectUnknownSelector(game_, hre.ethers.id("reinitialize()").slice(0, 10));
}

/**
Upgrade negative probes valid in either phase (used by the action registry as a probe).
On V2, attempting a non-owner upgrade still reverts with `OwnableUnauthorizedAccount`.
*/
async function upgradeAuthProbe(ctx_, actor_) {
	const { engine, contracts } = ctx_;
	const game_ = ctx_.game.contract;
	const dummyImpl_ = contracts.cosmicSignatureGameImplementationAddress;
	const result_ = await engine.execTx({
		signer: actor_.signer,
		buildTx: (overrides_) => game_.connect(actor_.signer).upgradeToAndCall(dummyImpl_, "0x", overrides_),
	});
	expect(result_.ok, "non-owner upgrade must revert").to.equal(false);
	expect(["OwnableUnauthorizedAccount"].includes(result_.revert.name), `non-owner upgrade wrong error: ${result_.revert.name}`).to.equal(true);
	return `revert:${result_.revert.name}`;
}

// #endregion

module.exports = {
	CARRIED_OVER_GETTERS,
	CARRIED_OVER_GETTERS_ACROSS_V3,
	snapshotCarriedOverState,
	performGameUpgradeToV2,
	performGameUpgradeToV3,
	upgradeAuthProbe,
};
