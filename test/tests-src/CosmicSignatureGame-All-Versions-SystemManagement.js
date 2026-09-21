"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { testAcrossGameVersions, activateRoundBidAndClaimMainPrize } = require("../src/GameRoundTestHelpers.js");

describe("CosmicSignatureGame-All-Versions-SystemManagement", function () {
	it("Setters while the current bidding round is inactive", async function () {
		// Restore each setting through its setter so the same proxy can safely play subsequent rounds.
		await testAcrossGameVersions(async (contracts_, game_, roundNum_, contractVersionNumber_) => {
			const cosmicSignatureGameProxyForOwner_ = game_.connect(contracts_.ownerSigner);
			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.delayDurationBeforeRoundActivation();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "DelayDurationBeforeRoundActivationChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.delayDurationBeforeRoundActivation()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(prevValue_));
			}

			// After this, the current bidding round remains inactive.
			{
				const newValue_ = 123_456_789_012n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setRoundActivationTime(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "RoundActivationTimeChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.roundActivationTime()).equal(newValue_);
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.ethDutchAuctionDurationDivisor();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionDurationDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthDutchAuctionDurationDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethDutchAuctionDurationDivisor()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionDurationDivisor(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.ethDutchAuctionEndingBidPriceDivisor();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionEndingBidPriceDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthDutchAuctionEndingBidPriceDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethDutchAuctionEndingBidPriceDivisor()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionEndingBidPriceDivisor(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.ethBidPriceIncreaseDivisor();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthBidPriceIncreaseDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthBidPriceIncreaseDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethBidPriceIncreaseDivisor()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setEthBidPriceIncreaseDivisor(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.ethBidRefundAmountInGasToSwallowMaxLimit();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthBidRefundAmountInGasToSwallowMaxLimit(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthBidRefundAmountInGasToSwallowMaxLimitChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethBidRefundAmountInGasToSwallowMaxLimit()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setEthBidRefundAmountInGasToSwallowMaxLimit(prevValue_));
			}

			if (contractVersionNumber_ <= 1) {
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDurationDivisor();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionDurationDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDurationDivisor()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationDivisor(prevValue_));
			} else if (contractVersionNumber_ <= 2) {
				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDuration();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDuration(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionDurationChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDuration()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDuration(prevValue_));
				}

				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDurationChangeDivisor();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationChangeDivisor(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionDurationChangeDivisorChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDurationChangeDivisor()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationChangeDivisor(prevValue_));
				}
			} else {
				const newValue_ = 9n + generateRandomUInt256() % 3n;

				// Comment-202608014 applies.
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDuration(newValue_))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "NotImplemented");
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationChangeDivisor(newValue_))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "NotImplemented");
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.cstDutchAuctionBeginningBidPriceMinLimit();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionBeginningBidPriceMinLimitChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.bidMessageLengthMaxLimit();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setBidMessageLengthMaxLimit(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "BidMessageLengthMaxLimitChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.bidMessageLengthMaxLimit()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setBidMessageLengthMaxLimit(prevValue_));
			}

			if (contractVersionNumber_ <= 1) {
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.bidCstRewardAmount();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmount(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "BidCstRewardAmountChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.bidCstRewardAmount()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmount(prevValue_));
			} else {
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.bidCstRewardAmountMultiplier();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmountMultiplier(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "BidCstRewardAmountMultiplierChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.bidCstRewardAmountMultiplier()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmountMultiplier(prevValue_));
			}

			if (contractVersionNumber_ >= 3) {
				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.roundLateBidDurationDivisor();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setRoundLateBidDurationDivisor(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "RoundLateBidDurationDivisorChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.roundLateBidDurationDivisor()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setRoundLateBidDurationDivisor(prevValue_));
				}

				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.roundLateBidPricePremiumAmountBaseMultiplier();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setRoundLateBidPricePremiumAmountBaseMultiplier(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "RoundLateBidPricePremiumAmountBaseMultiplierChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.roundLateBidPricePremiumAmountBaseMultiplier()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setRoundLateBidPricePremiumAmountBaseMultiplier(prevValue_));
				}

				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.roundLateBidPricePremiumAmountExponent();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setRoundLateBidPricePremiumAmountExponent(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "RoundLateBidPricePremiumAmountExponentChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.roundLateBidPricePremiumAmountExponent()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setRoundLateBidPricePremiumAmountExponent(prevValue_));
				}

				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.cstBidPriceDeclineMultiplier();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setCstBidPriceDeclineMultiplier(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "CstBidPriceDeclineMultiplierChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.cstBidPriceDeclineMultiplier()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCstBidPriceDeclineMultiplier(prevValue_));
				}

				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.cstBidPriceDeclineMultiplierChangeDivisor();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setCstBidPriceDeclineMultiplierChangeDivisor(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "CstBidPriceDeclineMultiplierChangeDivisorChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.cstBidPriceDeclineMultiplierChangeDivisor()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCstBidPriceDeclineMultiplierChangeDivisor(prevValue_));
				}

				{
					const prevValue_ = await cosmicSignatureGameProxyForOwner_.mainPrizeNumCosmicSignatureNfts();
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeNumCosmicSignatureNfts(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "MainPrizeNumCosmicSignatureNftsChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.mainPrizeNumCosmicSignatureNfts()).equal(newValue_);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setMainPrizeNumCosmicSignatureNfts(prevValue_));
				}

				// The V3 setters store zero without validation. Some zero configurations make the respective
				// bidding calculation unusable, but accepting and emitting them is the current external behavior.
				const zeroValueSetterSpecs_ = [
					["setCstBidPriceDeclineMultiplier", "cstBidPriceDeclineMultiplier", "CstBidPriceDeclineMultiplierChanged"],
					["setCstBidPriceDeclineMultiplierChangeDivisor", "cstBidPriceDeclineMultiplierChangeDivisor", "CstBidPriceDeclineMultiplierChangeDivisorChanged"],
					["setRoundLateBidDurationDivisor", "roundLateBidDurationDivisor", "RoundLateBidDurationDivisorChanged"],
					["setRoundLateBidPricePremiumAmountBaseMultiplier", "roundLateBidPricePremiumAmountBaseMultiplier", "RoundLateBidPricePremiumAmountBaseMultiplierChanged"],
					["setRoundLateBidPricePremiumAmountExponent", "roundLateBidPricePremiumAmountExponent", "RoundLateBidPricePremiumAmountExponentChanged"],
					["setMainPrizeNumCosmicSignatureNfts", "mainPrizeNumCosmicSignatureNfts", "MainPrizeNumCosmicSignatureNftsChanged"],
				];
				for (const [setterName_, getterName_, eventName_] of zeroValueSetterSpecs_) {
					const prevValue_ = await cosmicSignatureGameProxyForOwner_[getterName_]();
					await expect(cosmicSignatureGameProxyForOwner_[setterName_](0n))
						.emit(cosmicSignatureGameProxyForOwner_, eventName_).withArgs(0n);
					expect(await cosmicSignatureGameProxyForOwner_[getterName_]()).equal(0n);
					await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_[setterName_](prevValue_));
				}
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.cstPrizeAmount();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCstPrizeAmount(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CstPrizeAmountChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cstPrizeAmount()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCstPrizeAmount(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.chronoWarriorEthPrizeAmountPercentage();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setChronoWarriorEthPrizeAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "ChronoWarriorEthPrizeAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.chronoWarriorEthPrizeAmountPercentage()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setChronoWarriorEthPrizeAmountPercentage(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.raffleTotalEthPrizeAmountForBiddersPercentage();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "RaffleTotalEthPrizeAmountForBiddersPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.raffleTotalEthPrizeAmountForBiddersPercentage()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.numRaffleEthPrizesForBidders();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleEthPrizesForBidders(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "NumRaffleEthPrizesForBiddersChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.numRaffleEthPrizesForBidders()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setNumRaffleEthPrizesForBidders(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.numRaffleCosmicSignatureNftsForBidders();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForBidders(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "NumRaffleCosmicSignatureNftsForBiddersChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.numRaffleCosmicSignatureNftsForBidders()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForBidders(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CosmicSignatureNftStakingTotalEthRewardAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.initialDurationUntilMainPrizeDivisor();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setInitialDurationUntilMainPrizeDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "InitialDurationUntilMainPrizeDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.initialDurationUntilMainPrizeDivisor()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setInitialDurationUntilMainPrizeDivisor(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.mainPrizeTimeIncrementInMicroSeconds();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementInMicroSeconds(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MainPrizeTimeIncrementInMicroSecondsChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.mainPrizeTimeIncrementInMicroSeconds()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementInMicroSeconds(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.mainPrizeTimeIncrementIncreaseDivisor();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementIncreaseDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MainPrizeTimeIncrementIncreaseDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.mainPrizeTimeIncrementIncreaseDivisor()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementIncreaseDivisor(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.timeoutDurationToClaimMainPrize();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setTimeoutDurationToClaimMainPrize(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "TimeoutDurationToClaimMainPrizeChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.timeoutDurationToClaimMainPrize()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setTimeoutDurationToClaimMainPrize(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.mainEthPrizeAmountPercentage();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMainEthPrizeAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MainEthPrizeAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.mainEthPrizeAmountPercentage()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setMainEthPrizeAmountPercentage(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.token();
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "CosmicSignatureTokenAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.token()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.randomWalkNft();
				await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "RandomWalkNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.randomWalkNft()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.nft();
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "CosmicSignatureNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.nft()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.prizesWallet();
				await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "PrizesWalletAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.prizesWallet()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setPrizesWallet(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.stakingWalletRandomWalkNft();
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "StakingWalletRandomWalkNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.stakingWalletRandomWalkNft()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.stakingWalletCosmicSignatureNft();
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "StakingWalletCosmicSignatureNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.stakingWalletCosmicSignatureNft()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.marketingWallet();
				await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "MarketingWalletAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.marketingWallet()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setMarketingWallet(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.marketingWalletCstContributionAmount();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMarketingWalletCstContributionAmount(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MarketingWalletCstContributionAmountChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.marketingWalletCstContributionAmount()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setMarketingWalletCstContributionAmount(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.charityAddress();
				await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "CharityAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.charityAddress()).equal(newValue_.address);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCharityAddress(prevValue_));
			}

			{
				const prevValue_ = await cosmicSignatureGameProxyForOwner_.charityEthDonationAmountPercentage();
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCharityEthDonationAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CharityEthDonationAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.charityEthDonationAmountPercentage()).equal(newValue_);
				await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setCharityEthDonationAmountPercentage(prevValue_));
			}
			await activateRoundBidAndClaimMainPrize(contracts_, game_);
		});
	});

	it("Setters while the current bidding round is active", async function () {
		await testAcrossGameVersions(async (contracts_, game_, roundNum_, contractVersionNumber_) => {
			const cosmicSignatureGameProxyForOwner_ = game_.connect(contracts_.ownerSigner);
			const cosmicSignatureGameProxyForSigner_ = game_.connect(contracts_.signers[3]);
			const testSigner_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
			let randomNumber1_ = 9n + generateRandomUInt256() % 3n;

			await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(randomNumber1_));

			// After this, the current bidding round remains active.
			await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setRoundActivationTime(randomNumber1_));

			await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionEndingBidPriceDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setEthBidPriceIncreaseDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setEthBidRefundAmountInGasToSwallowMaxLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			if (contractVersionNumber_ <= 1) {
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			} else if (contractVersionNumber_ <= 2) {
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDuration(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			} else {
				// Comment-202608014 applies.
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDuration(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "NotImplemented");
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "NotImplemented");
			}
			await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setBidMessageLengthMaxLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			if (contractVersionNumber_ <= 1) {
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			} else {
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmountMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			}
			if (contractVersionNumber_ >= 3) {
				await expect(cosmicSignatureGameProxyForOwner_.setRoundLateBidDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
				await expect(cosmicSignatureGameProxyForOwner_.setRoundLateBidPricePremiumAmountBaseMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
				await expect(cosmicSignatureGameProxyForOwner_.setRoundLateBidPricePremiumAmountExponent(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
				await expect(cosmicSignatureGameProxyForOwner_.setCstBidPriceDeclineMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
				await expect(cosmicSignatureGameProxyForOwner_.setCstBidPriceDeclineMultiplierChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
				await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeNumCosmicSignatureNfts(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			}
			await expect(cosmicSignatureGameProxyForOwner_.setCstPrizeAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setChronoWarriorEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleEthPrizesForBidders(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForBidders(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setInitialDurationUntilMainPrizeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementInMicroSeconds(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementIncreaseDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setTimeoutDurationToClaimMainPrize(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setMainEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setMarketingWalletCstContributionAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setCharityEthDonationAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");

			await waitForTransactionReceipt(contracts_.signers[3].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 10n ** 18n,}));
			randomNumber1_ ^= 1n;
			await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(randomNumber1_));
			await expect(cosmicSignatureGameProxyForOwner_.setRoundActivationTime(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "BidHasBeenPlacedInCurrentRound");

			const mainPrizeTime_ = await cosmicSignatureGameProxyForSigner_.mainPrizeTime();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(cosmicSignatureGameProxyForSigner_.claimMainPrize());
		});
	});

	it("Unauthorized access to setters", async function () {
		await testAcrossGameVersions(async (contracts_, game_, roundNum_, contractVersionNumber_) => {
			// const cosmicSignatureGameProxyForOwner_ = game_.connect(contracts_.ownerSigner);
			const cosmicSignatureGameProxyForSigner_ = game_.connect(contracts_.signers[3]);
			const testSigner_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
			const randomNumber1_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForSigner_.setDelayDurationBeforeRoundActivation(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setRoundActivationTime(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthDutchAuctionEndingBidPriceDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthBidPriceIncreaseDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthBidRefundAmountInGasToSwallowMaxLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			if (contractVersionNumber_ <= 1) {
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			} else if (contractVersionNumber_ <= 2) {
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDuration(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDurationChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			} else {
				// Comment-202608014 applies.
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDuration(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "NotImplemented");
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDurationChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "NotImplemented");
			}
			await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionBeginningBidPriceMinLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setBidMessageLengthMaxLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			if (contractVersionNumber_ <= 1) {
				await expect(cosmicSignatureGameProxyForSigner_.setBidCstRewardAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			} else {
				await expect(cosmicSignatureGameProxyForSigner_.setBidCstRewardAmountMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			}
			if (contractVersionNumber_ >= 3) {
				await expect(cosmicSignatureGameProxyForSigner_.setRoundLateBidDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
				await expect(cosmicSignatureGameProxyForSigner_.setRoundLateBidPricePremiumAmountBaseMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
				await expect(cosmicSignatureGameProxyForSigner_.setRoundLateBidPricePremiumAmountExponent(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
				await expect(cosmicSignatureGameProxyForSigner_.setCstBidPriceDeclineMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
				await expect(cosmicSignatureGameProxyForSigner_.setCstBidPriceDeclineMultiplierChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
				await expect(cosmicSignatureGameProxyForSigner_.setMainPrizeNumCosmicSignatureNfts(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			}
			await expect(cosmicSignatureGameProxyForSigner_.setCstPrizeAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setChronoWarriorEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setNumRaffleEthPrizesForBidders(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setNumRaffleCosmicSignatureNftsForBidders(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setInitialDurationUntilMainPrizeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setMainPrizeTimeIncrementInMicroSeconds(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setMainPrizeTimeIncrementIncreaseDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setTimeoutDurationToClaimMainPrize(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setMainEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setCosmicSignatureToken(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setRandomWalkNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setCosmicSignatureNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setPrizesWallet(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setStakingWalletRandomWalkNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setStakingWalletCosmicSignatureNft(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setMarketingWallet(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setMarketingWalletCstContributionAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setCharityAddress(testSigner_.address)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setCharityEthDonationAmountPercentage(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await activateRoundBidAndClaimMainPrize(contracts_, game_);
		});
	});
});
