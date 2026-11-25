"use strict";

const { expect } = require("chai");
const { describe, it } = require("mocha");
const hre = require("hardhat");
const { COSMIC_SIGNATURE_GAME_V3_SNAPSHOT_INDEX, withCodebaseSnapshotArtifacts } = require("../../src/CodebaseSnapshotTestHelpers.js");
const { TIMESTAMP_9000_01_01, SECONDS_PER_HOUR, SECONDS_PER_DAY } = require("../../src/CosmicSignatureConstants.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { completeRoundZero, upgradeGameToV2 } = require("../src/GameV2UpgradeTestHelpers.js");
const { upgradeGameToV3, assertDefaultGameV3Initialization } = require("../src/GameV3UpgradeTestHelpers.js");

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
		// V3 stops using `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor`,
		// but does not re-initialize them, so their getters keep returning the stale V2 values.
		// (`bidCstRewardAmountMultiplier` is NOT here: the V3 `reinitialize` re-initializes it,
		// which `assertDefaultGameV3Initialization` verifies.)
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
		const contracts_ = { ...await loadFixtureDeployContractsForTesting(2n) };
		await completeRoundZero(contracts_);
		await upgradeGameToV2(contracts_);
		const gameV2_ = contracts_.cosmicSignatureGameV2Proxy.connect(contracts_.ownerSigner);

		// Freeze the round so all the owner configuration calls below and the upgrade stay authorized.
		await waitForTransactionReceipt(gameV2_.setRoundActivationTime(TIMESTAMP_9000_01_01));

		// Move a few V1-era and V2-era parameters off their defaults, so "carried unchanged" is meaningful.
		await waitForTransactionReceipt(gameV2_.setDelayDurationBeforeRoundActivation(2n * SECONDS_PER_DAY));
		await waitForTransactionReceipt(gameV2_.setBidMessageLengthMaxLimit(123n));
		await waitForTransactionReceipt(gameV2_.setCstPrizeAmount(777n * 10n ** 18n));
		await waitForTransactionReceipt(gameV2_.setCstDutchAuctionDuration(11n * SECONDS_PER_HOUR));
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
		const completedRoundNumBids_ = await gameV2_.roundStats(0n);
		const firstBidderAddress_ = await gameV2_.getBidderAddressAt(0n, 0n);
		expect(completedRoundNumBids_).equal(1n);
		expect(firstBidderAddress_).equal(contracts_.signers[1].address);

		// The V3 `reinitialize` overwrites these values and the five prize percentages configured above.
		expect(await gameV2_.bidCstRewardAmountMultiplier()).equal(123_456_789n);
		expect(await gameV2_.cstDutchAuctionBeginningBidPriceMinLimit()).not.equal(10n ** 18n);

		// The 6 new V3 slots are taken from the gap region, so on V2 their getters must not even exist.
		// V3 also extends the existing roundStats getter with eight statistics.
		for (const newGetterName_ of [
			"cstBidPriceDeclineMultiplier()",
			"cstBidPriceDeclineMultiplierChangeDivisor()",
			"roundLateBidDurationDivisor()",
			"roundLateBidPricePremiumAmountBaseMultiplier()",
			"roundLateBidPricePremiumAmountExponent()",
			"mainPrizeNumCosmicSignatureNfts()",
		]) {
			await expect(
				hre.ethers.provider.call({
					to: contracts_.cosmicSignatureGameProxyAddress,
					data: hre.ethers.id(newGetterName_).slice(0, 10),
				})
			).revertedWithoutReason();
		}

		// OpenZeppelin storage layout validation of the V2 -> V3 upgrade, with no unsafe flags.
		await withCodebaseSnapshotArtifacts(
			COSMIC_SIGNATURE_GAME_V3_SNAPSHOT_INDEX,
			async () => {
				const cosmicSignatureGameV3Factory_ =
					await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
				await hre.upgrades.validateUpgrade(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV3Factory_,
					// `validateUpgrade` accepts validation options only; the initializer call is exercised by `upgradeGameToV3` below.
					{ kind: "uups" }
				);
			}
		);

		await upgradeGameToV3(contracts_);
		const gameV3_ = contracts_.cosmicSignatureGameV3Proxy;

		await assertCarriedStateUnchanged(gameV3_, carriedState_);
		await assertDefaultGameV3Initialization(gameV3_);
		expect(await gameV3_.roundStats(0n)).deep.equal([completedRoundNumBids_, ...Array(8).fill(0n)]);
		expect(await gameV3_.getBidInfoAt(0n, 0n)).deep.equal([firstBidderAddress_, 0n]);

		// These V2 pricing methods remain available after the upgrade.
		{
			// Comment-202610021 applies: ignore the indeterminate return value.
			await gameV3_.getBidCstRewardAmount();

			expect(await gameV3_.getNextEthBidPrice()).greaterThan(0n);
		}
	});
});
