"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

describe("SystemManagement", function () {
	it("Setters while the current bidding round is inactive", async function () {
		for ( let contractVersionNumber_ = 1; ; ++ contractVersionNumber_ ) {
			const contracts_ = await loadFixtureDeployContractsForTesting((contractVersionNumber_ <= 1) ? (-1_000_000_000n) : 2n);
			let cosmicSignatureGameProxyForOwner_;

			if (contractVersionNumber_ <= 1) {
				cosmicSignatureGameProxyForOwner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner);
			} else {
				const cosmicSignatureGameProxyForSigner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]);

				await waitForTransactionReceipt(cosmicSignatureGameProxyForSigner_.bidWithEth(-1n, "", {value: 10n ** 18n,}));
				const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
				// await hre.ethers.provider.send("evm_mine");
				await waitForTransactionReceipt(cosmicSignatureGameProxyForSigner_.claimMainPrize());

				const cosmicSignatureGameV2Factory_ =
					await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
				const cosmicSignatureGameV2Proxy_ =
					await hre.upgrades.upgradeProxy(
						contracts_.cosmicSignatureGameProxy,
						cosmicSignatureGameV2Factory_,
						{
							kind: "uups",
							call: "initializeV2",
						}
					);
				// await cosmicSignatureGameV2Proxy_.waitForDeployment();

				cosmicSignatureGameProxyForOwner_ = cosmicSignatureGameV2Proxy_.connect(contracts_.ownerSigner);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "DelayDurationBeforeRoundActivationChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.delayDurationBeforeRoundActivation()).equal(newValue_);
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
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionDurationDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthDutchAuctionDurationDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethDutchAuctionDurationDivisor()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionEndingBidPriceDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthDutchAuctionEndingBidPriceDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethDutchAuctionEndingBidPriceDivisor()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthBidPriceIncreaseDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthBidPriceIncreaseDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethBidPriceIncreaseDivisor()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setEthBidRefundAmountInGasToSwallowMaxLimit(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "EthBidRefundAmountInGasToSwallowMaxLimitChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.ethBidRefundAmountInGasToSwallowMaxLimit()).equal(newValue_);
			}

			if (contractVersionNumber_ <= 1) {
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionDurationDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDurationDivisor()).equal(newValue_);
			} else {
				{
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDuration(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionDurationChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDuration()).equal(newValue_);
				}

				{
					const newValue_ = 9n + generateRandomUInt256() % 3n;
					await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationChangeDivisor(newValue_))
						.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionDurationChangeDivisorChanged")
						.withArgs(newValue_);
					expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionDurationChangeDivisor()).equal(newValue_);
				}
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CstDutchAuctionBeginningBidPriceMinLimitChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setBidMessageLengthMaxLimit(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "BidMessageLengthMaxLimitChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.bidMessageLengthMaxLimit()).equal(newValue_);
			}

			if (contractVersionNumber_ <= 1) {
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmount(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "BidCstRewardAmountChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.bidCstRewardAmount()).equal(newValue_);
			} else {
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmountMultiplier(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "BidCstRewardAmountMultiplierChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.bidCstRewardAmountMultiplier()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCstPrizeAmount(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CstPrizeAmountChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cstPrizeAmount()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setChronoWarriorEthPrizeAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "ChronoWarriorEthPrizeAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.chronoWarriorEthPrizeAmountPercentage()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "RaffleTotalEthPrizeAmountForBiddersPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.raffleTotalEthPrizeAmountForBiddersPercentage()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleEthPrizesForBidders(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "NumRaffleEthPrizesForBiddersChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.numRaffleEthPrizesForBidders()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForBidders(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "NumRaffleCosmicSignatureNftsForBiddersChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.numRaffleCosmicSignatureNftsForBidders()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CosmicSignatureNftStakingTotalEthRewardAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setInitialDurationUntilMainPrizeDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "InitialDurationUntilMainPrizeDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.initialDurationUntilMainPrizeDivisor()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementInMicroSeconds(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MainPrizeTimeIncrementInMicroSecondsChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.mainPrizeTimeIncrementInMicroSeconds()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementIncreaseDivisor(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MainPrizeTimeIncrementIncreaseDivisorChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.mainPrizeTimeIncrementIncreaseDivisor()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setTimeoutDurationToClaimMainPrize(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "TimeoutDurationToClaimMainPrizeChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.timeoutDurationToClaimMainPrize()).equal(newValue_);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMainEthPrizeAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MainEthPrizeAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.mainEthPrizeAmountPercentage()).equal(newValue_);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "CosmicSignatureTokenAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.token()).equal(newValue_.address);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "RandomWalkNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.randomWalkNft()).equal(newValue_.address);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "CosmicSignatureNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.nft()).equal(newValue_.address);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "PrizesWalletAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.prizesWallet()).equal(newValue_.address);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "StakingWalletRandomWalkNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.stakingWalletRandomWalkNft()).equal(newValue_.address);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "StakingWalletCosmicSignatureNftAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.stakingWalletCosmicSignatureNft()).equal(newValue_.address);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "MarketingWalletAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.marketingWallet()).equal(newValue_.address);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setMarketingWalletCstContributionAmount(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "MarketingWalletCstContributionAmountChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.marketingWalletCstContributionAmount()).equal(newValue_);
			}

			{
				await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(hre.ethers.ZeroAddress))
					.revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "ZeroAddress")
					.withArgs("The provided address is zero.");
				const newValue_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);
				await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(newValue_.address))
					.emit(cosmicSignatureGameProxyForOwner_, "CharityAddressChanged")
					.withArgs(newValue_.address);
				expect(await cosmicSignatureGameProxyForOwner_.charityAddress()).equal(newValue_.address);
			}

			{
				const newValue_ = 9n + generateRandomUInt256() % 3n;
				await expect(cosmicSignatureGameProxyForOwner_.setCharityEthDonationAmountPercentage(newValue_))
					.emit(cosmicSignatureGameProxyForOwner_, "CharityEthDonationAmountPercentageChanged")
					.withArgs(newValue_);
				expect(await cosmicSignatureGameProxyForOwner_.charityEthDonationAmountPercentage()).equal(newValue_);
			}

			if ( ! (contractVersionNumber_ < 2) ) {
				break;
			}
		}
	});

	it("Setters while the current bidding round is active", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		let cosmicSignatureGameProxyForOwner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner);
		let cosmicSignatureGameProxyForSigner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]);
		const testSigner_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);

		for ( let contractVersionNumber_ = 1; ; ++ contractVersionNumber_ ) {
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
			} else {
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDuration(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
				await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			}
			await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			await expect(cosmicSignatureGameProxyForOwner_.setBidMessageLengthMaxLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			if (contractVersionNumber_ <= 1) {
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
			} else {
				await expect(cosmicSignatureGameProxyForOwner_.setBidCstRewardAmountMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForOwner_, "RoundIsActive");
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

			if ( ! (contractVersionNumber_ < 2) ) {
				break;
			}

			const mainPrizeTime_ = await cosmicSignatureGameProxyForSigner_.mainPrizeTime();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(cosmicSignatureGameProxyForSigner_.claimMainPrize());

			const cosmicSignatureGameV2Factory_ =
				await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
			const cosmicSignatureGameV2Proxy_ =
				await hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV2Factory_,
					{
						kind: "uups",
						call: "initializeV2",
					}
				);
			// await cosmicSignatureGameV2Proxy_.waitForDeployment();
			
			cosmicSignatureGameProxyForOwner_ = cosmicSignatureGameV2Proxy_.connect(contracts_.ownerSigner);
			cosmicSignatureGameProxyForSigner_ = cosmicSignatureGameV2Proxy_.connect(contracts_.signers[3]);

			await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxyForOwner_, 2n);
		}
	});

	it("Unauthorized access to setters", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		let cosmicSignatureGameProxyForSigner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]);
		const randomNumber1_ = 9n + generateRandomUInt256() % 3n;
		const testSigner_ = hre.ethers.Wallet.createRandom(hre.ethers.provider);

		await waitForTransactionReceipt(cosmicSignatureGameProxyForSigner_.bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(cosmicSignatureGameProxyForSigner_.claimMainPrize());

		for ( let contractVersionNumber_ = 1; ; ++ contractVersionNumber_ ) {
			await expect(cosmicSignatureGameProxyForSigner_.setDelayDurationBeforeRoundActivation(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setRoundActivationTime(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthDutchAuctionEndingBidPriceDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthBidPriceIncreaseDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setEthBidRefundAmountInGasToSwallowMaxLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			if (contractVersionNumber_ <= 1) {
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			} else {
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDuration(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
				await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDurationChangeDivisor(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			}
			await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionBeginningBidPriceMinLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			await expect(cosmicSignatureGameProxyForSigner_.setBidMessageLengthMaxLimit(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			if (contractVersionNumber_ <= 1) {
				await expect(cosmicSignatureGameProxyForSigner_.setBidCstRewardAmount(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
			} else {
				await expect(cosmicSignatureGameProxyForSigner_.setBidCstRewardAmountMultiplier(randomNumber1_)).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "OwnableUnauthorizedAccount");
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

			if ( ! (contractVersionNumber_ < 2) ) {
				break;
			}

			const cosmicSignatureGameV2Factory_ =
				await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
			const cosmicSignatureGameV2Proxy_ =
				await hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV2Factory_,
					{
						kind: "uups",
						call: "initializeV2",
					}
				);
			// await cosmicSignatureGameV2Proxy_.waitForDeployment();

			cosmicSignatureGameProxyForSigner_ = cosmicSignatureGameV2Proxy_.connect(contracts_.signers[3]);
		}
	});
});
