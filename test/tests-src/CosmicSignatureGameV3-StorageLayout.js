"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	TIMESTAMP_9000_01_01,
	completeRoundZero,
	upgradeToV2,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	assertDefaultV3Initialization,
	upgradeToV3,
} = require("../src/V3UpgradeTestHelpers.js");

async function snapshotCarriedState(game_) {
	return {
		owner: await game_.owner(),
		roundNum: await game_.roundNum(),
		delayDurationBeforeRoundActivation: await game_.delayDurationBeforeRoundActivation(),
		roundActivationTime: await game_.roundActivationTime(),
		ethDutchAuctionDurationDivisor: await game_.ethDutchAuctionDurationDivisor(),
		ethDutchAuctionBeginningBidPrice: await game_.ethDutchAuctionBeginningBidPrice(),
		ethDutchAuctionEndingBidPriceDivisor: await game_.ethDutchAuctionEndingBidPriceDivisor(),
		nextEthBidPrice: await game_.nextEthBidPrice(),
		ethBidPriceIncreaseDivisor: await game_.ethBidPriceIncreaseDivisor(),
		ethBidRefundAmountInGasToSwallowMaxLimit: await game_.ethBidRefundAmountInGasToSwallowMaxLimit(),
		cstDutchAuctionBeginningTimeStamp: await game_.cstDutchAuctionBeginningTimeStamp(),

		// V2 slots must survive the V3 upgrade too. `bidCstRewardAmountMultiplier` keeps its slot but is
		// intentionally RESET by the V3 `reinitialize` (Comment-202607165), so it is excluded here and
		// asserted via `assertDefaultV3Initialization` instead.
		cstDutchAuctionDuration: await game_.cstDutchAuctionDuration(),
		cstDutchAuctionDurationChangeDivisor: await game_.cstDutchAuctionDurationChangeDivisor(),

		cstDutchAuctionBeginningBidPrice: await game_.cstDutchAuctionBeginningBidPrice(),
		nextRoundFirstCstDutchAuctionBeginningBidPrice: await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice(),
		cstDutchAuctionBeginningBidPriceMinLimit: await game_.cstDutchAuctionBeginningBidPriceMinLimit(),
		bidMessageLengthMaxLimit: await game_.bidMessageLengthMaxLimit(),
		cstPrizeAmount: await game_.cstPrizeAmount(),
		chronoWarriorEthPrizeAmountPercentage: await game_.chronoWarriorEthPrizeAmountPercentage(),
		raffleTotalEthPrizeAmountForBiddersPercentage: await game_.raffleTotalEthPrizeAmountForBiddersPercentage(),
		numRaffleEthPrizesForBidders: await game_.numRaffleEthPrizesForBidders(),
		numRaffleCosmicSignatureNftsForBidders: await game_.numRaffleCosmicSignatureNftsForBidders(),
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers: await game_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers(),
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage: await game_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage(),
		initialDurationUntilMainPrizeDivisor: await game_.initialDurationUntilMainPrizeDivisor(),
		mainPrizeTime: await game_.mainPrizeTime(),
		mainPrizeTimeIncrementInMicroSeconds: await game_.mainPrizeTimeIncrementInMicroSeconds(),
		mainPrizeTimeIncrementIncreaseDivisor: await game_.mainPrizeTimeIncrementIncreaseDivisor(),
		timeoutDurationToClaimMainPrize: await game_.timeoutDurationToClaimMainPrize(),
		mainEthPrizeAmountPercentage: await game_.mainEthPrizeAmountPercentage(),
		token: await game_.token(),
		randomWalkNft: await game_.randomWalkNft(),
		nft: await game_.nft(),
		prizesWallet: await game_.prizesWallet(),
		stakingWalletRandomWalkNft: await game_.stakingWalletRandomWalkNft(),
		stakingWalletCosmicSignatureNft: await game_.stakingWalletCosmicSignatureNft(),
		marketingWallet: await game_.marketingWallet(),
		marketingWalletCstContributionAmount: await game_.marketingWalletCstContributionAmount(),
		charityAddress: await game_.charityAddress(),
		charityEthDonationAmountPercentage: await game_.charityEthDonationAmountPercentage(),
		lastBidderAddress: await game_.lastBidderAddress(),
		lastCstBidderAddress: await game_.lastCstBidderAddress(),
		enduranceChampionAddress: await game_.enduranceChampionAddress(),
		chronoWarriorAddress: await game_.chronoWarriorAddress(),
	};
}

