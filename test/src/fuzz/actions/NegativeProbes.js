"use strict";

// #region Imports

const { ZERO_ADDRESS } = require("../GameModel.js");

// #endregion
// #region Probe helper

/**
Runs an intentionally-reverting transaction and asserts the exact error.
The transaction reverts, so neither the model nor the ledger change (gas is accounted by the engine).
@returns {Promise<string>} `revert:<name>` on success, "skip" if not set up.
*/
async function runProbe(ctx_, { signer, buildTx, expected, ts, value }) {
	// A probe that would send more ETH than the (finite-budget) sender holds is simply skipped,
	// like a human who cannot afford it; the engine never auto-refills.
	if ((value ?? 0n) > 0n && ! ctx_.engine.canAfford(signer.address, value)) {
		return "skip";
	}
	const result_ = await ctx_.engine.execTx({ signer, buildTx, ts, valueNeeded: value ?? 0n });
	const expectedList_ = Array.isArray(expected) ? expected : [expected];
	if (result_.ok) {
		throw new Error(`negative probe expected revert in {${expectedList_.join(", ")}} but the tx succeeded`);
	}
	if ( ! expectedList_.includes(result_.revert.name) ) {
		throw new Error(
			`negative probe expected one of {${expectedList_.join(", ")}} but got ${result_.revert.name}: ${result_.revert.message.slice(0, 300)}`
		);
	}
	return `revert:${result_.revert.name}`;
}

// #endregion
// #region Probes

