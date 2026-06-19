"use strict";

// #region Imports

const { expect } = require("chai");
const { ENABLE_SMTCHECKER } = require("../../../../src/Helpers.js");
const { ZERO_ADDRESS } = require("../GameModel.js");
const { MAX_UINT256 } = require("../../../../src/BigIntMathHelpers.js");
const {
	pickBiddableRandomWalkNft,
	pickStakeableRandomWalkNft,
	pickStakeableCosmicSignatureNft,
	ownedStakeActionIds,
	executeEthBid,
	executeCstBid,
	verifyClaimReceipt,
} = require("./ActionHelpers.js");

// #endregion
// #region Bidding actions

const biddingActions = [
	{
		name: "bidWithEth",
		weight: 22,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "plain", valueMode: "random" }),
	},
	{
		name: "bidWithEthExactPrice",
		weight: 6,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "plain", valueMode: "exact" }),
	},
	{
		name: "bidWithEthSwallow",
		weight: 5,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "plain", valueMode: "swallow" }),
	},
	{
		name: "bidWithEthRefund",
		weight: 5,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "plain", valueMode: "refund" }),
	},
	{
		name: "bidWithEthPlusRandomWalkNft",
		weight: 10,
		isApplicable: (ctx_, actor_) => pickBiddableRandomWalkNft(ctx_, actor_) !== null,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "rwNft", valueMode: "random" }),
	},
	{
		name: "bidWithEthReceive",
		weight: 3,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "receive", valueMode: "exact" }),
	},
	{
		name: "bidWithEthAndDonateToken",
		weight: 4,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "donateToken", valueMode: "random" }),
	},
	{
		name: "bidWithEthAndDonateNft",
		weight: 4,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "donateNft", valueMode: "random" }),
	},
	{
		name: "bidWithEthMinRewardExact",
		weight: 3,
		isApplicable: (ctx_) => ctx_.model.version === 2,
		run: (ctx_, actor_) => executeEthBid(ctx_, actor_, { flavor: "plain", valueMode: "exact", minRewardMode: "exact" }),
	},
	{
		name: "bidWithCst",
		weight: 10,
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_, actor_) => executeCstBid(ctx_, actor_, { flavor: "plain", maxLimitMode: "padded" }),
	},
	{
		name: "bidWithCstExactLimit",
		weight: 4,
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_, actor_) => executeCstBid(ctx_, actor_, { flavor: "plain", maxLimitMode: "exact" }),
	},
	{
		name: "bidWithCstAndDonateToken",
		weight: 3,
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_, actor_) => executeCstBid(ctx_, actor_, { flavor: "donateToken", maxLimitMode: "max" }),
	},
	{
		name: "bidWithCstAndDonateNft",
		weight: 3,
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_, actor_) => executeCstBid(ctx_, actor_, { flavor: "donateNft", maxLimitMode: "max" }),
	},
];

// #endregion
// #region Claim action

/** Collects lowercase owners of currently staked RW NFTs (raffle staker eligibility). */
function currentRandomWalkStakerOwners(ledger_) {
	const owners_ = new Set();
	for (const action_ of ledger_.rwStaking.stakeActions.values()) {
		owners_.add(action_.ownerAddress);
	}
	return owners_;
}

/**
Core claim execution + full verification, shared by the random claim action and forced round completion.
@param {object} ctx_
@param {object} claimer_ Actor performing the claim.
@param {bigint} ts_ Planned claim block timestamp.
*/
async function executeClaim(ctx_, claimer_, ts_) {
	const { engine, model, ledger } = ctx_;
	const rwStakerOwners_ = currentRandomWalkStakerOwners(ledger);
	const gameEthBalanceBefore_ = ledger.expectedEth(ctx_.game.address);
	const numStakedCs_ = ledger.csStaking.numStakedNfts;
	const numStakedRw_ = ledger.rwStaking.numStakedNfts;

	const result_ = await engine.execTx({
		signer: claimer_.signer,
		buildTx: (overrides_) => ctx_.game.connect(claimer_.signer).claimMainPrize(overrides_),
		ts: ts_,
	});
	const receipt_ = engine.expectOk(result_, "claimMainPrize");
	if (receipt_.gasUsed > engine.maxClaimGasUsed) {
		engine.maxClaimGasUsed = receipt_.gasUsed;
	}

	const breakdown_ = model.applyClaim(claimer_.address, ts_, gameEthBalanceBefore_, numStakedCs_, numStakedRw_);
	verifyClaimReceipt(ctx_, { claimerAddress: claimer_.address, receipt: receipt_, breakdown: breakdown_, rwStakerOwnersBefore: rwStakerOwners_ });
	await ledger.verifyDirtyEth();
	if (engine.profile.verbosity >= 2) {
		console.info(`      claimed round ${breakdown_.roundNum} by ${ledger.labelOf(claimer_.address)}; new round ${model.roundNum}`);
	}
	return "ok";
}

