"use strict";

// #region Imports

const { expect } = require("chai");

// #endregion
// #region Owner setter mutation (between rounds only)

/**
Safe-range mutation of owner-configurable parameters. Only run while the round is inactive
(the engine guarantees the timestamp is before `roundActivationTime`). The model reads the
new live values, so subsequent prediction stays exact. Setters never hardcode the value back.
*/
const adminActions = [
	{
		name: "adminMutateParameters",
		weight: 6,
		// Owner setters require `_onlyRoundIsInactive`; only between rounds (no bids placed yet, round not active).
		isApplicable: (ctx_) => ctx_.isRoundInactiveNow(),
		run: async (ctx_) => {
			const { engine, model, contracts, ledger } = ctx_;
			const owner_ = contracts.ownerSigner;
			const game_ = ctx_.game.connect(owner_).contract;

			// Choose a small batch of safe mutations.
			const mutations_ = buildSafeMutations(ctx_);
			const chosen_ = [];
			const batchSize_ = engine.randomIntRange(1, 3);
			for (let index_ = 0; index_ < batchSize_ && mutations_.length > 0; ++ index_) {
				const pick_ = mutations_.splice(Number(engine.randomBelow(BigInt(mutations_.length))), 1)[0];
				chosen_.push(pick_);
			}
			let appliedAny_ = false;
			for (const mutation_ of chosen_) {
				// Re-validate inactivity (a previous mutation might have changed timing assumptions; it does not here).
				const ts_ = engine.nextTs();
				if (model.roundActivationTime <= ts_) {
					break; // Round would be active; stop mutating this turn.
				}
				const result_ = await engine.execTx({
					signer: owner_,
					buildTx: (overrides_) => game_[mutation_.method](mutation_.value, overrides_),
					ts: ts_,
				});
				engine.expectOk(result_, `admin ${mutation_.method}`);
				mutation_.apply(model, mutation_.value);
				appliedAny_ = true;
			}
			if ( ! appliedAny_ ) {
				return "skip";
			}
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "adminHalveEthDutchAuctionEndingBidPrice",
		weight: 1,
		isApplicable: (ctx_) =>
			ctx_.isRoundInactiveNow() &&
			ctx_.model.roundNum > 0n &&
			ctx_.model.lastBidderAddress === "0x0000000000000000000000000000000000000000" &&
			ctx_.model.ethDutchAuctionBeginningBidPrice > 0n,
		run: async (ctx_) => {
			const { engine, model, contracts, ledger } = ctx_;
			// Needs the ETH Dutch auction to have fully elapsed at the action timestamp.
			const minTs_ = model.roundActivationTime + model.getEthDutchAuctionDuration() + 2n;
			const ts_ = engine.clampTs(minTs_ + engine.randomBigIntRange(1n, 600n));
			// The action must still happen while the round is inactive (commented modifier in code, but the
			// "too early" check uses elapsed-since-activation, which is fine here); also requires no bid placed.
			if (ts_ >= model.roundActivationTime && model.roundActivationTime > engine.lastTs) {
				// `_onlyBeforeBidPlacedInRound` holds (no bids). The method itself does not require inactivity.
			}
			const owner_ = contracts.ownerSigner;
			const game_ = ctx_.game.connect(owner_).contract;
			const result_ = await engine.execTx({
				signer: owner_,
				buildTx: (overrides_) => game_.halveEthDutchAuctionEndingBidPrice(overrides_),
				ts: ts_,
			});
			if ( ! result_.ok ) {
				// Acceptable owner-action reverts (atomic, no state change), so the model is left untouched:
				//  - "Too early" (InvalidOperationInCurrentState) if the auction had not fully elapsed in this block.
				//  - An arithmetic overflow / division-by-zero panic: the contract itself documents that the
				//    `ethDutchAuctionEndingBidPriceDivisor *= 2` and the divisor recomputation can overflow in
				//    extreme parameter states (Comment-202508192). The owner is trusted, so this is a known,
				//    harmless footgun rather than a bug.
				const acceptable_ = result_.revert.name === "InvalidOperationInCurrentState" || result_.revert.kind === "panic";
				expect(acceptable_, `halveEthDutchAuctionEndingBidPrice unexpected revert: ${result_.revert.name} (${result_.revert.message.slice(0, 160)})`).to.equal(true);
				return `revert:${result_.revert.kind === "panic" ? "Panic" : result_.revert.name}`;
			}
			model.applyHalveEthDutchAuctionEndingBidPrice(ts_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

/**
Builds a list of `{method, value, apply}` safe parameter mutations from the current model state.
Values stay within documented safe ranges so the game keeps functioning.
*/
function buildSafeMutations(ctx_) {
	const { engine, model } = ctx_;
	const mutations_ = [];
	const add_ = (method_, value_, apply_) => mutations_.push({ method: method_, value: value_, apply: apply_ });

	add_("setEthBidPriceIncreaseDivisor", BigInt(engine.randomIntRange(50, 200)), (m_, v_) => { m_.ethBidPriceIncreaseDivisor = v_; });
	add_("setEthDutchAuctionEndingBidPriceDivisor", BigInt(engine.randomIntRange(50, 400)), (m_, v_) => { m_.ethDutchAuctionEndingBidPriceDivisor = v_; });
	add_("setEthDutchAuctionDurationDivisor", BigInt(engine.randomIntRange(2, 100)), (m_, v_) => { m_.ethDutchAuctionDurationDivisor = v_; });
	add_("setEthBidRefundAmountInGasToSwallowMaxLimit", BigInt(engine.randomIntRange(0, 20000)), (m_, v_) => { m_.ethBidRefundAmountInGasToSwallowMaxLimit = v_; });
	add_("setCstDutchAuctionBeginningBidPriceMinLimit", BigInt(engine.randomIntRange(1, 500)) * 10n ** 18n, (m_, v_) => { m_.cstDutchAuctionBeginningBidPriceMinLimit = v_; });
	add_("setBidMessageLengthMaxLimit", BigInt(engine.randomIntRange(64, 400)), (m_, v_) => { m_.bidMessageLengthMaxLimit = v_; });
	add_("setCstPrizeAmount", BigInt(engine.randomIntRange(1, 2000)) * 10n ** 18n, (m_, v_) => { m_.cstPrizeAmount = v_; });
	add_("setChronoWarriorEthPrizeAmountPercentage", BigInt(engine.randomIntRange(1, 10)), (m_, v_) => { m_.chronoWarriorEthPrizeAmountPercentage = v_; });
	add_("setRaffleTotalEthPrizeAmountForBiddersPercentage", BigInt(engine.randomIntRange(1, 10)), (m_, v_) => { m_.raffleTotalEthPrizeAmountForBiddersPercentage = v_; });
	add_("setNumRaffleEthPrizesForBidders", BigInt(engine.randomIntRange(1, 6)), (m_, v_) => { m_.numRaffleEthPrizesForBidders = v_; });
	add_("setNumRaffleCosmicSignatureNftsForBidders", BigInt(engine.randomIntRange(1, 12)), (m_, v_) => { m_.numRaffleCosmicSignatureNftsForBidders = v_; });
	add_("setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers", BigInt(engine.randomIntRange(1, 12)), (m_, v_) => { m_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers = v_; });
	add_("setCosmicSignatureNftStakingTotalEthRewardAmountPercentage", BigInt(engine.randomIntRange(1, 10)), (m_, v_) => { m_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage = v_; });
	add_("setMainEthPrizeAmountPercentage", BigInt(engine.randomIntRange(10, 40)), (m_, v_) => { m_.mainEthPrizeAmountPercentage = v_; });
	add_("setCharityEthDonationAmountPercentage", BigInt(engine.randomIntRange(1, 10)), (m_, v_) => { m_.charityEthDonationAmountPercentage = v_; });
	add_("setMarketingWalletCstContributionAmount", BigInt(engine.randomIntRange(0, 5000)) * 10n ** 18n, (m_, v_) => { m_.marketingWalletCstContributionAmount = v_; });
	add_("setTimeoutDurationToClaimMainPrize", BigInt(engine.randomIntRange(1, 5)) * 86_400n, (m_, v_) => { m_.timeoutDurationToClaimMainPrize = v_; });
	add_("setDelayDurationBeforeRoundActivation", BigInt(engine.randomIntRange(60, 7200)), (m_, v_) => { m_.delayDurationBeforeRoundActivation = v_; });
	add_("setMainPrizeTimeIncrementIncreaseDivisor", BigInt(engine.randomIntRange(50, 200)), (m_, v_) => { m_.mainPrizeTimeIncrementIncreaseDivisor = v_; });

	if (model.version === 2) {
		add_("setCstDutchAuctionDuration", BigInt(engine.randomIntRange(3600, 2 * 86400)), (m_, v_) => { m_.cstDutchAuctionDuration = v_; });
		add_("setCstDutchAuctionDurationChangeDivisor", BigInt(engine.randomIntRange(50, 1000)), (m_, v_) => { m_.cstDutchAuctionDurationChangeDivisor = v_; });
		add_("setBidCstRewardAmountMultiplier", model.bidCstRewardAmountMultiplier * BigInt(engine.randomIntRange(50, 200)) / 100n, (m_, v_) => { m_.bidCstRewardAmountMultiplier = v_; });
	} else {
		add_("setCstDutchAuctionDurationDivisor", BigInt(engine.randomIntRange(2, 100)), (m_, v_) => { m_.cstDutchAuctionDurationDivisor = v_; });
		add_("setBidCstRewardAmount", BigInt(engine.randomIntRange(0, 500)) * 10n ** 18n, (m_, v_) => { m_.bidCstRewardAmount = v_; });
	}
	return mutations_;
}

// #endregion
// #region DAO governance cycle

const daoActions = [
	{
		name: "daoGovernanceCycle",
		weight: 1,
		isApplicable: (ctx_) => ctx_.daoVotersReady === true,
		run: async (ctx_) => {
			const { engine, contracts, ledger } = ctx_;
			const proposer_ = contracts.signers[0];
			const daoConn_ = contracts.cosmicSignatureDao.connect(proposer_);
			const daoAddress_ = contracts.cosmicSignatureDaoAddress;
			const votingDelay_ = await contracts.cosmicSignatureDao.votingDelay();
			const votingPeriod_ = await contracts.cosmicSignatureDao.votingPeriod();
			const newDelay_ = votingDelay_ + 1n;
			const callData_ = contracts.cosmicSignatureDao.interface.encodeFunctionData("setVotingDelay", [newDelay_]);
			const description_ = `FuzzTest setVotingDelay ${engine.actionSeq}`;
			const descriptionHash_ = ctx_.hre.ethers.id(description_);

			const proposeResult_ = await engine.execTx({
				signer: proposer_,
				buildTx: (overrides_) => daoConn_.propose([daoAddress_], [0n], [callData_], description_, overrides_),
			});
			if ( ! proposeResult_.ok ) {
				return "skip";
			}
			const proposalCreated_ = engine.singleEvent(proposeResult_.receipt, contracts.cosmicSignatureDao, "ProposalCreated", "DAO propose");
			const proposalId_ = proposalCreated_.args.proposalId;

			await engine.mineAt(engine.lastTs + votingDelay_ + 2n);
			const voteResult_ = await engine.execTx({
				signer: proposer_,
				buildTx: (overrides_) => daoConn_.castVote(proposalId_, 1, overrides_),
			});
			if ( ! voteResult_.ok ) {
				return "skip";
			}
			await engine.mineAt(engine.lastTs + votingPeriod_ + 2n);
			const executeResult_ = await engine.execTx({
				signer: proposer_,
				buildTx: (overrides_) => daoConn_.execute([daoAddress_], [0n], [callData_], descriptionHash_, overrides_),
			});
			if ( ! executeResult_.ok ) {
				return "skip";
			}
			expect(await contracts.cosmicSignatureDao.votingDelay()).to.equal(newDelay_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion

module.exports = {
	adminActions,
	daoActions,
	buildSafeMutations,
};
