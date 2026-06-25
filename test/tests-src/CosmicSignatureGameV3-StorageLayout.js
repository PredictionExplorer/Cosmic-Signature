"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	completeRoundZero,
	expectUnknownSelector,
	upgradeToV2,
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
		cstDutchAuctionDuration: await game_.cstDutchAuctionDuration(),
		cstDutchAuctionDurationChangeDivisor: await game_.cstDutchAuctionDurationChangeDivisor(),
		cstDutchAuctionBeginningBidPrice: await game_.cstDutchAuctionBeginningBidPrice(),
		nextRoundFirstCstDutchAuctionBeginningBidPrice: await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice(),
		cstDutchAuctionBeginningBidPriceMinLimit: await game_.cstDutchAuctionBeginningBidPriceMinLimit(),
		bidMessageLengthMaxLimit: await game_.bidMessageLengthMaxLimit(),
		bidCstRewardAmountMultiplier: await game_.bidCstRewardAmountMultiplier(),
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
	it("upgrades from V2 to V3 without changing carried state or adding old initializer selectors", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		await completeRoundZero(contracts_);
		await upgradeToV2(contracts_);

		const gameV2_ = contracts_.cosmicSignatureGameV2Proxy.connect(contracts_.ownerSigner);
		await waitForTransactionReceipt(gameV2_.setBidMessageLengthMaxLimit(123n));
		await waitForTransactionReceipt(gameV2_.setCstPrizeAmount(777n * 10n ** 18n));
		await waitForTransactionReceipt(gameV2_.setMarketingWalletCstContributionAmount(333n * 10n ** 18n));
		await waitForTransactionReceipt(gameV2_.setCharityEthDonationAmountPercentage(6n));

		const carriedState_ = await snapshotCarriedState(gameV2_);
		const cosmicSignatureGameV3Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
		await hre.upgrades.validateUpgrade(
			contracts_.cosmicSignatureGameProxy,
			cosmicSignatureGameV3Factory_,
			{ kind: "uups" }
		);

		await upgradeToV3(contracts_);
		const gameV3_ = contracts_.cosmicSignatureGameV3Proxy;

		await assertCarriedStateUnchanged(gameV3_, carriedState_);
		await expect(gameV3_.initializeV3()).revertedWithCustomError(gameV3_, "InvalidInitialization");
		await expectUnknownSelector(gameV3_, hre.ethers.id("initializeV2()").slice(0, 10));
	});
});