/**
Claims the main prize as the last bidder. Times the claim at/after `mainPrizeTime`
(occasionally exactly at the boundary).
*/
async function claimAsLastBidder(ctx_) {
	const { engine, model } = ctx_;
	if (model.lastBidderAddress === ZERO_ADDRESS) {
		return "skip";
	}
	const claimer_ = ctx_.actorByAddress(model.lastBidderAddress);
	if (claimer_ === null) {
		return "skip";
	}
	let ts_ = model.mainPrizeTime;
	if (engine.chancePercent(50)) {
		ts_ = model.mainPrizeTime + engine.randomBigIntRange(0n, 7n * 86_400n);
	}
	return executeClaim(ctx_, claimer_, engine.clampTs(ts_));
}

/**
Claims as a non-last bidder after the claim timeout (mirrors the "anyone after timeout" path).
*/
async function claimAfterTimeout(ctx_) {
	const { engine, model } = ctx_;
	if (model.lastBidderAddress === ZERO_ADDRESS) {
		return "skip";
	}
	const claimer_ = ctx_.pickActorNot(model.lastBidderAddress);
	if (claimer_ === null) {
		return "skip";
	}
	const ts_ = engine.clampTs(model.mainPrizeTime + model.timeoutDurationToClaimMainPrize + engine.randomBigIntRange(1n, 3_600n));
	return executeClaim(ctx_, claimer_, ts_);
}

/**
Comment-202606235 coverage. A malicious/compromised owner sets `delayDurationBeforeRoundActivation` to
`type(uint256).max` mid-round (the setter has no round-state guard, Comment-202503106). On V1 this makes
`block.timestamp + delayDurationBeforeRoundActivation` in `_prepareNextRound` overflow and revert, bricking the
prize. V2 wraps that body in `unchecked`, so the last bidder's claim still succeeds and `roundActivationTime` merely
wraps modulo 2^256. This action drives that exact path through the full claim verification, then restores a sane
	delay so subsequent rounds activate normally (no lock-in). V2-only: V1 inherits the checked
	`MainPrize._prepareNextRound`, where this claim would revert.
*/
async function claimWithOverflowingDelay(ctx_) {
	const { engine, model, ledger } = ctx_;
	if (model.lastBidderAddress === ZERO_ADDRESS) {
		return "skip";
	}
	const claimer_ = ctx_.actorByAddress(model.lastBidderAddress);
	if (claimer_ === null) {
		return "skip";
	}
	const owner_ = ctx_.contracts.ownerSigner;
	const ownerGame_ = ctx_.game.connect(owner_).contract;
	const prevDelay_ = model.delayDurationBeforeRoundActivation;
	const maxDelay_ = MAX_UINT256;

	// Overflow the next-round activation math while a bid is already placed (mid active round).
	const setResult_ = await engine.execTx({
		signer: owner_,
		buildTx: (overrides_) => ownerGame_.setDelayDurationBeforeRoundActivation(maxDelay_, overrides_),
	});
	engine.expectOk(setResult_, "overflowing setDelayDurationBeforeRoundActivation");
	model.delayDurationBeforeRoundActivation = maxDelay_;

	// The last bidder still claims successfully; the unchecked addition wraps instead of reverting.
	let ts_ = model.mainPrizeTime;
	if (engine.chancePercent(50)) {
		ts_ = model.mainPrizeTime + engine.randomBigIntRange(0n, 7n * 86_400n);
	}
	const claimTs_ = engine.clampTs(ts_);
	let outcome_;
	if (ENABLE_SMTCHECKER > 0) {
		const claimResult_ = await engine.execTx({
			signer: claimer_.signer,
			buildTx: (overrides_) => ctx_.game.connect(claimer_.signer).claimMainPrize(overrides_),
			ts: claimTs_,
		});
		expect(claimResult_.ok, "SMTChecker build keeps overflow checked, so this claim must revert").to.equal(false);
		expect(claimResult_.revert.name, "overflowing V2 claim wrong SMTChecker-mode revert").to.equal("Panic(0x11)");
		outcome_ = `revert:${claimResult_.revert.name}`;
	} else {
		outcome_ = await executeClaim(ctx_, claimer_, claimTs_);
	}

	// Restore a sane delay (the setter has no round-state guard) so later rounds activate normally.
	const restoreResult_ = await engine.execTx({
		signer: owner_,
		buildTx: (overrides_) => ownerGame_.setDelayDurationBeforeRoundActivation(prevDelay_, overrides_),
	});
	engine.expectOk(restoreResult_, "restore setDelayDurationBeforeRoundActivation");
	model.delayDurationBeforeRoundActivation = prevDelay_;
	await ledger.verifyDirtyEth();
	return outcome_;
}

