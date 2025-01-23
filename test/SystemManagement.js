"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("SystemManagement", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("In the inactive mode, setters behave correctly", async function () {
		const isRuntimeMode_ = false;
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, /*addr2, addr3, addr4, addr5, addr6, addr7,*/] = signers;
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", /*addr7.address,*/ addr1.address, false, isRuntimeMode_ ? 1 : 0 /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(2n);

		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).greaterThan(+1e9);

		await cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(99n * 60n);
		expect(await cosmicSignatureGameProxy.delayDurationBeforeNextRound()).to.equal(99n * 60n);

		await cosmicSignatureGameProxy.setMarketingWalletCstContributionAmount(1234567890n);
		expect(await cosmicSignatureGameProxy.marketingWalletCstContributionAmount()).to.equal(1234567890n);

		await cosmicSignatureGameProxy.setMaxMessageLength(1234567890n);
		expect(await cosmicSignatureGameProxy.maxMessageLength()).to.equal(1234567890n);

		await expect(cosmicSignatureGameProxy.setCosmicSignatureToken(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		let testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setCosmicSignatureToken(testAcct_.address);
		expect(await cosmicSignatureGameProxy.token()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setRandomWalkNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setCosmicSignatureNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.nft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setPrizesWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setPrizesWallet(testAcct_.address);
		expect(await cosmicSignatureGameProxy.prizesWallet()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.stakingWalletRandomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.stakingWalletCosmicSignatureNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setMarketingWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setMarketingWallet(testAcct_.address);
		expect(await cosmicSignatureGameProxy.marketingWallet()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setCharityAddress(testAcct_.address);
		expect(await cosmicSignatureGameProxy.charityAddress()).to.equal(testAcct_.address);

		await cosmicSignatureGameProxy.setInitialDurationUntilMainPrizeDivisor(99n);
		expect(await cosmicSignatureGameProxy.initialDurationUntilMainPrizeDivisor()).to.equal(99n);

		await cosmicSignatureGameProxy.setMainPrizeTimeIncrementInMicroSeconds(99n);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).to.equal(99n);

		await cosmicSignatureGameProxy.setMainPrizeTimeIncrementIncreaseDivisor(899n);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).to.equal(899n);

		await cosmicSignatureGameProxy.setEthDutchAuctionEndingBidPriceDivisor(99n);
		expect(await cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor()).to.equal(99n);

		await cosmicSignatureGameProxy.setNextEthBidPriceIncreaseDivisor(99n);
		expect(await cosmicSignatureGameProxy.nextEthBidPriceIncreaseDivisor()).to.equal(99n);

		await cosmicSignatureGameProxy.setCstDutchAuctionDurationDivisor(11n);
		expect(await cosmicSignatureGameProxy.cstDutchAuctionDurationDivisor()).to.equal(11n);

		await cosmicSignatureGameProxy.setCstDutchAuctionBeginningBidPriceMinLimit(hre.ethers.parseEther("111"));
		expect(await cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPriceMinLimit()).to.equal(hre.ethers.parseEther("111"));
		// await expect(cosmicSignatureGameProxy.setStartingBidPriceCstMinLimit(111n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ProvidedStartingBidPriceCstMinLimitIsTooSmall");

		await cosmicSignatureGameProxy.setTokenReward(1234567890n);
		expect(await cosmicSignatureGameProxy.tokenReward()).to.equal(1234567890n);

		await expect(cosmicSignatureGameProxy.setMainEthPrizeAmountPercentage(75n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const mainEthPrizeAmountPercentage_ = await cosmicSignatureGameProxy.mainEthPrizeAmountPercentage();
		await cosmicSignatureGameProxy.setMainEthPrizeAmountPercentage(mainEthPrizeAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).to.equal(mainEthPrizeAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.setMainEthPrizeAmountPercentage(mainEthPrizeAmountPercentage_);

		await expect(cosmicSignatureGameProxy.setChronoWarriorEthPrizeAmountPercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const chronoWarriorEthPrizeAmountPercentage_ = await cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage();
		await cosmicSignatureGameProxy.setChronoWarriorEthPrizeAmountPercentage(chronoWarriorEthPrizeAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).to.equal(chronoWarriorEthPrizeAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.setChronoWarriorEthPrizeAmountPercentage(chronoWarriorEthPrizeAmountPercentage_);

		await expect(cosmicSignatureGameProxy.setRaffleTotalEthPrizeAmountPercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const raffleTotalEthPrizeAmountPercentage_ = await cosmicSignatureGameProxy.raffleTotalEthPrizeAmountPercentage();
		await cosmicSignatureGameProxy.setRaffleTotalEthPrizeAmountPercentage(raffleTotalEthPrizeAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.raffleTotalEthPrizeAmountPercentage()).to.equal(raffleTotalEthPrizeAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.setRaffleTotalEthPrizeAmountPercentage(raffleTotalEthPrizeAmountPercentage_);

		await expect(cosmicSignatureGameProxy.setStakingTotalEthRewardAmountPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const stakingTotalEthRewardAmountPercentage_ = await cosmicSignatureGameProxy.stakingTotalEthRewardAmountPercentage();
		await cosmicSignatureGameProxy.setStakingTotalEthRewardAmountPercentage(stakingTotalEthRewardAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.stakingTotalEthRewardAmountPercentage()).to.equal(stakingTotalEthRewardAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.setStakingTotalEthRewardAmountPercentage(stakingTotalEthRewardAmountPercentage_);

		await expect(cosmicSignatureGameProxy.setCharityEthDonationAmountPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const charityEthDonationAmountPercentage_ = await cosmicSignatureGameProxy.charityEthDonationAmountPercentage();
		await cosmicSignatureGameProxy.setCharityEthDonationAmountPercentage(charityEthDonationAmountPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).to.equal(charityEthDonationAmountPercentage_ + 1n);
		await cosmicSignatureGameProxy.setCharityEthDonationAmountPercentage(charityEthDonationAmountPercentage_);

		await cosmicSignatureGameProxy.setTimeoutDurationToClaimMainPrize(99n);
		expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).to.equal(99n);

		await cosmicSignatureGameProxy.setCstRewardAmountMultiplier(99n);
		expect(await cosmicSignatureGameProxy.cstRewardAmountMultiplier()).to.equal(99n);

		await cosmicSignatureGameProxy.setNumRaffleEthPrizesForBidders(99n);
		expect(await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).to.equal(99n);

		await cosmicSignatureGameProxy.setNumRaffleCosmicSignatureNftsForBidders(99n);
		expect(await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).to.equal(99n);

		await cosmicSignatureGameProxy.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(99n);
		expect(await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).to.equal(99n);

		await cosmicSignatureGameProxy.setActivationTime(123n);
		expect(await cosmicSignatureGameProxy.activationTime()).to.equal(123n);
		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).lessThan(-1e9);

		// await expect(cosmicSignatureGameProxy.prepareMaintenance()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemMode");
		// await cosmicSignatureGameProxy.setRuntimeMode();
	});
	it("In the active mode, setters are not available", async function () {
		const isRuntimeMode_ = true;
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, /*addr2, addr3, addr4, addr5, addr6, addr7,*/] = signers;
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", /*addr7.address,*/ addr1.address, false, isRuntimeMode_ ? 1 : 0 /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0n);

		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).within((-24n) * 60n * 60n, 0n);

		const testAcct_ = hre.ethers.Wallet.createRandom();
		// const revertStr = "System must be in MODE_MAINTENANCE.";
		// await expect(cosmicSignatureGameProxy.setRuntimeMode()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemMode").withArgs(revertStr, 0n);
		// await expect(cosmicSignatureGameProxy.setActivationTime(123n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await cosmicSignatureGameProxy.setActivationTime(123n);
		await cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(11n * 60n * 60n);
		await expect(cosmicSignatureGameProxy.setMarketingWalletCstContributionAmount(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMaxMessageLength(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCosmicSignatureToken(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setPrizesWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMarketingWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCharityAddress(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setInitialDurationUntilMainPrizeDivisor(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMainPrizeTimeIncrementInMicroSeconds(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMainPrizeTimeIncrementIncreaseDivisor(899n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setEthDutchAuctionEndingBidPriceDivisor(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNextEthBidPriceIncreaseDivisor(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCstDutchAuctionDurationDivisor(11n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCstDutchAuctionBeginningBidPriceMinLimit(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setTokenReward(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMainEthPrizeAmountPercentage(26n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setChronoWarriorEthPrizeAmountPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setRaffleTotalEthPrizeAmountPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setStakingTotalEthRewardAmountPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCharityEthDonationAmountPercentage(11n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setTimeoutDurationToClaimMainPrize(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCstRewardAmountMultiplier(11n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNumRaffleEthPrizesForBidders(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNumRaffleCosmicSignatureNftsForBidders(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		// await cosmicSignatureGameProxy.prepareMaintenance();
	});
	it("In the inactive mode, active mode methods are not available", async function () {
		const isRuntimeMode_ = false;
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, /*addr2, addr3, addr4, addr5, addr6, addr7,*/] = signers;
		const {cosmicSignatureGameProxy, randomWalkNft,} =
			await basicDeployment(owner, "", /*addr7.address,*/ addr1.address, false, isRuntimeMode_ ? 1 : 0 /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).greaterThan(+1e9);

		// const bidParams = { message: "", randomWalkNftId: -1 };
		// const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(cosmicSignatureGameProxy.bid(/*params*/ (-1), "", { value: nextEthBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicSignatureGameProxy.bidAndDonateNft(/*params*/ (-1), "", owner.address, 0, { value: nextEthBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicSignatureGameProxy.bidWithCst(10n ** 30n, "")).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		// todo-1 This reverts with a different error. It's probably correct, but take another look. Comment.
		await expect(cosmicSignatureGameProxy.claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NoBidsPlacedInCurrentRound");
		// // todo-1 I have moved NFT donations to `PrizesWallet`.
		// await expect(cosmicSignatureGameProxy.claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		// // todo-1 I have moved NFT donations to `PrizesWallet`.
		// await expect(cosmicSignatureGameProxy.claimManyDonatedNfts([0])).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(owner.sendTransaction({ to: await cosmicSignatureGameProxy.getAddress(), value: nextEthBidPrice_})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		// await expect(cosmicSignatureGameProxy.donateEth({value: nextEthBidPrice_})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		// await expect(cosmicSignatureGameProxy.donateEthWithInfo("{}", {value: nextEthBidPrice_})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");

		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		await randomWalkNft.connect(addr1).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		// // todo-1 I have moved NFT donations to `PrizesWallet`
		// // todo-1 and NFT donation without making a bid is now prohibited.
		// await expect(cosmicSignatureGameProxy.connect(addr1).donateNft(await randomWalkNft.getAddress(), 0n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
	});
	it("The active and inactive modes behave correctly", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;
		// let cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();
		// let ownableErr = cosmicSignatureGameProxy.interface.getError("OwnableUnauthorizedAccount");

		// // Comment-202501192 applies.
		// await hre.ethers.provider.send("evm_mine");

		// const bidParams = { message: "", randomWalkNftId: -1 };
		// const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);

		// let systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0n);

		let durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).within((-24n) * 60n * 60n, 0n);
		const activationTime_ = await cosmicSignatureGameProxy.activationTime();
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		let expectedDurationUntilActivation_ = activationTime_ - BigInt(latestBlock_.timestamp);
		expect(durationUntilActivation_).equal(expectedDurationUntilActivation_);

		const donationAmount = hre.ethers.parseEther('10');
		await cosmicSignatureGameProxy.connect(addr2).donateEth({ value: donationAmount });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: nextEthBidPrice_ });

		// await cosmicSignatureGameProxy.prepareMaintenance();
		// await expect(cosmicSignatureGameProxy.connect(addr1).prepareMaintenance()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		await cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(123n * 60n);
		await expect(cosmicSignatureGameProxy.connect(addr1).setDelayDurationBeforeNextRound(123n * 60n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		// systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(1n);

		const delayDurationBeforeNextRound_ = await cosmicSignatureGameProxy.delayDurationBeforeNextRound();
		expect(delayDurationBeforeNextRound_).to.equal(123n * 60n);

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(1n);
		await cosmicSignatureGameProxy.connect(addr1).claimMainPrize();

		// systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(2n);

		durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).equal(delayDurationBeforeNextRound_);

		// await cosmicSignatureGameProxy.setRuntimeMode();
		// systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0n);

		latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp + 1);
		durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).equal(0n);

		// The next bidding round has started. So we are allowed to bid.
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: nextEthBidPrice_ });
	});
	it("Unauthorized access to restricted methods is denied", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft, cosmicSignatureToken, charityWallet,} =
			await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		// await expect(cosmicSignatureGameProxy.connect(addr1).setRuntimeMode())
		// 	.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setActivationTime(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setDelayDurationBeforeNextRound(11n * 60n * 60n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMarketingWalletCstContributionAmount(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMaxMessageLength(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCosmicSignatureToken(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setRandomWalkNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount")
		await expect(cosmicSignatureGameProxy.connect(addr1).setCosmicSignatureNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setPrizesWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setStakingWalletRandomWalkNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setStakingWalletCosmicSignatureNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMarketingWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCharityAddress(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setInitialDurationUntilMainPrizeDivisor(101n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMainPrizeTimeIncrementInMicroSeconds(3n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMainPrizeTimeIncrementIncreaseDivisor(2n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setEthDutchAuctionEndingBidPriceDivisor(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNextEthBidPriceIncreaseDivisor(101n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCstDutchAuctionDurationDivisor(11n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCstDutchAuctionBeginningBidPriceMinLimit(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setTokenReward(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMainEthPrizeAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setChronoWarriorEthPrizeAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setRaffleTotalEthPrizeAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setStakingTotalEthRewardAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCharityEthDonationAmountPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setTimeoutDurationToClaimMainPrize(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCstRewardAmountMultiplier(12n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNumRaffleEthPrizesForBidders(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNumRaffleCosmicSignatureNftsForBidders(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		await expect(charityWallet.connect(addr1).setCharityAddress(addr1.address))
			.to.be.revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");

		// todo-1 Add `cosmicSignatureToken.transferToMarketingWalletOrBurn` to all tests. But I have eliminated it.
		await expect(cosmicSignatureToken.connect(addr1).mint(addr1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "CallDenied");
		await expect(cosmicSignatureToken.mint(addr1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "CallDenied");
		await expect(cosmicSignatureToken.connect(addr1)["burn(address,uint256)"](addr1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, "CallDenied");
		await expect(cosmicSignatureToken.connect(addr1)["burn(uint256)"](10000n));

		await expect(cosmicSignatureNft.connect(addr1).setNftBaseUri("://uri"))
			.to.be.revertedWithCustomError(cosmicSignatureNft, "OwnableUnauthorizedAccount");
	});
});
