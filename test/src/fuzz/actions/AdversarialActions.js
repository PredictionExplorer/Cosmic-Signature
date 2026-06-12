"use strict";

// #region Imports

const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../GameModel.js");

// #endregion
// #region Broken-staker helpers

/** Returns the `BrokenCosmicSignatureNftStaker`'s active CS stake action id (bigint), or null. */
function brokenStakerActiveStakeActionId(ctx_) {
	const address_ = ctx_.adversaries?.brokenCsNftStakerAddress;
	if (address_ === undefined) {
		return null;
	}
	for (const [actionId_, action_] of ctx_.ledger.csStaking.stakeActions) {
		if (action_.ownerAddress === address_) {
			return BigInt(actionId_);
		}
	}
	return null;
}

/** Finds an actor owning a non-staked Cosmic Signature NFT who can afford gas (to donate it to the broken staker). */
function findCsNftDonor(ctx_) {
	for (const actor_ of ctx_.actors) {
		if ( ! ctx_.engine.canAfford(actor_.address, 0n) ) {
			continue;
		}
		const owned_ = ctx_.ledger.nftIdsOwnedBy("cs", actor_.address).filter((id_) => ! ctx_.ledger.csStaking.usedNfts.has(id_));
		if (owned_.length > 0) {
			return { actor: actor_, nftId: BigInt(owned_[0]) };
		}
	}
	return null;
}

// #endregion
// #region Charity controller

/**
Tracks the current charity recipient and whether it accepts ETH on transfer (used by the
claim verifier to predict `FundsTransferredToCharity` vs `FundTransferFailed`).
The default recipient is the real `CharityWallet` (always accepts). The adversarial rotation
action swaps it for a `BrokenEthReceiver` in revert mode and back, between rounds.
*/
class CharityController {
	constructor(charityWalletAddress_) {
		this.charityWalletAddressLower = charityWalletAddress_.toLowerCase();
		this.currentAddressLower = charityWalletAddress_.toLowerCase();
		this.brokenReceiverAddressLower = null;
		this.brokenReceiverAccepts = true;
	}

	accepts() {
		if (this.currentAddressLower === this.charityWalletAddressLower) {
			return true; // CharityWallet `receive()` accepts ETH.
		}
		return this.brokenReceiverAccepts;
	}
}

// #endregion
// #region Adversarial actions

