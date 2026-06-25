"use strict";

// #region Imports

const { expect } = require("chai");
const { ZERO_ADDRESS } = require("./GameModel.js");
const { MAX_UINT256 } = require("../../../src/BigIntMathHelpers.js");

// #endregion
// #region Invariant suite

/**
Full invariant suite. Runs against live chain state, the exact `GameModel`, and the `ShadowState`
ledgers. Called periodically by the campaign and at every phase boundary.

Throwing here is a real failure; the caller dumps the trace and the seed.
*/
async function runInvariants(ctx_) {
	const { engine, model, ledger, contracts } = ctx_;
	const game_ = ctx_.game.contract;
	const ts_ = engine.lastTs;

	// #region Conservation / solvency

	await ledger.verifyAllEth();

	// CST: per-address ledger == chain, and totalSupply == ledger total.
	{
		const onChainTotalSupply_ = await contracts.cosmicSignatureToken.totalSupply();
		expect(onChainTotalSupply_, "CST totalSupply vs ledger").to.equal(ledger.cstTotalSupply);
		let sum_ = 0n;
		for (const [address_, balance_] of ledger.cst) {
			const onChain_ = await contracts.cosmicSignatureToken.balanceOf(address_);
			expect(onChain_, `CST balance mismatch for ${ledger.labelOf(address_)}`).to.equal(balance_);
			sum_ += balance_;
		}
		expect(sum_, "CST ledger sum vs totalSupply (closed holder set)").to.equal(onChainTotalSupply_);
	}

	// Mock ERC-20 ledger == chain for tracked holders, and PrizesWallet holds the unclaimed donations.
	{
		const trackedHolders_ = new Set([
			...ctx_.actors.map((a_) => a_.addressLower),
			contracts.prizesWalletAddress.toLowerCase(),
		]);
		for (const holder_ of trackedHolders_) {
			const onChain_ = await contracts.fuzzTestMockErc20.balanceOf(holder_);
			expect(onChain_, `mock ERC-20 balance mismatch for ${ledger.labelOf(holder_)}`).to.equal(ledger.mockErc20BalanceOf(holder_));
		}
	}

	// #endregion
	// #region NFT custody

	// Cosmic Signature NFT: ownership ledger == chain; staked count == wallet balance.
	{
		const totalSupply_ = await contracts.cosmicSignatureNft.totalSupply();
		expect(totalSupply_, "CS NFT totalSupply vs ledger").to.equal(BigInt(ledger.csNftOwners.size));
		const stakingBalance_ = await contracts.cosmicSignatureNft.balanceOf(contracts.stakingWalletCosmicSignatureNftAddress);
		expect(stakingBalance_, "CS staking custody vs numStakedNfts").to.equal(ledger.csStaking.numStakedNfts);
		const onChainNumStaked_ = await contracts.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(onChainNumStaked_, "CS numStakedNfts ledger").to.equal(ledger.csStaking.numStakedNfts);
	}

	// Random Walk NFT staking custody == numStakedNfts.
	{
		const stakingBalance_ = await contracts.randomWalkNft.balanceOf(contracts.stakingWalletRandomWalkNftAddress);
		expect(stakingBalance_, "RW staking custody vs numStakedNfts").to.equal(ledger.rwStaking.numStakedNfts);
		const onChainNumStaked_ = await contracts.stakingWalletRandomWalkNft.numStakedNfts();
		expect(onChainNumStaked_, "RW numStakedNfts ledger").to.equal(ledger.rwStaking.numStakedNfts);
	}

	// Staking counters: numStakedNfts <= actionCounter.
	{
		expect(ledger.csStaking.numStakedNfts <= ledger.csStaking.actionCounter, "CS numStaked <= actionCounter").to.equal(true);
		expect(ledger.rwStaking.numStakedNfts <= ledger.rwStaking.actionCounter, "RW numStaked <= actionCounter").to.equal(true);
		expect(await contracts.stakingWalletCosmicSignatureNft.actionCounter()).to.equal(ledger.csStaking.actionCounter);
		expect(await contracts.stakingWalletRandomWalkNft.actionCounter()).to.equal(ledger.rwStaking.actionCounter);
		expect(await contracts.stakingWalletCosmicSignatureNft.rewardAmountPerStakedNft()).to.equal(ledger.csStaking.rewardAmountPerStakedNft);
	}

	// #endregion
	// #region Game model equality (round / champions / counters)

	expect(await game_.roundNum(), "roundNum vs model").to.equal(model.roundNum);
	expect(await game_.roundActivationTime(), "roundActivationTime vs model").to.equal(model.roundActivationTime);
	expect(await game_.mainPrizeTime(), "mainPrizeTime vs model").to.equal(model.mainPrizeTime);
	expect(await game_.mainPrizeTimeIncrementInMicroSeconds(), "mainPrizeTimeIncrement vs model").to.equal(model.mainPrizeTimeIncrementInMicroSeconds);
	expect((await game_.lastBidderAddress()).toLowerCase(), "lastBidderAddress vs model").to.equal(model.lastBidderAddress);
	expect((await game_.lastCstBidderAddress()).toLowerCase(), "lastCstBidderAddress vs model").to.equal(model.lastCstBidderAddress);
	expect((await game_.enduranceChampionAddress()).toLowerCase(), "enduranceChampionAddress vs model").to.equal(model.enduranceChampionAddress);
	expect((await game_.chronoWarriorAddress()).toLowerCase(), "chronoWarriorAddress vs model").to.equal(model.chronoWarriorAddress);
	expect(await game_.chronoWarriorDuration(), "chronoWarriorDuration vs model").to.equal(model.chronoWarriorDurationUint());
	expect(await game_.nextEthBidPrice(), "nextEthBidPrice vs model").to.equal(model.nextEthBidPrice);
	expect(await game_.ethDutchAuctionBeginningBidPrice(), "ethDutchAuctionBeginningBidPrice vs model").to.equal(model.ethDutchAuctionBeginningBidPrice);
	expect(await game_.cstDutchAuctionBeginningTimeStamp(), "cstDutchAuctionBeginningTimeStamp vs model").to.equal(model.cstDutchAuctionBeginningTimeStamp);
	if ( ! model.isV1Like() ) {
		expect(await game_.cstDutchAuctionDuration(), "cstDutchAuctionDuration vs model").to.equal(model.cstDutchAuctionDuration);
		expect(await game_.cstDutchAuctionDurationChangeDivisor(), "cstDutchAuctionDurationChangeDivisor vs model").to.equal(model.cstDutchAuctionDurationChangeDivisor);
		expect(await game_.bidCstRewardAmountMultiplier(), "bidCstRewardAmountMultiplier vs model").to.equal(model.bidCstRewardAmountMultiplier);
	} else {
		expect(await game_.cstDutchAuctionDurationDivisor(), "cstDutchAuctionDurationDivisor vs model").to.equal(model.cstDutchAuctionDurationDivisor);
		expect(await game_.bidCstRewardAmount(), "bidCstRewardAmount vs model").to.equal(model.bidCstRewardAmount);
	}

	{
		const durationElapsedSinceRoundActivation_ = BigInt(ts_) - model.roundActivationTime;
		expect(await game_.getDurationElapsedSinceRoundActivation(), "getDurationElapsedSinceRoundActivation vs model")
			.to.equal(durationElapsedSinceRoundActivation_);
		expect(await game_.getDurationUntilRoundActivation(), "getDurationUntilRoundActivation vs model")
			.to.equal(-durationElapsedSinceRoundActivation_);

		const durationUntilMainPrizeRaw_ = model.mainPrizeTime - BigInt(ts_);
		expect(await game_.getDurationUntilMainPrizeRaw(), "getDurationUntilMainPrizeRaw vs model")
			.to.equal(durationUntilMainPrizeRaw_);
		expect(await game_.getDurationUntilMainPrize(), "getDurationUntilMainPrize vs model")
			.to.equal((durationUntilMainPrizeRaw_ > 0n) ? durationUntilMainPrizeRaw_ : 0n);

		const [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_] = await game_.getCstDutchAuctionDurations();
		expect(cstDutchAuctionDuration_, "getCstDutchAuctionDurations duration vs model").to.equal(model.getCstDutchAuctionDuration());
		expect(cstDutchAuctionElapsedDuration_, "getCstDutchAuctionDurations elapsed vs model")
			.to.equal(BigInt(ts_) - model.cstDutchAuctionBeginningTimeStamp);

		expect(await game_.numEthDonationWithInfoRecords(), "numEthDonationWithInfoRecords vs ledger")
			.to.equal(ledger.ethDonationWithInfoRecordCount);
	}

	// Full owner-configurable parameter equality (catches any admin/halve mutation drift immediately,
	// before it silently corrupts price/reward predictions many rounds later).
	{
		const checkCfg_ = async (getter_, modelValue_) => {
			expect(await game_[getter_](), `config drift: ${getter_}`).to.equal(modelValue_);
		};
		await checkCfg_("delayDurationBeforeRoundActivation", model.delayDurationBeforeRoundActivation);
		await checkCfg_("ethDutchAuctionDurationDivisor", model.ethDutchAuctionDurationDivisor);
		await checkCfg_("ethDutchAuctionEndingBidPriceDivisor", model.ethDutchAuctionEndingBidPriceDivisor);
		await checkCfg_("ethBidPriceIncreaseDivisor", model.ethBidPriceIncreaseDivisor);
		await checkCfg_("ethBidRefundAmountInGasToSwallowMaxLimit", model.ethBidRefundAmountInGasToSwallowMaxLimit);
		await checkCfg_("cstDutchAuctionBeginningBidPriceMinLimit", model.cstDutchAuctionBeginningBidPriceMinLimit);
		await checkCfg_("bidMessageLengthMaxLimit", model.bidMessageLengthMaxLimit);
		await checkCfg_("cstPrizeAmount", model.cstPrizeAmount);
		await checkCfg_("chronoWarriorEthPrizeAmountPercentage", model.chronoWarriorEthPrizeAmountPercentage);
		await checkCfg_("raffleTotalEthPrizeAmountForBiddersPercentage", model.raffleTotalEthPrizeAmountForBiddersPercentage);
		await checkCfg_("numRaffleEthPrizesForBidders", model.numRaffleEthPrizesForBidders);
		await checkCfg_("numRaffleCosmicSignatureNftsForBidders", model.numRaffleCosmicSignatureNftsForBidders);
		await checkCfg_("numRaffleCosmicSignatureNftsForRandomWalkNftStakers", model.numRaffleCosmicSignatureNftsForRandomWalkNftStakers);
		await checkCfg_("cosmicSignatureNftStakingTotalEthRewardAmountPercentage", model.cosmicSignatureNftStakingTotalEthRewardAmountPercentage);
		await checkCfg_("initialDurationUntilMainPrizeDivisor", model.initialDurationUntilMainPrizeDivisor);
		await checkCfg_("mainPrizeTimeIncrementIncreaseDivisor", model.mainPrizeTimeIncrementIncreaseDivisor);
		await checkCfg_("timeoutDurationToClaimMainPrize", model.timeoutDurationToClaimMainPrize);
		await checkCfg_("mainEthPrizeAmountPercentage", model.mainEthPrizeAmountPercentage);
		await checkCfg_("marketingWalletCstContributionAmount", model.marketingWalletCstContributionAmount);
		await checkCfg_("charityEthDonationAmountPercentage", model.charityEthDonationAmountPercentage);
		expect((await game_.charityAddress()).toLowerCase(), "config drift: charityAddress").to.equal(model.charityAddress);
	}

	// Bid statistics tail.
	{
		const onChainNumBids_ = await game_.getTotalNumBids(model.roundNum);
		expect(onChainNumBids_, "getTotalNumBids vs model").to.equal(model.getTotalNumBids(model.roundNum));
		if (model.lastBidderAddress !== ZERO_ADDRESS && onChainNumBids_ > 0n) {
			const tail_ = await game_.getBidderAddressAt(model.roundNum, onChainNumBids_ - 1n);
			expect(tail_.toLowerCase(), "bid log tail == lastBidderAddress").to.equal(model.lastBidderAddress);
			const bidderInfo_ = model.getBidderInfo(model.roundNum, model.lastBidderAddress);
			const [ethSpent_, cstSpent_] = await game_.getBidderTotalSpentAmounts(model.roundNum, model.lastBidderAddress);
			expect(ethSpent_, "getBidderTotalSpentAmounts ETH vs model").to.equal(bidderInfo_.totalSpentEthAmount);
			expect(cstSpent_, "getBidderTotalSpentAmounts CST vs model").to.equal(bidderInfo_.totalSpentCstAmount);
		}
	}

	// #endregion
	// #region Price view equality + self-consistency

	{
		const onChainEthPrice_ = await game_.getNextEthBidPrice();
		expect(onChainEthPrice_, "getNextEthBidPrice vs model").to.equal(model.getNextEthBidPrice(ts_));
		expect(await game_.getNextEthBidPriceAdvanced(0n), "getNextEthBidPrice == Advanced(0)").to.equal(onChainEthPrice_);

		const onChainCstPrice_ = await game_.getNextCstBidPrice();
		expect(onChainCstPrice_, "getNextCstBidPrice vs model").to.equal(model.getNextCstBidPrice(ts_));
		expect(await game_.getNextCstBidPriceAdvanced(0n), "getNextCstBidPrice == Advanced(0)").to.equal(onChainCstPrice_);

		if ( ! model.isV1Like() ) {
			const onChainReward_ = await game_.getBidCstRewardAmount();
			expect(onChainReward_, "getBidCstRewardAmount vs model").to.equal(model.getBidCstRewardAmount(ts_));
			expect(await game_.getBidCstRewardAmountAdvanced(0n), "getBidCstRewardAmount == Advanced(0)").to.equal(onChainReward_);
		}
		if (model.version === 3) {
			const onChainRwPrice_ = await game_.getNextEthPlusRandomWalkNftBidPrice();
			expect(onChainRwPrice_, "getNextEthPlusRandomWalkNftBidPrice vs model").to.equal(model.getNextEthPlusRandomWalkNftBidPrice(ts_));
			expect(await game_.getNextEthPlusRandomWalkNftBidPriceAdvanced(0n), "getNextEthPlusRandomWalkNftBidPrice == Advanced(0)").to.equal(onChainRwPrice_);
		}
	}

	// `tryGetCurrentChampions` matches the model projection.
	{
		const champions_ = await game_.tryGetCurrentChampions();
		const projected_ = model.tryGetCurrentChampions(ts_);
		expect(champions_[0].toLowerCase(), "tryGetCurrentChampions endurance addr").to.equal(projected_.enduranceChampionAddress);
		expect(champions_[1], "tryGetCurrentChampions endurance duration").to.equal(projected_.enduranceChampionDuration);
		expect(champions_[2].toLowerCase(), "tryGetCurrentChampions chrono addr").to.equal(projected_.chronoWarriorAddress);
		expect(champions_[3], "tryGetCurrentChampions chrono duration").to.equal(projected_.chronoWarriorDuration);
	}

	// Chrono sentinel rule: (addr == 0) == (duration is sentinel).
	{
		const chronoAddr_ = await game_.chronoWarriorAddress();
		const chronoDur_ = await game_.chronoWarriorDuration();
		const sentinel_ = MAX_UINT256;
		if (chronoAddr_ === ZERO_ADDRESS) {
			expect(chronoDur_, "zero chrono addr => sentinel duration").to.equal(sentinel_);
		} else {
			expect(chronoDur_ <= (1n << 255n) - 1n, "nonzero chrono addr => non-sentinel duration").to.equal(true);
		}
	}

	// #endregion
	// #region Secondary prize amount views

	{
		const gameBalance_ = ledger.expectedEth(ctx_.game.address);
		expect(await game_.getMainEthPrizeAmount(), "getMainEthPrizeAmount").to.equal(gameBalance_ * model.mainEthPrizeAmountPercentage / 100n);
		expect(await game_.getCharityEthDonationAmount(), "getCharityEthDonationAmount").to.equal(gameBalance_ * model.charityEthDonationAmountPercentage / 100n);
		expect(await game_.getChronoWarriorEthPrizeAmount(), "getChronoWarriorEthPrizeAmount").to.equal(gameBalance_ * model.chronoWarriorEthPrizeAmountPercentage / 100n);
		expect(await game_.getRaffleTotalEthPrizeAmountForBidders(), "getRaffleTotalEthPrizeAmountForBidders").to.equal(gameBalance_ * model.raffleTotalEthPrizeAmountForBiddersPercentage / 100n);
		expect(await game_.getCosmicSignatureNftStakingTotalEthRewardAmount(), "getCosmicSignatureNftStakingTotalEthRewardAmount").to.equal(gameBalance_ * model.cosmicSignatureNftStakingTotalEthRewardAmountPercentage / 100n);
	}

	// #endregion
	// #region PrizesWallet solvency

	{
		const onChainBalance_ = await engine.provider.getBalance(contracts.prizesWalletAddress);
		expect(onChainBalance_ >= ledger.prizesWalletEthTotal(), "PrizesWallet must hold at least its tracked ETH obligations").to.equal(true);
		expect(await contracts.prizesWallet.nextDonatedNftIndex(), "PrizesWallet nextDonatedNftIndex").to.equal(ledger.prizesWallet.nextDonatedNftIndex);
	}

	// #endregion
	// #region Independent (non-mirrored) invariants

	// These deliberately avoid reusing the `GameModel`'s prize/price arithmetic, so a bug mirrored
	// identically in the model and the contract cannot hide here.

	// 1. The ETH the game pays out per round can never exceed 100% of its balance: the owner-set
	//    percentages must sum to at most 100 (read straight from the chain, no model involved).
	{
		const pctSum_ =
			(await game_.mainEthPrizeAmountPercentage()) +
			(await game_.chronoWarriorEthPrizeAmountPercentage()) +
			(await game_.raffleTotalEthPrizeAmountForBiddersPercentage()) +
			(await game_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()) +
			(await game_.charityEthDonationAmountPercentage());
		expect(pctSum_ <= 100n, `prize percentage sum exceeds 100% (${pctSum_})`).to.equal(true);
	}

	// 2. Global ETH conservation across the whole tracked universe: every wei was either injected
	//    (`totalRefilled`) and is still held somewhere tracked, or was burned as gas to the (untracked)
	//    coinbase. This is pure ledger bookkeeping; it catches any unpaired `addEth` (ETH minted/destroyed
	//    in the ledger) regardless of whether per-address chain reads happen to agree.
	{
		let trackedSum_ = 0n;
		for (const balance_ of ledger.eth.values()) {
			trackedSum_ += balance_;
		}
		expect(trackedSum_ + ledger.totalGasBurned, "global ETH conservation (sum + gas == injected + pre-existing)").to.equal(ledger.totalRefilled + ledger.conservationOffset);
	}

	// 3. CST supply reconciled from independent mint/burn tallies (mint == transfer from zero, burn ==
	//    transfer to zero), cross-checked against the chain's `totalSupply`.
	{
		expect(ledger.cstTotalMinted - ledger.cstTotalBurned, "CST minted - burned == ledger totalSupply").to.equal(ledger.cstTotalSupply);
		expect(await contracts.cosmicSignatureToken.totalSupply(), "CST minted - burned == chain totalSupply").to.equal(ledger.cstTotalMinted - ledger.cstTotalBurned);
	}

	// #endregion

	++ ctx_.invariantRunCount;
}

