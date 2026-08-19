"use strict";

// #region Imports

const { expect } = require("chai");
const hre = require("hardhat");
const { ENABLE_ASSERTS } = require("../../../src/Helpers.js");
const {
	upgradeToV2,
	assertDefaultV2Initialization,
	expectUnknownSelector,
} = require("../V2UpgradeTestHelpers.js");
const {
	upgradeToV3,
	assertDefaultV3Initialization,
} = require("../V3UpgradeTestHelpers.js");

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
Getters that must survive the V2 -> V3 upgrade unchanged.
The V3 `reinitialize` re-initializes `cstDutchAuctionBeginningBidPriceMinLimit` and
`bidCstRewardAmountMultiplier`, and overwrites the five ETH prize percentages,
so those values are excluded here and asserted by `assertDefaultV3Initialization` instead.
The V2 parameters `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor`
are NOT re-initialized (Comment-202608301): they keep their live V2 values,
and V3 keeps using them exactly like V2 did.
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
async function performUpgradeToV2(ctx_) {
	const { engine, model, ledger, contracts } = ctx_;
	const v1Game_ = ctx_.game.contract;
	const prevImplementation_ = await hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);

	// 1. Freeze the round far in the future so `_authorizeUpgrade`'s `_onlyRoundIsInactive` holds.
	const freezeActivation_ = engine.lastTs + 10n * 365n * 86_400n;
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
	await upgradeToV2(contracts);
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
	await assertDefaultV2Initialization(v2Proxy_);

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

	const stats_ = engine._statsFor("upgradeToV2");
	++ stats_.attempted;
	++ stats_.succeeded;
}

// #endregion
// #region V2 -> V3 upgrade execution

/**
Performs the real V2 -> V3 UUPS upgrade with full state-diff assertions, then re-binds all
campaign state to the V3 ABI and re-syncs the model. Mirrors `performUpgradeToV2`.

The caller must have driven the campaign to a round-inactive state with no bid placed yet.
The round is left FROZEN (activation far in the future); the caller re-activates it.

@returns {Promise<void>}
*/
async function performUpgradeToV3(ctx_) {
	const { engine, model, ledger, contracts } = ctx_;
	const v2Game_ = ctx_.game.contract;
	const prevImplementation_ = await hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);

	// 1. Freeze the round far in the future so `_authorizeUpgrade`'s `_onlyRoundIsInactive` holds.
	const freezeActivation_ = engine.lastTs + 10n * 365n * 86_400n;
	const freezeResult_ = await engine.execTx({
		signer: contracts.ownerSigner,
		buildTx: (overrides_) => v2Game_.connect(contracts.ownerSigner).setRoundActivationTime(freezeActivation_, overrides_),
	});
	engine.expectOk(freezeResult_, "freeze round before V3 upgrade");
	model.roundActivationTime = freezeActivation_;

	// 2. Snapshot the carried-over state (V1 getters + the V2 parameters).
	const before_ = await snapshotCarriedOverState(v2Game_, CARRIED_OVER_GETTERS_ACROSS_V3);
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
		await expectUnknownSelector(v2Game_, hre.ethers.id("mainPrizeNumCosmicSignatureNfts()").slice(0, 10));
		await expectUnknownSelector(v2Game_, hre.ethers.id("getRoundLateBidDuration()").slice(0, 10));
	}

	// 4. The real upgrade (UUPS `upgradeToAndCall` + `reinitialize`), via the project helper.
	await upgradeToV3(contracts);
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
	await assertDefaultV3Initialization(v3Proxy_);

	// 7. V3 removes no selectors; a representative V2 view must still work.
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

	const stats_ = engine._statsFor("upgradeToV3");
	++ stats_.attempted;
	++ stats_.succeeded;
}

// #endregion
// #region Post-V3 PrizesWallet swap