/** Actors sorted by current (tracked) ETH balance, richest first. */
function actorsByWealthDesc(ctx_) {
	return [...ctx_.actors].sort((a_, b_) => {
		const ba_ = ctx_.ledger.expectedEth(a_.address);
		const bb_ = ctx_.ledger.expectedEth(b_.address);
		return (bb_ > ba_) ? 1 : (bb_ < ba_) ? -1 : 0;
	});
}

/**
Forces the current round to complete (used at phase boundaries to reach a clean post-claim state).
With finite human budgets, seeds an empty round using the richest actor that can afford the bid, and
claims via an actor that can afford the gas. Returns false if no one can make progress (the caller
then stops the phase) — a graceful, realistic outcome rather than an infinite stall.
@returns {Promise<boolean>} Whether a claim was performed.
*/
async function forceCompleteRound(ctx_) {
	const { engine, model } = ctx_;
	if (model.lastBidderAddress === ZERO_ADDRESS) {
		let seeded_ = false;
		for (const actor_ of actorsByWealthDesc(ctx_)) {
			const bidOutcome_ = await executeEthBid(ctx_, actor_, { flavor: "plain", valueMode: "exact" });
			if (bidOutcome_ === "ok") {
				seeded_ = true;
				break;
			}
		}
		if ( ! seeded_ || model.lastBidderAddress === ZERO_ADDRESS) {
			return false;
		}
	}
	// Prefer the last bidder claiming exactly at `mainPrizeTime`.
	const lastBidder_ = ctx_.actorByAddress(model.lastBidderAddress);
	if (lastBidder_ !== null && engine.canAfford(lastBidder_.address, 0n)) {
		await executeClaim(ctx_, lastBidder_, engine.clampTs(model.mainPrizeTime));
		return true;
	}
	// Fallback: the richest gas-affordable actor claims after the timeout (the "anyone after timeout" path).
	const claimer_ = actorsByWealthDesc(ctx_).find((actor_) => engine.canAfford(actor_.address, 0n));
	if (claimer_ === undefined) {
		return false;
	}
	const ts_ = engine.clampTs(model.mainPrizeTime + model.timeoutDurationToClaimMainPrize + 1n);
	await executeClaim(ctx_, claimer_, ts_);
	return true;
}