// #endregion
// #region End-of-campaign coverage floors

/** Minimum aggregate attempted-action volume before the strong (breadth) floors are statistically meaningful. */
const STRONG_COVERAGE_MIN_ATTEMPTS = 3000;

function hasMinimalCoverageFloors(statsMap_) {
	const succeeded_ = (name_) => (statsMap_.get(name_)?.succeeded ?? 0);
	return (
		succeeded_("bidWithEth") > 0 &&
		(
			succeeded_("claimMainPrize") +
			succeeded_("claimMainPrizeAfterTimeout") +
			succeeded_("claimMainPrizeWithOverflowingDelay") +
			succeeded_("claimRace")
		) > 0
	);
}

/**
Asserts that the run exercised a healthy breadth of behavior.

Two tiers:
- Minimal (always): a couple of deterministically-guaranteed actions (an ETH bid and a main-prize
  claim) must have succeeded. The engine forces a claim at every segment boundary and ETH bids are
  the highest-weight action, so these never flake.
- Strong (only once the aggregate has enough volume — i.e. across a multi-campaign soak): every
  registered action must have been selected at least once (catches a permanently-dead action), and
  every core action must have succeeded at least once. These are probabilistic for a single bounded
  campaign, so they are only enforced on the larger aggregate where low-weight actions reliably fire.

@param {Map<string, {attempted: number, succeeded: number, skipped: number}>} statsMap_
@param {object} profile_
*/
function assertCoverageFloors(statsMap_, profile_) {
	const succeeded_ = (name_) => (statsMap_.get(name_)?.succeeded ?? 0);
	const attempted_ = (name_) => (statsMap_.get(name_)?.attempted ?? 0);

	let totalSucceeded_ = 0;
	let totalAttempted_ = 0;
	for (const entry_ of statsMap_.values()) {
		totalSucceeded_ += entry_.succeeded;
		totalAttempted_ += entry_.attempted;
	}
	expect(totalSucceeded_, "no successful actions at all").to.be.greaterThan(0);

	// Minimal deterministic floor.
	expect(succeeded_("bidWithEth"), "bidWithEth never succeeded").to.be.greaterThan(0);
	expect(hasMinimalCoverageFloors(statsMap_), "no main prize was ever claimed").to.equal(true);

	if ( ! profile_.enforceStrongCoverage || totalAttempted_ < STRONG_COVERAGE_MIN_ATTEMPTS ) {
		return;
	}

	// Strong breadth floors (aggregate / soak level): every registered action must have been selected
	// at least once (proving it is reachable and wired), ...
	for (const [name_, entry_] of statsMap_) {
		expect(entry_.attempted + entry_.skipped, `action ${name_} was never even selected`).to.be.greaterThan(0);
	}
	// ... and every meaningful user action the protocol supports must have actually SUCCEEDED at least
	// once across the soak — covering bids (ETH / Random Walk NFT / CST), staking and unstaking, ETH and
	// donation flows, prize and donated-asset withdrawals (the winner receiving donated NFTs/ERC-20s),
	// CST/NFT transfers and signatures, RW mint/withdraw, and the V1->V2 upgrade auth probe.
	const mustSucceed_ = [
		"bidWithEth", "bidWithEthExactPrice", "bidWithEthSwallow", "bidWithEthRefund",
		"bidWithEthPlusRandomWalkNft", "bidWithEthReceive", "bidWithEthAndDonateToken", "bidWithEthAndDonateNft",
		"bidWithCst", "bidWithCstExactLimit", "bidWithCstAndDonateToken", "bidWithCstAndDonateNft",
		"claimMainPrize",
		"stakeCosmicSignatureNft", "unstakeCosmicSignatureNft", "stakeManyCosmicSignatureNft",
		"stakeRandomWalkNft", "unstakeRandomWalkNft",
		"withdrawEthPrize", "withdrawEthPrizeMany", "withdrawEverythingBatch",
		"claimDonatedToken", "claimDonatedNft",
		"donateEth", "donateEthWithInfo",
		"mintRandomWalkNft",
		"transferCst", "cstBurn", "cstDelegateSelf", "cstPermit", "cstDelegateBySig", "cstBurnFrom",
		"transferCosmicSignatureNft", "safeTransferCosmicSignatureNft", "transferRandomWalkNft",
		"setCosmicSignatureNftName", "setRandomWalkTokenName",
		"charityWalletSendAll", "marketingWalletPayReward",
		"adminMutateParameters", "daoGovernanceCycle",
		"adversarialReentrancyOnBidRefund", "adversarialMaliciousTokenDonation",
		"upgradeAuthProbe",
	];
	const neverSucceeded_ = mustSucceed_.filter((name_) => succeeded_(name_) <= 0);
	expect(
		neverSucceeded_.length,
		`these required actions never succeeded across the soak: ${neverSucceeded_.map((n_) => `${n_}(att=${attempted_(n_)})`).join(", ")}`
	).to.equal(0);
}

