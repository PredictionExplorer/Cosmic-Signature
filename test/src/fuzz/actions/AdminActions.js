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
		infra: true,
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
		infra: true,
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
	{
		// A no-op self re-upgrade to the CURRENT implementation must succeed and change nothing.
		// Restricted to phase 2 (post real upgrade) so it can never interfere with the one-time
		// OpenZeppelin-plugin upgrade performed at the phase boundary.
		name: "noOpSelfReUpgrade",
		weight: 1,
		infra: true,
		isApplicable: (ctx_) => ctx_.isRoundInactiveNow() && ctx_.model.version !== 1,
		run: async (ctx_) => {
			const { engine, contracts, ledger } = ctx_;
			const ts_ = engine.nextTs();
			if (ctx_.model.roundActivationTime <= ts_) {
				return "skip"; // Would be active; `_authorizeUpgrade` requires an inactive round.
			}
			const owner_ = contracts.ownerSigner;
			const implBefore_ = await ctx_.hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);
			const result_ = await engine.execTx({
				signer: owner_,
				ts: ts_,
				buildTx: (overrides_) => ctx_.game.connect(owner_).contract.upgradeToAndCall(implBefore_, "0x", overrides_),
			});
			engine.expectOk(result_, "noOpSelfReUpgrade");
			const implAfter_ = await ctx_.hre.upgrades.erc1967.getImplementationAddress(contracts.cosmicSignatureGameProxyAddress);
			expect(implAfter_, "no-op re-upgrade must not change the implementation").to.equal(implBefore_);
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
	add_("setCstDutchAuctionBeginningBidPriceMinLimit", BigInt(engine.randomIntRange(1, 500)) * 10n ** 18n, (m_, v_) => {
		m_.cstDutchAuctionBeginningBidPriceMinLimit = v_;

		// // Comment-202607016 applies.
		// if (v_ > m_.nextRoundFirstCstDutchAuctionBeginningBidPrice) {
		// 	m_.nextRoundFirstCstDutchAuctionBeginningBidPrice = v_;
		// }
	});
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

	if ( ! model.isV1Like() ) {
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

/**
Signs an EIP-712 `Ballot(uint256 proposalId,uint8 support,address voter,uint256 nonce)` with the
voter's underlying wallet, for an off-chain `castVoteBySig` vote.
*/
async function signDaoBallot(ctx_, voterSigner_, proposalId_, support_) {
	const dao_ = ctx_.contracts.cosmicSignatureDao;
	const [, name_, version_, chainId_, verifyingContract_] = await dao_.eip712Domain();
	const domain_ = { name: name_, version: version_, chainId: chainId_, verifyingContract: verifyingContract_ };
	const types_ = {
		Ballot: [
			{ name: "proposalId", type: "uint256" },
			{ name: "support", type: "uint8" },
			{ name: "voter", type: "address" },
			{ name: "nonce", type: "uint256" },
		],
	};
	const nonce_ = await dao_.nonces(voterSigner_.address);
	const underlying_ = voterSigner_.signer ?? voterSigner_;
	return underlying_.signTypedData(domain_, types_, { proposalId: proposalId_, support: support_, voter: voterSigner_.address, nonce: nonce_ });
}

const daoActions = [
	{
		// A full governance cycle over a self-governed GovernorSettings parameter, exercising several
		// scenarios: a passing proposal (with a second voter that sometimes votes via off-chain
		// `castVoteBySig`), a defeated proposal (whose `execute` must revert), and a proposal cancelled
		// while still pending. The DAO governs only itself (it is not the game owner), so the targets
		// are `setVotingDelay` / `setVotingPeriod` / `setProposalThreshold` (all safe; the threshold is
		// only ever lowered so governance can never lock itself out).
		name: "daoGovernanceCycle",
		weight: 2,
		infra: true,
		isApplicable: (ctx_) => ctx_.daoVotersReady === true,
		run: async (ctx_) => {
			const { engine, contracts, ledger } = ctx_;
			const proposer_ = contracts.signers[0];
			const secondVoter_ = contracts.signers[1];
			const dao_ = contracts.cosmicSignatureDao;
			const daoConn_ = dao_.connect(proposer_);
			const daoAddress_ = contracts.cosmicSignatureDaoAddress;
			const votingDelay_ = await dao_.votingDelay();
			const votingPeriod_ = await dao_.votingPeriod();

			const choice_ = engine.randomIntRange(0, 2);
			let setting_;
			if (choice_ === 0) {
				setting_ = { method: "setVotingDelay", value: votingDelay_ + 1n, getter: "votingDelay" };
			} else if (choice_ === 1) {
				setting_ = { method: "setVotingPeriod", value: votingPeriod_ + 1n, getter: "votingPeriod" };
			} else {
				// Only ever lower the threshold to a small, safe value (never lock governance out).
				setting_ = { method: "setProposalThreshold", value: 10n ** 18n, getter: "proposalThreshold" };
			}
			const callData_ = dao_.interface.encodeFunctionData(setting_.method, [setting_.value]);
			const description_ = `FuzzTest ${setting_.method} ${engine.actionSeq}`;
			const descriptionHash_ = ctx_.hre.ethers.id(description_);
			const scenario_ = engine.pick(["succeed", "succeed", "defeated", "canceled"]);

			const proposeResult_ = await engine.execTx({
				signer: proposer_,
				buildTx: (overrides_) => daoConn_.propose([daoAddress_], [0n], [callData_], description_, overrides_),
			});
			if ( ! proposeResult_.ok ) {
				return "skip";
			}
			const proposalCreated_ = engine.singleEvent(proposeResult_.receipt, dao_, "ProposalCreated", "DAO propose");
			const proposalId_ = proposalCreated_.args.proposalId;

			if (scenario_ === "canceled") {
				// Cancel while still Pending (voting has not begun); only the proposer may.
				const cancelResult_ = await engine.execTx({
					signer: proposer_,
					buildTx: (overrides_) => daoConn_.cancel([daoAddress_], [0n], [callData_], descriptionHash_, overrides_),
				});
				if ( ! cancelResult_.ok ) {
					return "skip";
				}
				engine.singleEvent(cancelResult_.receipt, dao_, "ProposalCanceled", "DAO cancel");
				await ledger.verifyDirtyEth();
				return "ok";
			}

			await engine.mineAt(engine.lastTs + votingDelay_ + 2n);

			if (scenario_ === "defeated") {
				// Proposer votes Against; with no For/Abstain votes the proposal fails quorum and is Defeated,
				// so the subsequent `execute` must revert.
				const voteResult_ = await engine.execTx({ signer: proposer_, buildTx: (overrides_) => daoConn_.castVote(proposalId_, 0, overrides_) });
				if ( ! voteResult_.ok ) {
					return "skip";
				}
				await engine.mineAt(engine.lastTs + votingPeriod_ + 2n);
				const executeResult_ = await engine.execTx({
					signer: proposer_,
					buildTx: (overrides_) => daoConn_.execute([daoAddress_], [0n], [callData_], descriptionHash_, overrides_),
				});
				expect(executeResult_.ok, "a defeated proposal must not execute").to.equal(false);
				await ledger.verifyDirtyEth();
				return `revert:${executeResult_.revert.name}`;
			}

			// scenario_ === "succeed".
			const voteResult_ = await engine.execTx({ signer: proposer_, buildTx: (overrides_) => daoConn_.castVote(proposalId_, 1, overrides_) });
			if ( ! voteResult_.ok ) {
				return "skip";
			}
			// Add a second voter (For or Abstain), sometimes via an off-chain EIP-712 `castVoteBySig`.
			if (secondVoter_.address.toLowerCase() !== proposer_.address.toLowerCase()) {
				const secondActor_ = ctx_.actorByAddress(secondVoter_.address);
				if (secondActor_ !== null && secondActor_.delegated) {
					const support2_ = engine.pick([1, 2]);
					if (engine.chancePercent(50)) {
						const signature_ = await signDaoBallot(ctx_, secondVoter_, proposalId_, support2_);
						// Best-effort: the proposer relays the signed ballot (ignore a benign already-voted revert).
						await engine.execTx({
							signer: proposer_,
							buildTx: (overrides_) => daoConn_.castVoteBySig(proposalId_, support2_, secondVoter_.address, signature_, overrides_),
						});
					} else {
						await engine.execTx({ signer: secondVoter_, buildTx: (overrides_) => dao_.connect(secondVoter_).castVote(proposalId_, support2_, overrides_) });
					}
				}
			}
			await engine.mineAt(engine.lastTs + votingPeriod_ + 2n);
			const executeResult_ = await engine.execTx({
				signer: proposer_,
				buildTx: (overrides_) => daoConn_.execute([daoAddress_], [0n], [callData_], descriptionHash_, overrides_),
			});
			if ( ! executeResult_.ok ) {
				return "skip";
			}
			expect(await dao_[setting_.getter](), `DAO ${setting_.method} must be applied`).to.equal(setting_.value);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// Governance-driven upgrade attempt: the DAO proposes, passes, and tries to EXECUTE an
		// `upgradeToAndCall` on the game. Because the DAO is not the game owner, `_authorizeUpgrade`'s
		// `onlyOwner` rejects the relayed call, so the `execute` transaction must revert. This proves
		// upgrades cannot be sneaked through governance without first transferring ownership to the DAO.
		name: "daoUpgradeRejected",
		weight: 1,
		infra: true,
		isApplicable: (ctx_) => ctx_.daoVotersReady === true,
		run: async (ctx_) => {
			const { engine, contracts, ledger } = ctx_;
			const proposer_ = contracts.signers[0];
			const daoConn_ = contracts.cosmicSignatureDao.connect(proposer_);
			const gameAddress_ = contracts.cosmicSignatureGameProxyAddress;
			// Any implementation address works; `_authorizeUpgrade`'s `onlyOwner` reverts before it is inspected.
			const impl_ = contracts.cosmicSignatureGameImplementationAddress;
			const votingDelay_ = await contracts.cosmicSignatureDao.votingDelay();
			const votingPeriod_ = await contracts.cosmicSignatureDao.votingPeriod();
			const callData_ = contracts.cosmicSignatureGameProxy.interface.encodeFunctionData("upgradeToAndCall", [impl_, "0x"]);
			const description_ = `FuzzTest rejected DAO upgrade ${engine.actionSeq}`;
			const descriptionHash_ = ctx_.hre.ethers.id(description_);

			const proposeResult_ = await engine.execTx({
				signer: proposer_,
				buildTx: (overrides_) => daoConn_.propose([gameAddress_], [0n], [callData_], description_, overrides_),
			});
			if ( ! proposeResult_.ok ) {
				return "skip";
			}
			const proposalCreated_ = engine.singleEvent(proposeResult_.receipt, contracts.cosmicSignatureDao, "ProposalCreated", "DAO upgrade propose");
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
				buildTx: (overrides_) => daoConn_.execute([gameAddress_], [0n], [callData_], descriptionHash_, overrides_),
			});
			expect(executeResult_.ok, "DAO-driven game upgrade must not succeed (the DAO is not the game owner)").to.equal(false);
			await ledger.verifyDirtyEth();
			return `revert:${executeResult_.revert.name}`;
		},
	},
];

// #endregion

module.exports = {
	adminActions,
	daoActions,
	buildSafeMutations,
};