/**
Same-block claim contention: the eligible last bidder and a second actor both submit `claimMainPrize`
in one block. Only the first (FIFO) succeeds and ends the round; the second must revert (the round has
already advanced, so it sees no bids). Exercises the main prize's same-block exclusivity.
@returns {Promise<boolean>} Whether the race ran (and the winning claim was applied).
*/
async function runClaimRace(ctx_) {
	const { engine, model, ledger } = ctx_;
	if (model.lastBidderAddress === ZERO_ADDRESS) {
		return false;
	}
	const claimer_ = ctx_.actorByAddress(model.lastBidderAddress);
	if (claimer_ === null) {
		return false;
	}
	const other_ = ctx_.pickActorNot(model.lastBidderAddress);
	if (other_ === null) {
		return false;
	}
	if ( ! engine.canAfford(claimer_.address, 0n) || ! engine.canAfford(other_.address, 0n) ) {
		return false;
	}
	// At/after `mainPrizeTime` so the last bidder is allowed to claim.
	const ts_ = engine.clampTs((model.mainPrizeTime > engine.lastTs) ? model.mainPrizeTime : (engine.lastTs + 1n));
	const rwStakerOwners_ = currentRandomWalkStakerOwners(ledger);
	const gameEthBalanceBefore_ = ledger.expectedEth(ctx_.game.address);
	const numStakedCs_ = ledger.csStaking.numStakedNfts;
	const numStakedRw_ = ledger.rwStaking.numStakedNfts;

	const items_ = [
		{ signer: claimer_.signer, buildTx: (overrides_) => ctx_.game.connect(claimer_.signer).claimMainPrize(overrides_) },
		{ signer: other_.signer, buildTx: (overrides_) => ctx_.game.connect(other_.signer).claimMainPrize(overrides_) },
	];
	const results_ = await engine.execBurst(ts_, items_);
	expect(results_[0].status, "claim race: the first (last-bidder) claim must succeed").to.equal(1);
	expect(results_[1].status, "claim race: the second simultaneous claim must revert").to.equal(0);
	if (results_[0].receipt.gasUsed > engine.maxClaimGasUsed) {
		engine.maxClaimGasUsed = results_[0].receipt.gasUsed;
	}

	const breakdown_ = model.applyClaim(claimer_.address, ts_, gameEthBalanceBefore_, numStakedCs_, numStakedRw_);
	verifyClaimReceipt(ctx_, { claimerAddress: claimer_.address, receipt: results_[0].receipt, breakdown: breakdown_, rwStakerOwnersBefore: rwStakerOwners_ });
	await ledger.verifyDirtyEth();
	engine._statsFor("claimRace").attempted += 1;
	engine._statsFor("claimRace").succeeded += 1;
	return true;
}

const claimActions = [
	{
		name: "claimMainPrize",
		weight: 7,
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS && ctx_.actorByAddress(ctx_.model.lastBidderAddress) !== null,
		run: (ctx_) => claimAsLastBidder(ctx_),
	},
	{
		name: "claimMainPrizeAfterTimeout",
		weight: 2,
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_) => claimAfterTimeout(ctx_),
	},
	{
		// Comment-202606235: the last bidder claims after the owner overflowed the next-round activation math.
		// V2-only (V1 uses checked arithmetic, where this claim would revert).
		// SMTChecker preprocessing deliberately disables the unchecked block, so that build expects
		// and records Panic(0x11) instead of treating it as an unexpected fuzz failure.
		name: "claimMainPrizeWithOverflowingDelay",
		weight: 1,
		isApplicable: (ctx_) =>
			ctx_.model.version === 2 &&
			ctx_.model.lastBidderAddress !== ZERO_ADDRESS &&
			ctx_.actorByAddress(ctx_.model.lastBidderAddress) !== null,
		run: (ctx_) => claimWithOverflowingDelay(ctx_),
	},
];

// #endregion
// #region ETH donation actions

const donationActions = [
	{
		name: "donateEth",
		weight: 3,
		run: async (ctx_, actor_) => {
			const { engine, model, ledger } = ctx_;
			const amount_ = engine.randomBigIntRange(1n, 10n ** 17n);
			if ( ! engine.canAfford(actor_.address, amount_) ) {
				return "skip";
			}
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => ctx_.game.connect(actor_.signer).donateEth({ ...overrides_, value: amount_ }),
				valueNeeded: amount_,
			});
			const receipt_ = engine.expectOk(result_, "donateEth");
			const donated_ = engine.singleEvent(receipt_, ctx_.game.contract, "EthDonated", "donateEth");
			expect(donated_.args.amount).to.equal(amount_);
			expect(donated_.args.roundNum).to.equal(model.roundNum);
			ledger.addEth(actor_.address, -amount_);
			ledger.addEth(ctx_.game.address, amount_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "donateEthWithInfo",
		weight: 2,
		run: async (ctx_, actor_) => {
			const { engine, model, ledger } = ctx_;
			const amount_ = engine.randomBigIntRange(1n, 10n ** 17n);
			if ( ! engine.canAfford(actor_.address, amount_) ) {
				return "skip";
			}
			const message_ = engine.randomMessage(64);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => ctx_.game.connect(actor_.signer).donateEthWithInfo(message_, { ...overrides_, value: amount_ }),
				valueNeeded: amount_,
			});
			const receipt_ = engine.expectOk(result_, "donateEthWithInfo");
			const donated_ = engine.singleEvent(receipt_, ctx_.game.contract, "EthDonatedWithInfo", "donateEthWithInfo");
			expect(donated_.args.amount).to.equal(amount_);
			expect(donated_.args.roundNum).to.equal(model.roundNum);
			expect(donated_.args[3]).to.equal(ledger.ethDonationWithInfoRecordCount);
			ledger.ethDonationWithInfoRecordCount += 1n;
			ledger.addEth(actor_.address, -amount_);
			ledger.addEth(ctx_.game.address, amount_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "donateEthZero",
		weight: 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger } = ctx_;
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => ctx_.game.connect(actor_.signer).donateEth({ ...overrides_, value: 0n }),
			});
			engine.expectOk(result_, "donateEthZero");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion
