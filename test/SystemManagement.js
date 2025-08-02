"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../src/Helpers.js");
// const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractTestingHelpers.js");

describe("SystemManagement", function () {
	it("Setters while the current bidding round is inactive", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const cosmicSignatureGameProxyForOwner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct);

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "DelayDurationBeforeRoundActivationChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.delayDurationBeforeRoundActivation()).equal(newValue_);
		}

		// After this, the current bidding round remains inactive.
		{
			const newValue_ = 123_456_789_012n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setRoundActivationTime(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "RoundActivationTimeChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.roundActivationTime()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionDurationDivisor(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "EthDutchAuctionDurationDivisorChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionEndingBidPriceDivisor(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "EthDutchAuctionEndingBidPriceDivisorChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setEthBidPriceIncreaseDivisor(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "EthBidPriceIncreaseDivisorChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setEthBidRefundAmountInGasToSwallowMaxLimit(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "EthBidRefundAmountInGasToSwallowMaxLimitChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.ethBidRefundAmountInGasToSwallowMaxLimit()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationDivisor(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "CstDutchAuctionDurationDivisorChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionDurationDivisor()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "CstDutchAuctionBeginningBidPriceMinLimitChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPriceMinLimit()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setBidMessageLengthMaxLimit(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "BidMessageLengthMaxLimitChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.bidMessageLengthMaxLimit()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setCstRewardAmountForBidding(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "CstRewardAmountForBiddingChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.cstRewardAmountForBidding()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setCstPrizeAmountMultiplier(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "CstPrizeAmountMultiplierChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.cstPrizeAmountMultiplier()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setChronoWarriorEthPrizeAmountPercentage(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "ChronoWarriorEthPrizeAmountPercentageChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "RaffleTotalEthPrizeAmountForBiddersPercentageChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.raffleTotalEthPrizeAmountForBiddersPercentage()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleEthPrizesForBidders(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "NumRaffleEthPrizesForBiddersChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForBidders(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForBiddersChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "CosmicSignatureNftStakingTotalEthRewardAmountPercentageChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setInitialDurationUntilMainPrizeDivisor(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "InitialDurationUntilMainPrizeDivisorChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.initialDurationUntilMainPrizeDivisor()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementInMicroSeconds(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeTimeIncrementInMicroSecondsChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementIncreaseDivisor(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeTimeIncrementIncreaseDivisorChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setTimeoutDurationToClaimMainPrize(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "TimeoutDurationToClaimMainPrizeChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).equal(newValue_);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setMainEthPrizeAmountPercentage(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "MainEthPrizeAmountPercentageChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).equal(newValue_);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "CosmicSignatureTokenAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.token()).equal(newValue_.address);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "RandomWalkNftAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.randomWalkNft()).equal(newValue_.address);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "CosmicSignatureNftAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.nft()).equal(newValue_.address);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "PrizesWalletAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.prizesWallet()).equal(newValue_.address);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "StakingWalletRandomWalkNftAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.stakingWalletRandomWalkNft()).equal(newValue_.address);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "StakingWalletCosmicSignatureNftAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.stakingWalletCosmicSignatureNft()).equal(newValue_.address);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "MarketingWalletAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.marketingWallet()).equal(newValue_.address);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setMarketingWalletCstContributionAmount(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "MarketingWalletCstContributionAmountChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.marketingWalletCstContributionAmount()).equal(newValue_);
		}

		{
			await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(hre.ethers.ZeroAddress))
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress")
				.withArgs("The provided address is zero.");
			const newValue_ = hre.ethers.Wallet.createRandom();
			await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(newValue_.address))
				.emit(contracts_.cosmicSignatureGameProxy, "CharityAddressChanged")
				.withArgs(newValue_.address);
			expect(await contracts_.cosmicSignatureGameProxy.charityAddress()).equal(newValue_.address);
		}

		{
			const newValue_ = 9n + generateRandomUInt256() % 3n;
			await expect(cosmicSignatureGameProxyForOwner_.setCharityEthDonationAmountPercentage(newValue_))
				.emit(contracts_.cosmicSignatureGameProxy, "CharityEthDonationAmountPercentageChanged")
				.withArgs(newValue_);
			expect(await contracts_.cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).equal(newValue_);
		}
	});

	it("Setters while the current bidding round is active", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const cosmicSignatureGameProxyForOwner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct);
		let randomNumber1_ = 9n + generateRandomUInt256() % 3n;
		const testAcct_ = hre.ethers.Wallet.createRandom();

		await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(randomNumber1_));

		// After this, the current bidding round remains active.
		await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setRoundActivationTime(randomNumber1_));

		await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setEthDutchAuctionEndingBidPriceDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setEthBidPriceIncreaseDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setEthBidRefundAmountInGasToSwallowMaxLimit(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCstDutchAuctionBeginningBidPriceMinLimit(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setBidMessageLengthMaxLimit(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCstRewardAmountForBidding(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCstPrizeAmountMultiplier(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setChronoWarriorEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleEthPrizesForBidders(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForBidders(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setInitialDurationUntilMainPrizeDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementInMicroSeconds(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setMainPrizeTimeIncrementIncreaseDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setTimeoutDurationToClaimMainPrize(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setMainEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureToken(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setRandomWalkNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCosmicSignatureNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setPrizesWallet(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletRandomWalkNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setStakingWalletCosmicSignatureNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setMarketingWallet(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setMarketingWalletCstContributionAmount(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCharityAddress(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxyForOwner_.setCharityEthDonationAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		randomNumber1_ ^= 1n;
		await waitForTransactionReceipt(cosmicSignatureGameProxyForOwner_.setDelayDurationBeforeRoundActivation(randomNumber1_));
		await expect(cosmicSignatureGameProxyForOwner_.setRoundActivationTime(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "BidHasBeenPlacedInCurrentRound");
	});

	it("Unauthorized access to setters", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const cosmicSignatureGameProxyForSigner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]);
		const randomNumber1_ = 9n + generateRandomUInt256() % 3n;
		const testAcct_ = hre.ethers.Wallet.createRandom();

		await expect(cosmicSignatureGameProxyForSigner_.setDelayDurationBeforeRoundActivation(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setRoundActivationTime(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setEthDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setEthDutchAuctionEndingBidPriceDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setEthBidPriceIncreaseDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setEthBidRefundAmountInGasToSwallowMaxLimit(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionDurationDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCstDutchAuctionBeginningBidPriceMinLimit(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setBidMessageLengthMaxLimit(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCstRewardAmountForBidding(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCstPrizeAmountMultiplier(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setChronoWarriorEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setRaffleTotalEthPrizeAmountForBiddersPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setNumRaffleEthPrizesForBidders(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setNumRaffleCosmicSignatureNftsForBidders(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setInitialDurationUntilMainPrizeDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setMainPrizeTimeIncrementInMicroSeconds(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setMainPrizeTimeIncrementIncreaseDivisor(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setTimeoutDurationToClaimMainPrize(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setMainEthPrizeAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCosmicSignatureToken(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setRandomWalkNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCosmicSignatureNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setPrizesWallet(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setStakingWalletRandomWalkNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setStakingWalletCosmicSignatureNft(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setMarketingWallet(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setMarketingWalletCstContributionAmount(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCharityAddress(testAcct_.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxyForSigner_.setCharityEthDonationAmountPercentage(randomNumber1_)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
	});
});
