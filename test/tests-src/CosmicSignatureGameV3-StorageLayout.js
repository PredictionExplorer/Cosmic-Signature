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

		// The 2 repurposed V2 slots and the 1 appended V2 slot must survive the V3 upgrade too.
		// The V3 `reinitialize` deliberately does not touch `cstDutchAuctionDuration` and
		// `cstDutchAuctionDurationChangeDivisor` (Comment-202608301): their live V2 values carry over,
		// and V3 keeps using them exactly like V2 did.
		// (`bidCstRewardAmountMultiplier` is NOT here: the V3 `reinitialize` re-initializes it,
		// which `assertDefaultV3Initialization` verifies.)
		cstDutchAuctionDuration: await game_.cstDutchAuctionDuration(),
		cstDutchAuctionDurationChangeDivisor: await game_.cstDutchAuctionDurationChangeDivisor(),

		cstDutchAuctionBeginningBidPrice: await game_.cstDutchAuctionBeginningBidPrice(),
		nextRoundFirstCstDutchAuctionBeginningBidPrice: await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice(),
		bidMessageLengthMaxLimit: await game_.bidMessageLengthMaxLimit(),
		cstPrizeAmount: await game_.cstPrizeAmount(),
		numRaffleEthPrizesForBidders: await game_.numRaffleEthPrizesForBidders(),
		numRaffleCosmicSignatureNftsForBidders: await game_.numRaffleCosmicSignatureNftsForBidders(),
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers: await game_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers(),
		initialDurationUntilMainPrizeDivisor: await game_.initialDurationUntilMainPrizeDivisor(),
		mainPrizeTime: await game_.mainPrizeTime(),
		mainPrizeTimeIncrementInMicroSeconds: await game_.mainPrizeTimeIncrementInMicroSeconds(),
		mainPrizeTimeIncrementIncreaseDivisor: await game_.mainPrizeTimeIncrementIncreaseDivisor(),
		timeoutDurationToClaimMainPrize: await game_.timeoutDurationToClaimMainPrize(),
		token: await game_.token(),
		randomWalkNft: await game_.randomWalkNft(),
		nft: await game_.nft(),
		prizesWallet: await game_.prizesWallet(),
		stakingWalletRandomWalkNft: await game_.stakingWalletRandomWalkNft(),
		stakingWalletCosmicSignatureNft: await game_.stakingWalletCosmicSignatureNft(),
		marketingWallet: await game_.marketingWallet(),
		marketingWalletCstContributionAmount: await game_.marketingWalletCstContributionAmount(),
		charityAddress: await game_.charityAddress(),
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
	it("preserves carried V1/V2 state and applies only the documented overwrites", async function () {
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
		await waitForTransactionReceipt(gameV2_.setMainEthPrizeAmountPercentage(31n));
		await waitForTransactionReceipt(gameV2_.setCharityEthDonationAmountPercentage(9n));
		await waitForTransactionReceipt(gameV2_.setRaffleTotalEthPrizeAmountForBiddersPercentage(7n));
		await waitForTransactionReceipt(gameV2_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(11n));
		await waitForTransactionReceipt(gameV2_.setChronoWarriorEthPrizeAmountPercentage(13n));
		expect(await gameV2_.mainEthPrizeAmountPercentage()).equal(31n);
		expect(await gameV2_.charityEthDonationAmountPercentage()).equal(9n);
		expect(await gameV2_.raffleTotalEthPrizeAmountForBiddersPercentage()).equal(7n);
		expect(await gameV2_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).equal(11n);
		expect(await gameV2_.chronoWarriorEthPrizeAmountPercentage()).equal(13n);

		const carriedState_ = await snapshotCarriedState(gameV2_);

		// The V3 `reinitialize` overwrites these values and the five prize percentages configured above.
		expect(await gameV2_.bidCstRewardAmountMultiplier()).equal(123_456_789n);
		expect(await gameV2_.cstDutchAuctionBeginningBidPriceMinLimit()).not.equal(10n ** 18n);

		// The 6 new V3 slots are taken from the gap region, so on V2 their getters must not even exist.
		const cosmicSignatureGameV3Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
		for (const newGetterName_ of [
			"championDurations(uint256)",
			"roundLateBidDurationDivisor()",
			"roundLateBidPricePremiumAmountBaseMultiplier()",
			"roundLateBidPricePremiumAmountExponent()",
			"mainPrizeNumCosmicSignatureNfts()",
			"bidRaffleCumulativeWeights(uint256,uint256)",
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
			// The constructor arguments are only used to assemble deploy data; nothing is deployed,
			// so zero module addresses are adequate here. Comment-202608245 applies.
			{ kind: "uups", constructorArgs: [hre.ethers.ZeroAddress, hre.ethers.ZeroAddress,] }
		);

		await upgradeToV3(contracts_);
		const gameV3_ = contracts_.cosmicSignatureGameV3Proxy;

		await assertCarriedStateUnchanged(gameV3_, carriedState_);
		await assertDefaultV3Initialization(gameV3_);

		// V3 removes no selectors; a couple of representative V2 methods must still exist and work.
		expect(await gameV3_.getBidCstRewardAmount()).greaterThanOrEqual(0n);
		expect(await gameV3_.getNextEthBidPrice()).greaterThan(0n);
	});
});