// #region Staking actions

const stakingActions = [
	{
		name: "stakeCosmicSignatureNft",
		weight: 8,
		isApplicable: (ctx_, actor_) => pickStakeableCosmicSignatureNft(ctx_, actor_) !== null,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const nftId_ = pickStakeableCosmicSignatureNft(ctx_, actor_);
			if (nftId_ === null) {
				return "skip";
			}
			await ensureCsStakingApproval(ctx_, actor_);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.stakingWalletCosmicSignatureNft.connect(actor_.signer).stake(nftId_, overrides_),
			});
			engine.expectOk(result_, "stakeCosmicSignatureNft");
			expect(ledger.csNftOwners.get(nftId_.toString()), "CS NFT custody after stake")
				.to.equal(contracts.stakingWalletCosmicSignatureNftAddress.toLowerCase());
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "unstakeCosmicSignatureNft",
		weight: 4,
		isApplicable: (ctx_, actor_) => ownedStakeActionIds(ctx_.ledger.csStaking, actor_).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const ids_ = ownedStakeActionIds(ledger.csStaking, actor_);
			if (ids_.length === 0) {
				return "skip";
			}
			const actionId_ = engine.pick(ids_);
			const expectedReward_ = ledger.csStaking.rewardAmountPerStakedNft - ledger.csStaking.stakeActions.get(actionId_.toString()).initialRewardAmountPerStakedNft;
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.stakingWalletCosmicSignatureNft.connect(actor_.signer).unstake(actionId_, overrides_),
			});
			engine.expectOk(result_, "unstakeCosmicSignatureNft");
			// Reward ETH flows from the staking wallet to the actor.
			ledger.addEth(actor_.address, expectedReward_);
			ledger.addEth(contracts.stakingWalletCosmicSignatureNftAddress, -expectedReward_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "stakeManyCosmicSignatureNft",
		weight: 2,
		isApplicable: (ctx_, actor_) => pickStakeableCosmicSignatureNft(ctx_, actor_) !== null,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const owned_ = ledger.nftIdsOwnedBy("cs", actor_.address).filter((id_) => ! ledger.csStaking.usedNfts.has(id_));
			if (owned_.length === 0) {
				return "skip";
			}
			const count_ = Math.min(owned_.length, engine.randomIntRange(1, 3));
			const ids_ = owned_.slice(0, count_).map((id_) => BigInt(id_));
			await ensureCsStakingApproval(ctx_, actor_);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.stakingWalletCosmicSignatureNft.connect(actor_.signer).stakeMany(ids_, overrides_),
			});
			engine.expectOk(result_, "stakeManyCosmicSignatureNft");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "unstakeManyCosmicSignatureNft",
		weight: 2,
		isApplicable: (ctx_, actor_) => ownedStakeActionIds(ctx_.ledger.csStaking, actor_).length >= 2,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const ids_ = ownedStakeActionIds(ledger.csStaking, actor_);
			if (ids_.length < 1) {
				return "skip";
			}
			const count_ = Math.min(ids_.length, engine.randomIntRange(1, 3));
			const chosen_ = ids_.slice(0, count_);
			let expectedReward_ = 0n;
			for (const actionId_ of chosen_) {
				const action_ = ledger.csStaking.stakeActions.get(actionId_.toString());
				expectedReward_ += BigInt(ledger.csStaking.rewardAmountPerStakedNft) - BigInt(action_.initialRewardAmountPerStakedNft);
			}
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.stakingWalletCosmicSignatureNft.connect(actor_.signer).unstakeMany(chosen_, overrides_),
			});
			engine.expectOk(result_, "unstakeManyCosmicSignatureNft");
			ledger.addEth(actor_.address, expectedReward_);
			ledger.addEth(contracts.stakingWalletCosmicSignatureNftAddress, -expectedReward_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "stakeRandomWalkNft",
		weight: 8,
		isApplicable: (ctx_, actor_) => pickStakeableRandomWalkNft(ctx_, actor_) !== null,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const nftId_ = pickStakeableRandomWalkNft(ctx_, actor_);
			if (nftId_ === null) {
				return "skip";
			}
			await ensureRwStakingApproval(ctx_, actor_);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.stakingWalletRandomWalkNft.connect(actor_.signer).stake(nftId_, overrides_),
			});
			engine.expectOk(result_, "stakeRandomWalkNft");
			expect(ledger.rwNftOwners.get(nftId_.toString()), "RW NFT custody after stake")
				.to.equal(contracts.stakingWalletRandomWalkNftAddress.toLowerCase());
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "unstakeRandomWalkNft",
		weight: 4,
		isApplicable: (ctx_, actor_) => ownedStakeActionIds(ctx_.ledger.rwStaking, actor_).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const ids_ = ownedStakeActionIds(ledger.rwStaking, actor_);
			if (ids_.length === 0) {
				return "skip";
			}
			const actionId_ = engine.pick(ids_);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.stakingWalletRandomWalkNft.connect(actor_.signer).unstake(actionId_, overrides_),
			});
			engine.expectOk(result_, "unstakeRandomWalkNft");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "stakeManyRandomWalkNft",
		weight: 2,
		isApplicable: (ctx_, actor_) => pickStakeableRandomWalkNft(ctx_, actor_) !== null,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const owned_ = ledger.nftIdsOwnedBy("rw", actor_.address).filter((id_) => ! ledger.rwStaking.usedNfts.has(id_));
			if (owned_.length === 0) {
				return "skip";
			}
			const count_ = Math.min(owned_.length, engine.randomIntRange(1, 3));
			const ids_ = owned_.slice(0, count_).map((id_) => BigInt(id_));
			await ensureRwStakingApproval(ctx_, actor_);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.stakingWalletRandomWalkNft.connect(actor_.signer).stakeMany(ids_, overrides_),
			});
			engine.expectOk(result_, "stakeManyRandomWalkNft");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

