"use strict";

// #region Imports

const { ZERO_ADDRESS } = require("../GameModel.js");

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