const adversarialActions = [
	{
		// Rotate the game's charity recipient to a reverting `BrokenEthReceiver` (and back), between rounds.
		name: "adversarialRotateCharity",
		weight: 2,
		infra: true,
		isApplicable: (ctx_) => ctx_.isRoundInactiveNow() && ctx_.adversaries !== undefined,
		run: async (ctx_) => {
			const { engine, model, ledger, contracts, adversaries, charity } = ctx_;
			const owner_ = contracts.ownerSigner;
			const game_ = ctx_.game.connect(owner_).contract;

			// Decide the next recipient: CharityWallet (accepts) or BrokenEthReceiver (revert / accept modes).
			const goBroken_ = charity.currentAddressLower === charity.charityWalletAddressLower ? engine.chancePercent(70) : engine.chancePercent(40);
			let newAddress_;
			let brokenMode_ = 0;
			if (goBroken_) {
				newAddress_ = adversaries.brokenEthReceiverAddress;
				brokenMode_ = engine.pick([0, 1, 2]); // 0 accepts, 1 reverts, 2 asserts-fail.
			} else {
				newAddress_ = contracts.charityWalletAddress;
			}

			const ts_ = engine.nextTs();
			if (model.roundActivationTime <= ts_) {
				return "skip";
			}

			if (goBroken_) {
				const modeResult_ = await engine.execTx({
					signer: owner_,
					buildTx: (overrides_) => adversaries.brokenEthReceiver.connect(owner_).setEthDepositAcceptanceModeCode(brokenMode_, overrides_),
				});
				engine.expectOk(modeResult_, "set BrokenEthReceiver mode");
			}

			const setResult_ = await engine.execTx({
				signer: owner_,
				buildTx: (overrides_) => game_.setCharityAddress(newAddress_, overrides_),
				ts: engine.nextTs(),
			});
			engine.expectOk(setResult_, "adversarialRotateCharity setCharityAddress");

			// Update model + controller + ensure the new recipient is ETH-tracked.
			model.charityAddress = newAddress_.toLowerCase();
			charity.currentAddressLower = newAddress_.toLowerCase();
			if (goBroken_) {
				charity.brokenReceiverAddressLower = newAddress_.toLowerCase();
				charity.brokenReceiverAccepts = (brokenMode_ === 0);
				if ( ! ledger.isTracked(newAddress_) ) {
					await ledger.trackEth(newAddress_, "brokenCharity");
				}
			}
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// Reentrancy guard probe: a malicious contract overpays an ETH bid; on the refund it reenters
		// a `nonReentrant` game method, which must fail and bubble up as `FundTransferFailed`.
		// V1 only (the `MaliciousBidder` helper uses the 2-argument bid signature).
		name: "adversarialReentrancyOnBidRefund",
		weight: 2,
		isApplicable: (ctx_) => ctx_.model.version === 1 && ctx_.adversaries !== undefined && ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: async (ctx_, actor_) => {
			const { engine, model, adversaries, ledger } = ctx_;
			const ts_ = engine.clampTs(engine.planTs(engine.boundaryCandidates()));
			if (model.lastBidderAddress === ZERO_ADDRESS) {
				return "skip";
			}
			const gasPrice_ = engine.randomGasPrice();
			const price_ = model.getNextEthBidPrice(ts_);
			const swallowLimit_ = model.ethBidRefundAmountInGasToSwallowMaxLimit * gasPrice_;
			const value_ = price_ + swallowLimit_ + 10n ** 18n; // Guarantees a refund (and thus a reentry attempt).
			if ( ! engine.canAfford(actor_.address, value_) ) {
				return "skip";
			}
			const mode_ = engine.pick([1, 2, 3]);

			// Fund the malicious contract through the caller, then set its mode.
			const modeResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => adversaries.maliciousBidder.connect(actor_.signer).setModeCode(mode_, overrides_),
			});
			engine.expectOk(modeResult_, "set MaliciousBidder mode");

			const result_ = await engine.execTx({
				signer: actor_.signer,
				ts: ts_,
				gasPrice: gasPrice_,
				valueNeeded: value_,
				buildTx: (overrides_) => adversaries.maliciousBidder.connect(actor_.signer).doBidWithEth(-1n, "reenter", { ...overrides_, value: value_ }),
			});
			// The reentry into a nonReentrant method makes the refund call fail → FundTransferFailed.
			engine.expectRevert(result_, "FundTransferFailed", "adversarialReentrancyOnBidRefund");
			await ledger.verifyDirtyEth();
			return "revert:FundTransferFailed";
		},
	},
	{
		// Donation of a malicious ERC-20 that reenters on `transferFrom` must revert the whole bid.
		name: "adversarialMaliciousTokenDonation",
		weight: 1,
		isApplicable: (ctx_) => ctx_.adversaries !== undefined && ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: async (ctx_, actor_) => {
			const { engine, model, adversaries, ledger } = ctx_;
			const ts_ = engine.clampTs(engine.planTs(engine.boundaryCandidates()));
			if (model.lastBidderAddress === ZERO_ADDRESS) {
				return "skip";
			}
			const gasPrice_ = engine.randomGasPrice();
			const price_ = model.getNextEthBidPrice(ts_);
			const value_ = price_; // Exact; the donation step reverts regardless.
			if ( ! engine.canAfford(actor_.address, value_) ) {
				return "skip";
			}
			const mode_ = engine.pick([1, 2, 6]);
			// Keep the malicious token's reentry ABI in sync with the current game version so the
			// reentrancy attempt is genuine (and blocked by the guard) rather than just an unknown selector.
			if (adversaries.maliciousTokenVersion !== model.version) {
				const versionResult_ = await engine.execTx({
					signer: actor_.signer,
					buildTx: (overrides_) => adversaries.maliciousToken.connect(actor_.signer).setContractVersionNumber(BigInt(model.version), overrides_),
				});
				engine.expectOk(versionResult_, "set MaliciousToken version");
				adversaries.maliciousTokenVersion = model.version;
			}
			const modeResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => adversaries.maliciousToken.connect(actor_.signer).setModeCode(mode_, overrides_),
			});
			engine.expectOk(modeResult_, "set MaliciousToken mode");

			const result_ = await engine.execTx({
				signer: actor_.signer,
				ts: ts_,
				gasPrice: gasPrice_,
				valueNeeded: value_,
				buildTx: (overrides_) =>
					ctx_.game.connect(actor_.signer).bidWithEthAndDonateToken(
						-1n, "evil token", 0n, adversaries.maliciousTokenAddress, 1n, { ...overrides_, value: value_ }),
			});
			// The donation pulls the malicious token via `safeTransferFrom`, whose `transferFrom` reenters a
			// `nonReentrant` game method; the transient guard rejects it and SafeERC20 bubbles the raw revert,
			// so the whole bid fails with `ReentrancyGuardReentrantCall`.
			engine.expectRevert(result_, "ReentrancyGuardReentrantCall", "adversarialMaliciousTokenDonation");
			await ledger.verifyDirtyEth();
			return "revert:ReentrancyGuardReentrantCall";
		},
	},
	{
		// Give the `BrokenCosmicSignatureNftStaker` a Cosmic Signature NFT and stake it, so a later
		// unstake can exercise the staking wallet's reward-payment failure path.
		name: "adversarialBrokenStakerStake",
		weight: 2,
		isApplicable: (ctx_) =>
			ctx_.adversaries !== undefined &&
			ctx_.adversaries.brokenCsNftStaker !== undefined &&
			brokenStakerActiveStakeActionId(ctx_) === null &&
			findCsNftDonor(ctx_) !== null,
		run: async (ctx_) => {
			const { engine, ledger, contracts, adversaries } = ctx_;
			const donor_ = findCsNftDonor(ctx_);
			if (donor_ === null) {
				return "skip";
			}
			const broken_ = adversaries.brokenCsNftStaker;
			const brokenAddress_ = adversaries.brokenCsNftStakerAddress;

			// 1. The donor transfers a Cosmic Signature NFT to the broken staker contract.
			const transferResult_ = await engine.execTx({
				signer: donor_.actor.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureNft.connect(donor_.actor.signer).transferFrom(donor_.actor.address, brokenAddress_, donor_.nftId, overrides_),
			});
			engine.expectOk(transferResult_, "broken staker NFT donation");
			expect(ledger.csNftOwners.get(donor_.nftId.toString()), "broken staker should own the donated NFT").to.equal(brokenAddress_);

			// 2. The broken staker approves the staking wallet for its NFTs (once).
			if ( ! adversaries.brokenCsNftStakerApproved ) {
				const approveResult_ = await engine.execTx({
					signer: donor_.actor.signer,
					buildTx: (overrides_) => broken_.connect(donor_.actor.signer).doSetApprovalForAll(overrides_),
				});
				engine.expectOk(approveResult_, "broken staker approval");
				adversaries.brokenCsNftStakerApproved = true;
			}

			// 3. The broken staker stakes the NFT (msg.sender to the staking wallet is the broken staker).
			const stakeResult_ = await engine.execTx({
				signer: donor_.actor.signer,
				buildTx: (overrides_) => broken_.connect(donor_.actor.signer).doStake(donor_.nftId, overrides_),
			});
			engine.expectOk(stakeResult_, "broken staker stake");
			expect(ledger.csNftOwners.get(donor_.nftId.toString()), "staked NFT custody")
				.to.equal(contracts.stakingWalletCosmicSignatureNftAddress.toLowerCase());
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// Unstake the broken staker: first with ETH-reward acceptance disabled (the staking wallet's
		// reward call reverts, so `unstake` must fail `FundTransferFailed`), then with acceptance enabled
		// (the unstake succeeds and the reward — possibly zero — flows to the broken staker).
		name: "adversarialBrokenStakerUnstake",
		weight: 2,
		isApplicable: (ctx_) => ctx_.adversaries !== undefined && brokenStakerActiveStakeActionId(ctx_) !== null,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts, adversaries } = ctx_;
			const stakeActionId_ = brokenStakerActiveStakeActionId(ctx_);
			if (stakeActionId_ === null) {
				return "skip";
			}
			const broken_ = adversaries.brokenCsNftStaker;
			const brokenAddress_ = adversaries.brokenCsNftStakerAddress;

			// 1. Put the broken staker in revert mode and attempt to unstake: the reward `call` reverts.
			const revertModeResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => broken_.connect(actor_.signer).setEthDepositAcceptanceModeCode(1n, overrides_),
			});
			engine.expectOk(revertModeResult_, "broken staker set revert mode");
			const failResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => broken_.connect(actor_.signer).doUnstake(stakeActionId_, overrides_),
			});
			engine.expectRevert(failResult_, "FundTransferFailed", "adversarialBrokenStakerUnstake (revert mode)");

			// 2. Restore acceptance and unstake for real; the reward (>= 0) flows to the broken staker.
			const acceptModeResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => broken_.connect(actor_.signer).setEthDepositAcceptanceModeCode(0n, overrides_),
			});
			engine.expectOk(acceptModeResult_, "broken staker set accept mode");
			const action_ = ledger.csStaking.stakeActions.get(stakeActionId_.toString());
			const expectedReward_ = ledger.csStaking.rewardAmountPerStakedNft - action_.initialRewardAmountPerStakedNft;
			const okResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => broken_.connect(actor_.signer).doUnstake(stakeActionId_, overrides_),
			});
			engine.expectOk(okResult_, "adversarialBrokenStakerUnstake (accept mode)");
			ledger.addEth(brokenAddress_, expectedReward_);
			ledger.addEth(contracts.stakingWalletCosmicSignatureNftAddress, -expectedReward_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion
// #region Chaos: Arbitrum precompile toggling

const ARB_SYS_ADDRESS = "0x0000000000000000000000000000000000000064";
const ARB_GAS_INFO_ADDRESS = "0x000000000000000000000000000000000000006C";

/**
With some probability, randomizes `FakeArbSys` / `FakeArbGasInfo` mode codes so the precompile
calls inside `RandomNumberHelpers.generateRandomNumberSeed` revert or return garbage. Claims must
still succeed (the seed remains usable), which the claim verifier confirms.
@returns {Promise<void>}
*/
async function applyArbitrumChaos(ctx_) {
	const { engine } = ctx_;
	if ( ! engine.profile.chaos ) {
		return;
	}
	if ( ! engine.chancePercent(30) ) {
		return;
	}
	const arbSysMode_ = BigInt(engine.randomIntRange(0, 3)) | (BigInt(engine.randomIntRange(0, 3)) << 4n);
	const arbGasMode_ = (BigInt(engine.randomIntRange(0, 3)) << 8n) | (BigInt(engine.randomIntRange(0, 3)) << 12n);
	const signer_ = ctx_.actors[0].signer;
	await engine.execTx({
		signer: signer_,
		buildTx: (overrides_) => ctx_.adversaries.fakeArbSys.connect(signer_).setModeCode(arbSysMode_, overrides_),
	});
	await engine.execTx({
		signer: signer_,
		buildTx: (overrides_) => ctx_.adversaries.fakeArbGasInfo.connect(signer_).setModeCode(arbGasMode_, overrides_),
	});
}

/** Resets the precompile mode codes to 0 (normal behavior). */
async function resetArbitrumChaos(ctx_) {
	const { engine } = ctx_;
	if ( ! engine.profile.chaos ) {
		return;
	}
	const signer_ = ctx_.actors[0].signer;
	await engine.execTx({ signer: signer_, buildTx: (overrides_) => ctx_.adversaries.fakeArbSys.connect(signer_).setModeCode(0n, overrides_) });
	await engine.execTx({ signer: signer_, buildTx: (overrides_) => ctx_.adversaries.fakeArbGasInfo.connect(signer_).setModeCode(0n, overrides_) });
}

// #endregion

module.exports = {
	CharityController,
	adversarialActions,
	applyArbitrumChaos,
	resetArbitrumChaos,
	ARB_SYS_ADDRESS,
	ARB_GAS_INFO_ADDRESS,
};