/** Approves the CS staking wallet for all of `actor_`'s CS NFTs (idempotent, tracked once). */
async function ensureCsStakingApproval(ctx_, actor_) {
	if (actor_.csStakingApproved) {
		return;
	}
	const { engine, ledger, contracts } = ctx_;
	const result_ = await engine.execTx({
		signer: actor_.signer,
		buildTx: (overrides_) =>
			contracts.cosmicSignatureNft.connect(actor_.signer).setApprovalForAll(contracts.stakingWalletCosmicSignatureNftAddress, true, overrides_),
	});
	engine.expectOk(result_, "CS staking approval");
	actor_.csStakingApproved = true;
	await ledger.verifyDirtyEth();
}

async function ensureRwStakingApproval(ctx_, actor_) {
	if (actor_.rwStakingApproved) {
		return;
	}
	const { engine, ledger, contracts } = ctx_;
	const result_ = await engine.execTx({
		signer: actor_.signer,
		buildTx: (overrides_) =>
			contracts.randomWalkNft.connect(actor_.signer).setApprovalForAll(contracts.stakingWalletRandomWalkNftAddress, true, overrides_),
	});
	engine.expectOk(result_, "RW staking approval");
	actor_.rwStakingApproved = true;
	await ledger.verifyDirtyEth();
}

// #endregion

module.exports = {
	biddingActions,
	claimActions,
	donationActions,
	stakingActions,
	executeClaim,
	runClaimRace,
	forceCompleteRound,
	ensureCsStakingApproval,
	ensureRwStakingApproval,
	currentRandomWalkStakerOwners,
};