/**
Prints a coverage report: how many of the registered actions succeeded at least once, and any that
did not. Action-level coverage; for Solidity line/branch coverage run `npx hardhat coverage`.
@param {Map<string, {attempted: number, succeeded: number, skipped: number}>} statsMap_
*/
function printCoverageReport(statsMap_) {
	const all_ = [...statsMap_.keys()].sort();
	const succeeded_ = all_.filter((name_) => (statsMap_.get(name_)?.succeeded ?? 0) > 0);
	const neverOk_ = all_.filter((name_) => (statsMap_.get(name_)?.succeeded ?? 0) <= 0);
	console.info(`\n  ACTION COVERAGE: ${succeeded_.length}/${all_.length} distinct actions succeeded at least once.`);
	if (neverOk_.length > 0) {
		console.info(`  Actions that never succeeded (selected but always skipped/reverted): ${neverOk_.join(", ")}`);
	}
}

/**
Merges a campaign's engine stats into an aggregate map (summing attempted/succeeded/skipped).
@param {Map<string, {attempted: number, succeeded: number, skipped: number}>} aggregate_
@param {Map<string, {attempted: number, succeeded: number, skipped: number}>} statsMap_
*/
function mergeStatsInto(aggregate_, statsMap_) {
	for (const [name_, entry_] of statsMap_) {
		const existing_ = aggregate_.get(name_) ?? { attempted: 0, succeeded: 0, skipped: 0 };
		existing_.attempted += entry_.attempted;
		existing_.succeeded += entry_.succeeded;
		existing_.skipped += entry_.skipped;
		aggregate_.set(name_, existing_);
	}
}

// #endregion

module.exports = {
	runInvariants,
	assertCoverageFloors,
	hasMinimalCoverageFloors,
	printCoverageReport,
	mergeStatsInto,
};