async function assertCarriedStateUnchanged(game_, snapshot_) {
	for (const [name_, value_] of Object.entries(snapshot_)) {
		expect(await game_[name_](), `${name_} should survive V3 upgrade unchanged`).equal(value_);
	}
}

describe("CosmicSignatureGameV3-StorageLayout", function () {
	it("preserves carried V1/V2 state and appends only the documented new slots", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		await completeRoundZero(contracts_);
		await upgradeToV2(contracts_);
		const gameV2_ = contracts_.cosmicSignatureGameV2Proxy.connect(contracts_.ownerSigner);

		// Freeze the round so all the owner configuration calls below and the upgrade stay authorized.
		await waitForTransactionReceipt(gameV2_.setRoundActivationTime(TIMESTAMP_9000_01_01));

		// Move a few V1-era and V2-era parameters off their defaults, so "carried unchanged" is meaningful.
		await waitForTransactionReceipt(gameV2_.setDelayDurationBeforeRoundActivation(48n * 60n * 60n));
		await waitForTransactionReceipt(gameV2_.setBidMessageLengthMaxLimit(123n));
		await waitForTransactionReceipt(gameV2_.setCstPrizeAmount(777n * 10n ** 18n));
		await waitForTransactionReceipt(gameV2_.setCstDutchAuctionDuration(11n * 60n * 60n));
		await waitForTransactionReceipt(gameV2_.setCstDutchAuctionDurationChangeDivisor(234n));
		await waitForTransactionReceipt(gameV2_.setBidCstRewardAmountMultiplier(123_456_789n));

		const carriedState_ = await snapshotCarriedState(gameV2_);

		// The new V3 slots are taken from the gap region, so on V2 their getters (and the new V3 views)
		// must not even exist.
		const cosmicSignatureGameV3Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
		for (const newGetterName_ of [
			"roundLateBidDurationDivisor()",
			"roundLateBidPricePremiumAmountBaseMultiplier()",
			"roundLateBidPricePremiumAmountExponent()",
			"lastBidderBidCstRewardAmountPercentage()",
			"mainPrizeNumCosmicSignatureNfts()",
			"getBidCstRewardAmountPerMainPrizeTimeIncrement()",
			"getCstDutchAuctionBeginningBidPriceMinLimit()",
		]) {
			await expect(
				hre.ethers.provider.call({
					to: contracts_.cosmicSignatureGameProxyAddress,
					data: hre.ethers.id(newGetterName_).slice(0, 10),
				})
			).revertedWithoutReason();
		}

		// OpenZeppelin storage layout validation of the V2 -> V3 upgrade, with no unsafe flags.
		await hre.upgrades.validateUpgrade(
			contracts_.cosmicSignatureGameProxy,
			cosmicSignatureGameV3Factory_,
			// `validateUpgrade` accepts validation options only; the initializer call is exercised by `upgradeToV3` below.
			{ kind: "uups" }
		);

		await upgradeToV3(contracts_);
		const gameV3_ = contracts_.cosmicSignatureGameV3Proxy;

		await assertCarriedStateUnchanged(gameV3_, carriedState_);
		await assertDefaultV3Initialization(gameV3_);

		// The V2-era `bidCstRewardAmountMultiplier` (set off-default above) was reset by `reinitialize`
		// to the V3 default: it now drives the whole CST time standard (Comment-202607165).
		expect(await gameV3_.bidCstRewardAmountMultiplier()).not.equal(123_456_789n);

		// V3 removes no selectors; a couple of representative V2 methods must still exist and work.
		expect(await gameV3_.getBidCstRewardAmount()).greaterThanOrEqual(0n);
		expect(await gameV3_.getNextEthBidPrice()).greaterThan(0n);
	});
});
