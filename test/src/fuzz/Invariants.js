"use strict";

// #region Imports

const { expect } = require("chai");
const { ZERO_ADDRESS } = require("./GameModel.js");

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
			...ctx_.actors.map((a_) => a_.lower),
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
	if (model.version === 2) {
		expect(await game_.cstDutchAuctionDuration(), "cstDutchAuctionDuration vs model").to.equal(model.cstDutchAuctionDuration);
		expect(await game_.cstDutchAuctionDurationChangeDivisor(), "cstDutchAuctionDurationChangeDivisor vs model").to.equal(model.cstDutchAuctionDurationChangeDivisor);
		expect(await game_.bidCstRewardAmountMultiplier(), "bidCstRewardAmountMultiplier vs model").to.equal(model.bidCstRewardAmountMultiplier);
	} else {
		expect(await game_.cstDutchAuctionDurationDivisor(), "cstDutchAuctionDurationDivisor vs model").to.equal(model.cstDutchAuctionDurationDivisor);
		expect(await game_.bidCstRewardAmount(), "bidCstRewardAmount vs model").to.equal(model.bidCstRewardAmount);
	}

	// Bid statistics tail.
	{
		const onChainNumBids_ = await game_.getTotalNumBids(model.roundNum);
		expect(onChainNumBids_, "getTotalNumBids vs model").to.equal(model.getTotalNumBids(model.roundNum));
		if (model.lastBidderAddress !== ZERO_ADDRESS && onChainNumBids_ > 0n) {
			const tail_ = await game_.getBidderAddressAt(model.roundNum, onChainNumBids_ - 1n);
			expect(tail_.toLowerCase(), "bid log tail == lastBidderAddress").to.equal(model.lastBidderAddress);
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

		if (model.version === 2) {
			const onChainReward_ = await game_.getBidCstRewardAmount();
			expect(onChainReward_, "getBidCstRewardAmount vs model").to.equal(model.getBidCstRewardAmount(ts_));
			expect(await game_.getBidCstRewardAmountAdvanced(0n), "getBidCstRewardAmount == Advanced(0)").to.equal(onChainReward_);
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
		const sentinel_ = (1n << 256n) - 1n;
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

	++ ctx_.invariantRunCount;
}

// #endregion
// #region End-of-campaign coverage floors

/**
Asserts that the campaign exercised a healthy breadth of behavior. In a long run, core actions
must each have succeeded at least once; a silently-dead action (e.g. a permanently inapplicable
guard) should fail this. In the quick CI profile the floors are relaxed.
@param {import("./FuzzEngine.js").FuzzEngine} engine_
@param {object} profile_
*/
function assertCoverageFloors(engine_, profile_) {
	const succeeded_ = (name_) => (engine_.stats.get(name_)?.succeeded ?? 0);
	const attempted_ = (name_) => (engine_.stats.get(name_)?.attempted ?? 0);

	// Every registered action must have been attempted at least once.
	for (const [name_, entry_] of engine_.stats) {
		expect(entry_.attempted + entry_.skipped, `action ${name_} was never even selected`).to.be.greaterThan(0);
	}

	if ( ! profile_.enforceStrongCoverage ) {
		return;
	}

	const mustSucceed_ = [
		"bidWithEth",
		"bidWithEthPlusRandomWalkNft",
		"bidWithCst",
		"claimMainPrize",
		"stakeCosmicSignatureNft",
		"unstakeCosmicSignatureNft",
		"stakeRandomWalkNft",
		"withdrawEthPrize",
		"mintRandomWalkNft",
		"donateEth",
	];
	for (const name_ of mustSucceed_) {
		expect(succeeded_(name_), `core action ${name_} never succeeded (att=${attempted_(name_)})`).to.be.greaterThan(0);
	}
}

// #endregion

module.exports = {
	runInvariants,
	assertCoverageFloors,
};