const negativeProbes = [
	// #region Bidding probes

	{
		name: "probe.insufficientEthBid",
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_, actor_) => runProbe(ctx_, {
			signer: actor_.signer,
			value: 1n,
			buildTx: (overrides_) => ctx_.game.connect(actor_.signer).bidWithEth(-1n, "", 0n, { ...overrides_, value: 1n }),
			expected: "InsufficientReceivedBidAmount",
		}),
	},
	{
		name: "probe.tooLongMessage",
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_, actor_) => {
			const ts_ = ctx_.engine.clampTs(ctx_.engine.planTs(ctx_.engine.boundaryCandidates()));
			const price_ = ctx_.model.getNextEthBidPrice(ts_);
			const message_ = ctx_.engine.exactLengthMessage(Number(ctx_.model.bidMessageLengthMaxLimit) + 1);
			return runProbe(ctx_, {
				signer: actor_.signer,
				ts: ts_,
				value: price_,
				buildTx: (overrides_) => ctx_.game.connect(actor_.signer).bidWithEth(-1n, message_, 0n, { ...overrides_, value: price_ }),
				expected: "TooLongBidMessage",
			});
		},
	},
	{
		name: "probe.usedRandomWalkNftBid",
		isApplicable: (ctx_, actor_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS && firstUsedRwNftOwnedBy(ctx_, actor_) !== null,
		run: (ctx_, actor_) => {
			const nftId_ = firstUsedRwNftOwnedBy(ctx_, actor_);
			if (nftId_ === null) {
				return "skip";
			}
			const ts_ = ctx_.engine.clampTs(ctx_.engine.planTs(ctx_.engine.boundaryCandidates()));
			const ethPrice_ = ctx_.model.getNextEthBidPrice(ts_);
			const value_ = ctx_.model.getEthPlusRandomWalkNftBidPrice(ethPrice_) + 10n ** 15n;
			return runProbe(ctx_, {
				signer: actor_.signer,
				ts: ts_,
				value: value_,
				buildTx: (overrides_) => ctx_.game.connect(actor_.signer).bidWithEth(nftId_, "", 0n, { ...overrides_, value: value_ }),
				expected: "UsedRandomWalkNft",
			});
		},
	},
	{
		name: "probe.foreignRandomWalkNftBid",
		isApplicable: (ctx_, actor_) => ctx_.model.lastBidderAddress !== ZERO_ADDRESS && foreignBiddableRwNft(ctx_, actor_) !== null,
		run: (ctx_, actor_) => {
			const nftId_ = foreignBiddableRwNft(ctx_, actor_);
			if (nftId_ === null) {
				return "skip";
			}
			const ts_ = ctx_.engine.clampTs(ctx_.engine.planTs(ctx_.engine.boundaryCandidates()));
			const ethPrice_ = ctx_.model.getNextEthBidPrice(ts_);
			const value_ = ctx_.model.getEthPlusRandomWalkNftBidPrice(ethPrice_) + 10n ** 15n;
			return runProbe(ctx_, {
				signer: actor_.signer,
				ts: ts_,
				value: value_,
				buildTx: (overrides_) => ctx_.game.connect(actor_.signer).bidWithEth(nftId_, "", 0n, { ...overrides_, value: value_ }),
				expected: "CallerIsNotNftOwner",
			});
		},
	},
	{
		name: "probe.cstBidPriceTooLow",
		isApplicable: (ctx_) => {
			if (ctx_.model.lastBidderAddress === ZERO_ADDRESS) {
				return false;
			}
			const ts_ = ctx_.engine.lastTs + 1n;
			return ctx_.model.getNextCstBidPrice(ts_) > 0n;
		},
		run: (ctx_, actor_) => {
			const ts_ = ctx_.engine.clampTs(ctx_.engine.lastTs + 1n);
			const price_ = ctx_.model.getNextCstBidPrice(ts_);
			if (price_ === 0n) {
				return "skip";
			}
			return runProbe(ctx_, {
				signer: actor_.signer,
				ts: ts_,
				buildTx: (overrides_) => ctx_.game.connect(actor_.signer).bidWithCst(price_ - 1n, "", 0n, overrides_),
				expected: "InsufficientReceivedBidAmount",
			});
		},
	},
	{
		name: "probe.minRewardTooHigh",
		isApplicable: (ctx_) => ctx_.model.version === 2 && ctx_.model.lastBidderAddress !== ZERO_ADDRESS,
		run: (ctx_, actor_) => {
			const ts_ = ctx_.engine.clampTs(ctx_.engine.planTs(ctx_.engine.boundaryCandidates()));
			const reward_ = ctx_.model.getBidCstRewardAmount(ts_);
			const price_ = ctx_.model.getNextEthBidPrice(ts_);
			return runProbe(ctx_, {
				signer: actor_.signer,
				ts: ts_,
				value: price_ + 10n ** 15n,
				buildTx: (overrides_) =>
					ctx_.game.connect(actor_.signer).bidWithEth(-1n, "", reward_ + 10n ** 24n, { ...overrides_, value: price_ + 10n ** 15n }),
				expected: "BidCstRewardAmountMinLimitNotReached",
			});
		},
	},

	// #endregion
	// #region Claim probes

	{
		name: "probe.claimTooEarly",
		isApplicable: (ctx_) => {
			const model_ = ctx_.model;
			if (model_.lastBidderAddress === ZERO_ADDRESS) {
				return false;
			}
			return ctx_.actorByAddress(model_.lastBidderAddress) !== null && (ctx_.engine.lastTs + 1n) < model_.mainPrizeTime;
		},
		run: (ctx_) => {
			const claimer_ = ctx_.actorByAddress(ctx_.model.lastBidderAddress);
			if (claimer_ === null) {
				return "skip";
			}
			const ts_ = ctx_.engine.clampTs(ctx_.engine.lastTs + 1n);
			if (ts_ >= ctx_.model.mainPrizeTime) {
				return "skip";
			}
			return runProbe(ctx_, {
				signer: claimer_.signer,
				ts: ts_,
				buildTx: (overrides_) => ctx_.game.connect(claimer_.signer).claimMainPrize(overrides_),
				expected: "MainPrizeEarlyClaim",
			});
		},
	},
	{
		name: "probe.claimDeniedNonLastBidder",
		isApplicable: (ctx_) => {
			const model_ = ctx_.model;
			if (model_.lastBidderAddress === ZERO_ADDRESS) {
				return false;
			}
			return ctx_.pickActorNot(model_.lastBidderAddress) !== null &&
				(ctx_.engine.lastTs + 1n) < model_.mainPrizeTime + model_.timeoutDurationToClaimMainPrize;
		},
		run: (ctx_) => {
			const other_ = ctx_.pickActorNot(ctx_.model.lastBidderAddress);
			if (other_ === null) {
				return "skip";
			}
			const ts_ = ctx_.engine.clampTs(ctx_.engine.lastTs + 1n);
			if (ts_ >= ctx_.model.mainPrizeTime + ctx_.model.timeoutDurationToClaimMainPrize) {
				return "skip";
			}
			return runProbe(ctx_, {
				signer: other_.signer,
				ts: ts_,
				buildTx: (overrides_) => ctx_.game.connect(other_.signer).claimMainPrize(overrides_),
				expected: "MainPrizeClaimDenied",
			});
		},
	},
	{
		name: "probe.claimNoBids",
		isApplicable: (ctx_) => ctx_.model.lastBidderAddress === ZERO_ADDRESS,
		run: (ctx_, actor_) => runProbe(ctx_, {
			signer: actor_.signer,
			buildTx: (overrides_) => ctx_.game.connect(actor_.signer).claimMainPrize(overrides_),
			expected: "NoBidsPlacedInCurrentRound",
		}),
	},

	// #endregion
	// #region Staking probes

	{
		name: "probe.unstakeInvalidId",
		isApplicable: () => true,
		run: (ctx_, actor_) => {
			const bogusId_ = ctx_.engine.randomBigIntRange(500_000n, 1_500_000n);
			const staking_ = ctx_.engine.chancePercent(50) ? ctx_.contracts.stakingWalletCosmicSignatureNft : ctx_.contracts.stakingWalletRandomWalkNft;
			return runProbe(ctx_, {
				signer: actor_.signer,
				buildTx: (overrides_) => staking_.connect(actor_.signer).unstake(bogusId_, overrides_),
				expected: "NftStakeActionInvalidId",
			});
		},
	},
	{
		name: "probe.unstakeForeignAction",
		isApplicable: (ctx_, actor_) => foreignStakeActionId(ctx_, actor_) !== null,
		run: (ctx_, actor_) => {
			const target_ = foreignStakeActionId(ctx_, actor_);
			if (target_ === null) {
				return "skip";
			}
			return runProbe(ctx_, {
				signer: actor_.signer,
				buildTx: (overrides_) => target_.staking.connect(actor_.signer).unstake(target_.actionId, overrides_),
				expected: "NftStakeActionAccessDenied",
			});
		},
	},
	{
		name: "probe.restakeUsedNft",
		isApplicable: (ctx_) => ctx_.ledger.csStaking.usedNfts.size > 0 || ctx_.ledger.rwStaking.usedNfts.size > 0,
		run: (ctx_, actor_) => {
			const useCs_ = ctx_.ledger.csStaking.usedNfts.size > 0 && (ctx_.ledger.rwStaking.usedNfts.size === 0 || ctx_.engine.chancePercent(50));
			const usedSet_ = useCs_ ? ctx_.ledger.csStaking.usedNfts : ctx_.ledger.rwStaking.usedNfts;
			const staking_ = useCs_ ? ctx_.contracts.stakingWalletCosmicSignatureNft : ctx_.contracts.stakingWalletRandomWalkNft;
			const nftId_ = BigInt([...usedSet_][0]);
			return runProbe(ctx_, {
				signer: actor_.signer,
				buildTx: (overrides_) => staking_.connect(actor_.signer).stake(nftId_, overrides_),
				expected: "NftHasAlreadyBeenStaked",
			});
		},
	},

	// #endregion
	// #region Access-control probes

	{
		name: "probe.onlyGameToken",
		isApplicable: () => true,
		run: (ctx_, actor_) => {
			const choice_ = ctx_.engine.randomIntRange(0, 3);
			let buildTx_;
			if (choice_ === 0) {
				buildTx_ = (overrides_) => ctx_.contracts.cosmicSignatureToken.connect(actor_.signer).mint(actor_.address, 1n, overrides_);
			} else if (choice_ === 1) {
				buildTx_ = (overrides_) => ctx_.contracts.cosmicSignatureNft.connect(actor_.signer).mint(0n, actor_.address, 1n, overrides_);
			} else if (choice_ === 2) {
				buildTx_ = (overrides_) => ctx_.contracts.prizesWallet.connect(actor_.signer).depositEth(0n, 0n, actor_.address, { ...overrides_, value: 1n });
			} else {
				buildTx_ = (overrides_) => ctx_.contracts.stakingWalletCosmicSignatureNft.connect(actor_.signer).deposit(0n, { ...overrides_, value: 1n });
			}
			return runProbe(ctx_, {
				signer: actor_.signer,
				value: 1n,
				buildTx: buildTx_,
				expected: "UnauthorizedCaller",
			});
		},
	},
	{
		name: "probe.setterNonOwner",
		isApplicable: () => true,
		run: (ctx_, actor_) => runProbe(ctx_, {
			signer: actor_.signer,
			buildTx: (overrides_) => ctx_.game.connect(actor_.signer).contract.setCstPrizeAmount(1n, overrides_),
			expected: "OwnableUnauthorizedAccount",
		}),
	},
	{
		name: "probe.setterDuringActiveRound",
		isApplicable: (ctx_) => ! ctx_.isRoundInactiveNow() && ctx_.model.roundActivationTime > 0n,
		run: (ctx_) => {
			const owner_ = ctx_.contracts.ownerSigner;
			const ts_ = ctx_.engine.clampTs(ctx_.engine.lastTs + 1n);
			if (ts_ < ctx_.model.roundActivationTime) {
				return "skip"; // Would be inactive.
			}
			return runProbe(ctx_, {
				signer: owner_,
				ts: ts_,
				buildTx: (overrides_) => ctx_.game.connect(owner_).contract.setCstPrizeAmount(ctx_.model.cstPrizeAmount, overrides_),
				expected: "RoundIsActive",
			});
		},
	},
	{
		// The owner may upgrade only while the round is inactive (`_authorizeUpgrade`'s `_onlyRoundIsInactive`).
		// An owner-initiated upgrade during an active round must revert `RoundIsActive`.
		name: "probe.upgradeWhileRoundActive",
		infra: true,
		isApplicable: (ctx_) => ! ctx_.isRoundInactiveNow() && ctx_.model.roundActivationTime > 0n,
		run: (ctx_) => {
			const owner_ = ctx_.contracts.ownerSigner;
			const ts_ = ctx_.engine.clampTs(ctx_.engine.lastTs + 1n);
			if (ts_ < ctx_.model.roundActivationTime) {
				return "skip"; // Would be inactive.
			}
			// The implementation address is irrelevant: `_authorizeUpgrade` reverts on the round-state
			// check before the new implementation is ever inspected.
			const impl_ = ctx_.contracts.cosmicSignatureGameImplementationAddress;
			return runProbe(ctx_, {
				signer: owner_,
				ts: ts_,
				buildTx: (overrides_) => ctx_.game.connect(owner_).contract.upgradeToAndCall(impl_, "0x", overrides_),
				expected: "RoundIsActive",
			});
		},
	},
	{
		name: "probe.payRewardNonTreasurer",
		isApplicable: () => true,
		run: (ctx_, actor_) => runProbe(ctx_, {
			signer: actor_.signer,
			buildTx: (overrides_) => ctx_.contracts.marketingWallet.connect(actor_.signer).payReward(actor_.address, 1n, overrides_),
			expected: "UnauthorizedCaller",
		}),
	},
	{
		name: "probe.withdrawPrizeEthDeniedBeforeTimeout",
		isApplicable: (ctx_) => ctx_._anyNotTimedOutPrizesWalletEth(),
		run: (ctx_, actor_) => {
			const target_ = ctx_._pickNotTimedOutPrizesWalletEth(actor_.address);
			if (target_ === null) {
				return "skip";
			}
			const ts_ = ctx_.engine.clampTs(ctx_.engine.lastTs + 1n);
			if (ts_ >= target_.timeout) {
				return "skip";
			}
			return runProbe(ctx_, {
				signer: actor_.signer,
				ts: ts_,
				buildTx: (overrides_) =>
					ctx_.contracts.prizesWallet.connect(actor_.signer).getFunction("withdrawEth(uint256,address)")(target_.round, target_.winner, overrides_),
				expected: "EthWithdrawalDenied",
			});
		},
	},
	{
		name: "probe.claimDonatedNftInvalidIndex",
		isApplicable: () => true,
		run: (ctx_, actor_) => {
			const index_ = ctx_.ledger.prizesWallet.nextDonatedNftIndex + ctx_.engine.randomBigIntRange(0n, 100n);
			return runProbe(ctx_, {
				signer: actor_.signer,
				buildTx: (overrides_) => ctx_.contracts.prizesWallet.connect(actor_.signer).claimDonatedNft(index_, overrides_),
				expected: "InvalidDonatedNftIndex",
			});
		},
	},
	{
		name: "probe.claimDonatedNftAlreadyClaimed",
		isApplicable: (ctx_) => ctx_._claimedDonatedNftIndexes().length > 0,
		run: (ctx_, actor_) => {
			const indexes_ = ctx_._claimedDonatedNftIndexes();
			if (indexes_.length === 0) {
				return "skip";
			}
			const index_ = ctx_.engine.pick(indexes_);
			return runProbe(ctx_, {
				signer: actor_.signer,
				buildTx: (overrides_) => ctx_.contracts.prizesWallet.connect(actor_.signer).claimDonatedNft(index_, overrides_),
				expected: "DonatedNftAlreadyClaimed",
			});
		},
	},
];

