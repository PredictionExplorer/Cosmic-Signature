"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("SystemManagement", function () {
	it("When the current bidding round is inactive, setters behave correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);

		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);
		expect(await cosmicSignatureGameProxy.getDurationUntilRoundActivation()).greaterThan(+1e9);

		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(99n * 60n);
		expect(await cosmicSignatureGameProxy.delayDurationBeforeRoundActivation()).to.equal(99n * 60n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setMarketingWalletCstContributionAmount(1234567890n);
		expect(await cosmicSignatureGameProxy.marketingWalletCstContributionAmount()).to.equal(1234567890n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setBidMessageLengthMaxLimit(1234567890n);
		expect(await cosmicSignatureGameProxy.bidMessageLengthMaxLimit()).to.equal(1234567890n);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureToken(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		let testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureToken(testAcct_.address);
		expect(await cosmicSignatureGameProxy.token()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setRandomWalkNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.nft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setPrizesWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setPrizesWallet(testAcct_.address);
		expect(await cosmicSignatureGameProxy.prizesWallet()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletRandomWalkNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.stakingWalletRandomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.stakingWalletCosmicSignatureNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMarketingWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setMarketingWallet(testAcct_.address);
		expect(await cosmicSignatureGameProxy.marketingWallet()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setCharityAddress(testAcct_.address);
		expect(await cosmicSignatureGameProxy.charityAddress()).to.equal(testAcct_.address);

		await cosmicSignatureGameProxy.connect(ownerAcct).setInitialDurationUntilMainPrizeDivisor(99n);
		expect(await cosmicSignatureGameProxy.initialDurationUntilMainPrizeDivisor()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setMainPrizeTimeIncrementInMicroSeconds(99n);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setMainPrizeTimeIncrementIncreaseDivisor(899n);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).to.equal(899n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setEthDutchAuctionEndingBidPriceDivisor(99n);
		expect(await cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setEthBidPriceIncreaseDivisor(99n);
		expect(await cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setEthBidRefundAmountInGasMinLimit(99n);
		expect(await cosmicSignatureGameProxy.ethBidRefundAmountInGasMinLimit()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setCstDutchAuctionDurationDivisor(11n);
		expect(await cosmicSignatureGameProxy.cstDutchAuctionDurationDivisor()).to.equal(11n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setCstDutchAuctionBeginningBidPriceMinLimit(hre.ethers.parseEther("111"));
		expect(await cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPriceMinLimit()).to.equal(hre.ethers.parseEther("111"));

		await cosmicSignatureGameProxy.connect(ownerAcct).setCstRewardAmountForBidding(1234567890n);
		expect(await cosmicSignatureGameProxy.cstRewardAmountForBidding()).to.equal(1234567890n);

		// await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMainEthPrizeAmountPercentage(75n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "PercentageValidation");
		const mainEthPrizeAmountPercentage_ = await cosmicSignatureGameProxy.mainEthPrizeAmountPercentage();
		await cosmicSignatureGameProxy.connect(ownerAcct).setMainEthPrizeAmountPercentage(mainEthPrizeAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).to.equal(mainEthPrizeAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.connect(ownerAcct).setMainEthPrizeAmountPercentage(mainEthPrizeAmountPercentage_);

		// await expect(cosmicSignatureGameProxy.connect(ownerAcct).setChronoWarriorEthPrizeAmountPercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "PercentageValidation");
		const chronoWarriorEthPrizeAmountPercentage_ = await cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage();
		await cosmicSignatureGameProxy.connect(ownerAcct).setChronoWarriorEthPrizeAmountPercentage(chronoWarriorEthPrizeAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).to.equal(chronoWarriorEthPrizeAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.connect(ownerAcct).setChronoWarriorEthPrizeAmountPercentage(chronoWarriorEthPrizeAmountPercentage_);

		// await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRaffleTotalEthPrizeAmountForBiddersPercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "PercentageValidation");
		const raffleTotalEthPrizeAmountForBiddersPercentage_ = await cosmicSignatureGameProxy.raffleTotalEthPrizeAmountForBiddersPercentage();
		await cosmicSignatureGameProxy.connect(ownerAcct).setRaffleTotalEthPrizeAmountForBiddersPercentage(raffleTotalEthPrizeAmountForBiddersPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.raffleTotalEthPrizeAmountForBiddersPercentage()).to.equal(raffleTotalEthPrizeAmountForBiddersPercentage_ + 1n);
		await cosmicSignatureGameProxy.connect(ownerAcct).setRaffleTotalEthPrizeAmountForBiddersPercentage(raffleTotalEthPrizeAmountForBiddersPercentage_);

		// await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "PercentageValidation");
		const cosmicSignatureNftStakingTotalEthRewardAmountPercentage_ = await cosmicSignatureGameProxy.cosmicSignatureNftStakingTotalEthRewardAmountPercentage();
		await cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(cosmicSignatureNftStakingTotalEthRewardAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).to.equal(cosmicSignatureNftStakingTotalEthRewardAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(cosmicSignatureNftStakingTotalEthRewardAmountPercentage_);

		// await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCharityEthDonationAmountPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "PercentageValidation");
		const charityEthDonationAmountPercentage_ = await cosmicSignatureGameProxy.charityEthDonationAmountPercentage();
		await cosmicSignatureGameProxy.connect(ownerAcct).setCharityEthDonationAmountPercentage(charityEthDonationAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).to.equal(charityEthDonationAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.connect(ownerAcct).setCharityEthDonationAmountPercentage(charityEthDonationAmountPercentage_);

		await cosmicSignatureGameProxy.connect(ownerAcct).setTimeoutDurationToClaimMainPrize(99n);
		expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setCstPrizeAmountMultiplier(99n);
		expect(await cosmicSignatureGameProxy.cstPrizeAmountMultiplier()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleEthPrizesForBidders(99n);
		expect(await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleCosmicSignatureNftsForBidders(99n);
		expect(await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(99n);
		expect(await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).to.equal(99n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123n);
		expect(await cosmicSignatureGameProxy.roundActivationTime()).to.equal(123n);
		expect(await cosmicSignatureGameProxy.getDurationUntilRoundActivation()).lessThan(-1e9);
	});

	it("Admin events should work", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);

		const roundActivationTime_ = 123_456_789_012n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(roundActivationTime_))
			.to.emit(cosmicSignatureGameProxy, "RoundActivationTimeChanged")
			.withArgs(roundActivationTime_);
		expect(await cosmicSignatureGameProxy.roundActivationTime()).to.equal(roundActivationTime_);

		// todo-1 setDelayDurationBeforeRoundActivation

		// todo-1 setMarketingWalletCstContributionAmount

		// todo-1 setBidMessageLengthMaxLimit

		let testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureToken(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CosmicSignatureTokenAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.token()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRandomWalkNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "RandomWalkNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CosmicSignatureNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.nft()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setPrizesWallet(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "PrizesWalletAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.prizesWallet()).to.equal(testAcct_.address);

		// todo-1 setStakingWalletRandomWalkNft

		// todo-1 setStakingWalletCosmicSignatureNft

		// todo-1 setMarketingWallet

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCharityAddress(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CharityAddressChanged")
			.withArgs(testAcct_.address);
		expect((await cosmicSignatureGameProxy.charityAddress()).toString()).to.equal(testAcct_.address.toString());

		const initialDurationUntilMainPrizeDivisor_ = 1004n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setInitialDurationUntilMainPrizeDivisor(initialDurationUntilMainPrizeDivisor_))
			.to.emit(cosmicSignatureGameProxy, "InitialDurationUntilMainPrizeDivisorChanged")
			.withArgs(initialDurationUntilMainPrizeDivisor_);
		expect((await cosmicSignatureGameProxy.initialDurationUntilMainPrizeDivisor()).toString()).to.equal(initialDurationUntilMainPrizeDivisor_.toString());

		const mainPrizeTimeIncrementInMicroSeconds_ = 1003n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds_))
			.to.emit(cosmicSignatureGameProxy, "MainPrizeTimeIncrementInMicroSecondsChanged")
			.withArgs(mainPrizeTimeIncrementInMicroSeconds_);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).to.equal(mainPrizeTimeIncrementInMicroSeconds_);

		const mainPrizeTimeIncrementIncreaseDivisor_ = 1001n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMainPrizeTimeIncrementIncreaseDivisor(mainPrizeTimeIncrementIncreaseDivisor_))
			.to.emit(cosmicSignatureGameProxy, "MainPrizeTimeIncrementIncreaseDivisorChanged")
			.withArgs(mainPrizeTimeIncrementIncreaseDivisor_);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).to.equal(mainPrizeTimeIncrementIncreaseDivisor_);

		const ethDutchAuctionEndingBidPriceDivisor_ = 1006n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setEthDutchAuctionEndingBidPriceDivisor(ethDutchAuctionEndingBidPriceDivisor_))
			.to.emit(cosmicSignatureGameProxy, "EthDutchAuctionEndingBidPriceDivisorChanged")
			.withArgs(ethDutchAuctionEndingBidPriceDivisor_);
		expect((await cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor()).toString()).to.equal(ethDutchAuctionEndingBidPriceDivisor_.toString());

		const ethBidPriceIncreaseDivisor_ = 1002n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setEthBidPriceIncreaseDivisor(ethBidPriceIncreaseDivisor_))
			.to.emit(cosmicSignatureGameProxy, "EthBidPriceIncreaseDivisorChanged")
			.withArgs(ethBidPriceIncreaseDivisor_);
		expect(await cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()).equal(ethBidPriceIncreaseDivisor_);

		const ethBidRefundAmountInGasMinLimit_ = 1007n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setEthBidRefundAmountInGasMinLimit(ethBidRefundAmountInGasMinLimit_))
			.to.emit(cosmicSignatureGameProxy, "EthBidRefundAmountInGasMinLimitChanged")
			.withArgs(ethBidRefundAmountInGasMinLimit_);
		expect(await cosmicSignatureGameProxy.ethBidRefundAmountInGasMinLimit()).equal(ethBidRefundAmountInGasMinLimit_);

		// todo-1 setCstDutchAuctionDurationDivisor
		// todo-1 Also the same for ETH.

		// todo-1 setCstDutchAuctionBeginningBidPriceMinLimit

		// todo-1 setCstRewardAmountForBidding

		let percentage_ = 11n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMainEthPrizeAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "MainEthPrizeAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).to.equal(percentage_);
		
		percentage_ = 12n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setChronoWarriorEthPrizeAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "ChronoWarriorEthPrizeAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).to.equal(percentage_);

		percentage_ = 13n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRaffleTotalEthPrizeAmountForBiddersPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "RaffleTotalEthPrizeAmountForBiddersPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.raffleTotalEthPrizeAmountForBiddersPercentage()).to.equal(percentage_);

		// todo-1 percentage_ = 14n;
		// todo-1 setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(percentage_)

		percentage_ = 15n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCharityEthDonationAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "CharityEthDonationAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).to.equal(percentage_);

		const timeoutDurationToClaimMainPrize_ = 1003n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setTimeoutDurationToClaimMainPrize(timeoutDurationToClaimMainPrize_))
			.to.emit(cosmicSignatureGameProxy, "TimeoutDurationToClaimMainPrizeChanged")
			.withArgs(timeoutDurationToClaimMainPrize_);
		expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).to.equal(timeoutDurationToClaimMainPrize_);

		// todo-1 setCstPrizeAmountMultiplier

		let numPrizes_ = 11n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleEthPrizesForBidders(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleEthPrizesForBiddersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).toString()).to.equal(numPrizes_.toString());

		numPrizes_ = 12n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleCosmicSignatureNftsForBidders(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForBiddersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).toString()).to.equal(numPrizes_.toString());

		numPrizes_ = 14n;
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).toString()).to.equal(numPrizes_.toString());
	});

	it("When the current bidding round is active, setters are not available", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);

		// todo-1 Is this still correct?
		expect(await cosmicSignatureGameProxy.getDurationUntilRoundActivation()).within((-24n) * 60n * 60n, 0n);

		const testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123n);
		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(11n * 60n * 60n);
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMarketingWalletCstContributionAmount(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setBidMessageLengthMaxLimit(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureToken(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setPrizesWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMarketingWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCharityAddress(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setInitialDurationUntilMainPrizeDivisor(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMainPrizeTimeIncrementInMicroSeconds(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMainPrizeTimeIncrementIncreaseDivisor(899n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setEthDutchAuctionEndingBidPriceDivisor(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setEthBidPriceIncreaseDivisor(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setEthBidRefundAmountInGasMinLimit(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCstDutchAuctionDurationDivisor(11n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCstDutchAuctionBeginningBidPriceMinLimit(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCstRewardAmountForBidding(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setMainEthPrizeAmountPercentage(26n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setChronoWarriorEthPrizeAmountPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setRaffleTotalEthPrizeAmountForBiddersPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCharityEthDonationAmountPercentage(11n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setTimeoutDurationToClaimMainPrize(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCstPrizeAmountMultiplier(11n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleEthPrizesForBidders(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleCosmicSignatureNftsForBidders(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(99n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsActive");
	});

	// todo-1 Doesn't this test belong to "Bidding.js"?
	it("When the current bidding round is inactive, _onlyRoundIsActive methods are not available", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, randomWalkNft,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);
		expect(await cosmicSignatureGameProxy.getDurationUntilRoundActivation()).greaterThan(+1e9);

		const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEth((-1), "", { value: nextEthBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEthAndDonateNft((-1), "", signer0.address, 0, { value: nextEthBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithCst(10n ** 30n, "")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
		// todo-1 This reverts with a different error. It's probably correct, but take another look. Comment.
		await expect(cosmicSignatureGameProxy.connect(signer0).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");
		// // todo-1 I have moved NFT donations to `PrizesWallet`.
		// await expect(cosmicSignatureGameProxy.connect(signer0).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
		// // todo-1 I have moved NFT donations to `PrizesWallet`.
		// await expect(cosmicSignatureGameProxy.connect(signer0).claimManyDonatedNfts([0])).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
		await expect(signer0.sendTransaction({to: cosmicSignatureGameProxyAddr, value: nextEthBidPrice_,})).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
		// await expect(cosmicSignatureGameProxy.connect(signer0).donateEth({value: nextEthBidPrice_})).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
		// await expect(cosmicSignatureGameProxy.connect(signer0).donateEthWithInfo("{}", {value: nextEthBidPrice_})).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");

		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer1).mint({ value: mintPrice });
		await randomWalkNft.connect(signer1).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		// // todo-1 I have moved NFT donations to `PrizesWallet`
		// // todo-1 and NFT donation without making a bid is now prohibited.
		// await expect(cosmicSignatureGameProxy.connect(signer1).donateNft(randomWalkNftAddr, 0n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "RoundIsInactive");
	});

	// todo-1 Doesn't this test belong to "Bidding.js"?
	it("Regardless if the current bidding round is active or not, the behavior is correct", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;
		// let ownableErr = cosmicSignatureGameProxy.interface.getError("OwnableUnauthorizedAccount");

		// Comment-202501192 applies.
		await hre.ethers.provider.send("evm_mine");

		let durationUntilRoundActivation_ = await cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		// todo-1 Is this still correct?
		expect(durationUntilRoundActivation_).within((-24n) * 60n * 60n, 0n);
		const roundActivationTime_ = await cosmicSignatureGameProxy.roundActivationTime();
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		let expectedDurationUntilRoundActivation_ = roundActivationTime_ - BigInt(latestBlock_.timestamp);
		expect(durationUntilRoundActivation_).equal(expectedDurationUntilRoundActivation_);

		const donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.connect(signer2).donateEth({ value: donationAmount_ });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(123n * 60n);
		await expect(cosmicSignatureGameProxy.connect(signer1).setDelayDurationBeforeRoundActivation(123n * 60n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		const delayDurationBeforeRoundActivation_ = await cosmicSignatureGameProxy.delayDurationBeforeRoundActivation();
		expect(delayDurationBeforeRoundActivation_).to.equal(123n * 60n);

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(1n);
		await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();

		durationUntilRoundActivation_ = await cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		expect(durationUntilRoundActivation_).equal(delayDurationBeforeRoundActivation_);

		latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
		durationUntilRoundActivation_ = await cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		expect(durationUntilRoundActivation_).equal(0n);

		// The next bidding round has started. So we are allowed to bid.
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	});
	
	it("Unauthorized access to restricted methods is denied", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, cosmicSignatureToken, charityWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		await expect(cosmicSignatureGameProxy.connect(signer1).setRoundActivationTime(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setDelayDurationBeforeRoundActivation(11n * 60n * 60n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setMarketingWalletCstContributionAmount(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setBidMessageLengthMaxLimit(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCosmicSignatureToken(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setRandomWalkNft(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount")
		await expect(cosmicSignatureGameProxy.connect(signer1).setCosmicSignatureNft(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setPrizesWallet(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setStakingWalletRandomWalkNft(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setStakingWalletCosmicSignatureNft(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setMarketingWallet(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCharityAddress(signer1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setInitialDurationUntilMainPrizeDivisor(101n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setMainPrizeTimeIncrementInMicroSeconds(3n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setMainPrizeTimeIncrementIncreaseDivisor(2n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setEthDutchAuctionEndingBidPriceDivisor(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setEthBidPriceIncreaseDivisor(101n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setEthBidRefundAmountInGasMinLimit(101n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCstDutchAuctionDurationDivisor(11n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCstDutchAuctionBeginningBidPriceMinLimit(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCstRewardAmountForBidding(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setMainEthPrizeAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setChronoWarriorEthPrizeAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setRaffleTotalEthPrizeAmountForBiddersPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCharityEthDonationAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setTimeoutDurationToClaimMainPrize(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setCstPrizeAmountMultiplier(12n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setNumRaffleEthPrizesForBidders(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setNumRaffleCosmicSignatureNftsForBidders(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(signer1).setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(charityWallet.connect(signer1).setCharityAddress(signer1.address))
			.to.be.revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");

		// todo-1 The remaining tests don't really belong to `SystemManagement`.

		// todo-1 Add `cosmicSignatureToken.transferToMarketingWalletOrBurn` to all tests. But I have eliminated it.
		await expect(cosmicSignatureToken.connect(signer1).mint(signer1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(ownerAcct).mint(signer1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(signer1)["burn(address,uint256)"](signer1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(ownerAcct)["burn(address,uint256)"](signer1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(signer1)["burn(uint256)"](10000n));

		await expect(cosmicSignatureNft.connect(signer1).setNftBaseUri("://uri"))
			.to.be.revertedWithCustomError(cosmicSignatureNft, "OwnableUnauthorizedAccount");
	});
});
