"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR,
	DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2,
	INITIAL_CST_DUTCH_AUCTION_DURATION,
	completeRoundZero,
	expectUnknownSelector,
	upgradeToV2,
} = require("../src/V2UpgradeTestHelpers.js");

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
		mainPrizeTimeIncrementInMicroSeconds: await game_.mainPrizeTimeIncrementInMicroSeconds(),
		mainPrizeTimeIncrementIncreaseDivisor: await game_.mainPrizeTimeIncrementIncreaseDivisor(),
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
		expect(await game_[name_](), `${name_} should survive V2 upgrade unchanged`).equal(value_);
	}
}

describe("CosmicSignatureGameV2-StorageLayout", function () {
	it("preserves carried state, repurposes only documented slots, and removes old selectors", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		await completeRoundZero(contracts_);

		const gameV1_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner);

		await waitForTransactionReceipt(gameV1_.setDelayDurationBeforeRoundActivation(48n * 60n * 60n));
		await waitForTransactionReceipt(gameV1_.setBidMessageLengthMaxLimit(123n));
		await waitForTransactionReceipt(gameV1_.setCstPrizeAmount(777n * 10n ** 18n));
		await waitForTransactionReceipt(gameV1_.setMarketingWalletCstContributionAmount(333n * 10n ** 18n));
		await waitForTransactionReceipt(gameV1_.setCharityEthDonationAmountPercentage(6n));

		const carriedState_ = await snapshotCarriedState(gameV1_);
		const oldCstDutchAuctionDurationDivisor_ = await gameV1_.cstDutchAuctionDurationDivisor();
		const oldBidCstRewardAmount_ = await gameV1_.bidCstRewardAmount();
		expect(oldCstDutchAuctionDurationDivisor_).not.equal(INITIAL_CST_DUTCH_AUCTION_DURATION);
		expect(oldBidCstRewardAmount_).not.equal(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);

		const cosmicSignatureGameV2Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		await hre.upgrades.validateUpgrade(
			contracts_.cosmicSignatureGameProxy,
			cosmicSignatureGameV2Factory_,
			// todo-0 Should the `call` param be added to this object? If not, explain in a comment.
			{ kind: "uups" }
		);

		await upgradeToV2(contracts_);
		const gameV2_ = contracts_.cosmicSignatureGameV2Proxy;

		await assertCarriedStateUnchanged(gameV2_, carriedState_);

		expect(await gameV2_.cstDutchAuctionDuration()).equal(INITIAL_CST_DUTCH_AUCTION_DURATION);
		expect(await gameV2_.cstDutchAuctionDurationChangeDivisor()).equal(DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR);
		expect(await gameV2_.bidCstRewardAmountMultiplier()).equal(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);
		expect(await gameV2_.timeoutDurationToClaimMainPrize()).equal(DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2);

		await expectUnknownSelector(gameV2_, hre.ethers.id("cstDutchAuctionDurationDivisor()").slice(0, 10));
		await expectUnknownSelector(gameV2_, hre.ethers.id("bidCstRewardAmount()").slice(0, 10));
		await expectUnknownSelector(gameV2_, hre.ethers.id("cstRewardAmountForBidding()").slice(0, 10));
	});
});