// #endregion
// #region Probe target helpers

function firstUsedRwNftOwnedBy(ctx_, actor_) {
	const owned_ = ctx_.ledger.nftIdsOwnedBy("rw", actor_.address);
	for (const id_ of owned_) {
		if (ctx_.model.usedRandomWalkNfts.has(id_)) {
			return BigInt(id_);
		}
	}
	return null;
}

function foreignBiddableRwNft(ctx_, actor_) {
	// A Random Walk NFT owned by a different actor and not yet used for bidding.
	for (const other_ of ctx_.actors) {
		if (other_.lower === actor_.lower) {
			continue;
		}
		const owned_ = ctx_.ledger.nftIdsOwnedBy("rw", other_.address);
		for (const id_ of owned_) {
			if ( ! ctx_.model.usedRandomWalkNfts.has(id_) && ! ctx_.ledger.rwStaking.usedNfts.has(id_)) {
				return BigInt(id_);
			}
		}
	}
	return null;
}

function foreignStakeActionId(ctx_, actor_) {
	for (const [stakingName_, stakingLedger_, stakingContract_] of [
		["cs", ctx_.ledger.csStaking, ctx_.contracts.stakingWalletCosmicSignatureNft],
		["rw", ctx_.ledger.rwStaking, ctx_.contracts.stakingWalletRandomWalkNft],
	]) {
		for (const [actionId_, action_] of stakingLedger_.stakeActions) {
			if (action_.ownerAddress !== actor_.lower) {
				return { actionId: BigInt(actionId_), staking: stakingContract_, kind: stakingName_ };
			}
		}
	}
	return null;
}

// #endregion

module.exports = {
	negativeProbes,
	runProbe,
};