/**
Drains the current `PrizesWallet` (time-warping past every round's withdrawal timeout, so anybody
may withdraw/claim everything), then deploys a fresh `PrizesWallet` and points the game at it via
`setPrizesWallet`, re-wiring the harness (contracts, ledger, model, actor approvals).

Must run while the round is FROZEN (right after `performUpgradeToV3`), before re-activation.

Skipped in assert-enabled builds: `PrizesWallet.registerRoundEndAndDepositEthMany` asserts that
the previous round is registered (`mainPrizeBeneficiaryAddresses[roundNum - 1] != 0`), which can
never hold for a wallet deployed mid-campaign, so every claim would panic (the
"Swapping to a fresh PrizesWallet" test documents this).

@returns {Promise<boolean>} Whether the swap was performed.
*/
async function performPrizesWalletSwap(ctx_) {
	const { engine, model, ledger, contracts } = ctx_;

	if (ENABLE_ASSERTS) {
		console.info("  >>> Skipping the PrizesWallet swap (assert-enabled build) <<<");
		return false;
	}
	// The richest actor drains the wallet (the ETH drains accrue to it, so it stays solvent throughout).
	const caller_ = [...ctx_.actors]
		.sort((a_, b_) => {
			const wealthA_ = ledger.expectedEth(a_.address);
			const wealthB_ = ledger.expectedEth(b_.address);
			return (wealthB_ > wealthA_) ? 1 : (wealthB_ < wealthA_) ? -1 : 0;
		})
		.find((actor_) => engine.canAfford(actor_.address, 0n));
	if (caller_ === undefined) {
		console.info("  >>> Skipping the PrizesWallet swap (no actor can afford gas) <<<");
		return false;
	}

	// 1. Warp past every round's withdrawal timeout, so anybody may drain everything.
	{
		let maxTimeout_ = 0n;
		for (const timeout_ of ledger.prizesWallet.roundTimeouts.values()) {
			if (timeout_ > maxTimeout_) {
				maxTimeout_ = timeout_;
			}
		}
		if (maxTimeout_ > engine.lastTs) {
			await engine.mineAt(maxTimeout_ + 1n);
		}
	}

	// 2. Withdraw every tracked ETH prize (the ETH goes to the caller, not the winner, after the timeout).
	for (const [key_, amount_] of [...ledger.prizesWallet.ethBalances]) {
		if (amount_ <= 0n) {
			continue;
		}
		const [roundStr_, winner_] = key_.split("|");
		const result_ = await engine.execTx({
			signer: caller_.signer,
			buildTx: (overrides_) =>
				contracts.prizesWallet.connect(caller_.signer).getFunction("withdrawEth(uint256,address)")(BigInt(roundStr_), winner_, overrides_),
		});
		engine.expectOk(result_, "PrizesWallet swap: drain ETH prize");
		ledger.addEth(caller_.address, amount_);
		ledger.addEth(contracts.prizesWalletAddress, -amount_);
	}

	// 3. Claim every remaining donated mock ERC-20 balance (amount 0 == the full balance).
	for (const [roundStr_, amount_] of [...ledger.prizesWallet.donatedMockErc20]) {
		if (amount_ <= 0n) {
			continue;
		}
		const result_ = await engine.execTx({
			signer: caller_.signer,
			buildTx: (overrides_) =>
				contracts.prizesWallet.connect(caller_.signer).claimDonatedToken(BigInt(roundStr_), contracts.fuzzTestMockErc20Address, 0n, overrides_),
		});
		engine.expectOk(result_, "PrizesWallet swap: drain donated ERC-20");
	}

	// 4. Claim every unclaimed donated NFT.
	for (const [indexStr_, record_] of [...ledger.prizesWallet.donatedNfts]) {
		if (record_.claimed) {
			continue;
		}
		const result_ = await engine.execTx({
			signer: caller_.signer,
			buildTx: (overrides_) => contracts.prizesWallet.connect(caller_.signer).claimDonatedNft(BigInt(indexStr_), overrides_),
		});
		engine.expectOk(result_, "PrizesWallet swap: drain donated NFT");
	}

	// 5. The old wallet must now be empty.
	expect(ledger.prizesWalletEthTotal(), "PrizesWallet swap: ledger obligations remain").to.equal(0n);
	expect(await engine.provider.getBalance(contracts.prizesWalletAddress), "PrizesWallet swap: the old wallet still holds ETH").to.equal(0n);
	await ledger.verifyDirtyEth();

	// 6. Deploy the fresh wallet (owned by the game like the original; ownership goes to the owner signer).
	const newPrizesWallet_ = await contracts.prizesWalletFactory.deploy(contracts.cosmicSignatureGameProxyAddress);
	await newPrizesWallet_.waitForDeployment();
	const newPrizesWalletAddress_ = await newPrizesWallet_.getAddress();
	// The deployment was mined outside the engine; re-sync the clock and the deployer's gas.
	await engine.resyncTime();
	await ledger.resyncEth(contracts.deployerSigner.address);
	{
		const result_ = await engine.execTx({
			signer: contracts.deployerSigner,
			buildTx: (overrides_) => newPrizesWallet_.connect(contracts.deployerSigner).transferOwnership(contracts.ownerSigner.address, overrides_),
		});
		engine.expectOk(result_, "PrizesWallet swap: transferOwnership");
	}

	// 7. Point the game at the fresh wallet.
	{
		const result_ = await engine.execTx({
			signer: contracts.ownerSigner,
			buildTx: (overrides_) => ctx_.game.contract.connect(contracts.ownerSigner).setPrizesWallet(newPrizesWalletAddress_, overrides_),
		});
		const receipt_ = engine.expectOk(result_, "PrizesWallet swap: setPrizesWallet");
		const changed_ = engine.singleEvent(receipt_, ctx_.game.contract, "PrizesWalletAddressChanged", "PrizesWallet swap");
		expect(changed_.args[0].toLowerCase()).to.equal(newPrizesWalletAddress_.toLowerCase());
		expect((await ctx_.game.contract.prizesWallet()).toLowerCase()).to.equal(newPrizesWalletAddress_.toLowerCase());
	}

	// 8. Re-wire the harness: contracts, ledger (fresh sub-ledger + event routing), model, actor approvals.
	const oldPrizesWalletAddress_ = contracts.prizesWalletAddress;
	contracts.oldPrizesWallets = [...(contracts.oldPrizesWallets ?? []), { contract: contracts.prizesWallet, address: oldPrizesWalletAddress_ }];
	contracts.prizesWallet = newPrizesWallet_;
	contracts.prizesWalletAddress = newPrizesWalletAddress_;
	ledger.swapPrizesWallet(newPrizesWalletAddress_, newPrizesWallet_.interface);
	await ledger.trackEth(newPrizesWalletAddress_, "prizesWallet2");
	model.prizesWalletAddress = newPrizesWalletAddress_.toLowerCase();
	for (const actor_ of ctx_.actors) {
		// The mock donation approvals were granted to the old wallet; they must be granted anew.
		actor_.mockErc20Approved = false;
		actor_.mockNftApproved = false;
	}
	await ledger.verifyDirtyEth();

	const stats_ = engine._statsFor("prizesWalletSwap");
	++ stats_.attempted;
	++ stats_.succeeded;
	return true;
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
	performUpgradeToV2,
	performUpgradeToV3,
	performPrizesWalletSwap,
	upgradeAuthProbe,
};
