"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("SystemManagement", function () {
	/// [ToDo-202411224-1]
	/// This TODO is done where it's mentioned.
	/// Rewrite all deployment functions this way.
	/// Remove other calls to `getSigners`. Use `signers` from the returned object.
	/// Find (case insensitive, not whole word, reg ex): DeployerAcct|deployCosmicSignature|basicDeployment|signers|owner(?!ship\b)|addr[\ds]
	/// [/ToDo-202411224-1]
	async function deployCosmicSignature() {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const contracts = await basicDeployment(owner, "", 1, addr1.address, true);
		contracts.signers = signers;
		return contracts;
	}
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("In the inactive mode, setters function correctly", async function () {
		const isRuntimeMode_ = false;
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", isRuntimeMode_ ? 1 : 0, addr1.address, true /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		let testAcct_;

		// const systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(2n);

		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).to.be.greaterThan(0n);

		await cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(99n * 60n);
		expect(await cosmicSignatureGameProxy.delayDurationBeforeNextRound()).to.equal(99n * 60n);

		await cosmicSignatureGameProxy.setMarketingReward(1234567890n);
		expect(await cosmicSignatureGameProxy.marketingReward()).to.equal(1234567890n);

		await cosmicSignatureGameProxy.setMaxMessageLength(1234567890n);
		expect(await cosmicSignatureGameProxy.maxMessageLength()).to.equal(1234567890n);

		await expect(cosmicSignatureGameProxy.setTokenContract(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setTokenContract(testAcct_.address);
		expect(await cosmicSignatureGameProxy.token()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setMarketingWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setMarketingWallet(testAcct_.address);
		expect(await cosmicSignatureGameProxy.marketingWallet()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setCosmicSignatureNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.nft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setRandomWalkNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.stakingWalletCosmicSignatureNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(testAcct_.address);
		expect(await cosmicSignatureGameProxy.stakingWalletRandomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setPrizesWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setPrizesWallet(testAcct_.address);
		expect(await cosmicSignatureGameProxy.prizesWallet()).to.equal(testAcct_.address);

		await expect(cosmicSignatureGameProxy.setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicSignatureGameProxy.setCharityAddress(testAcct_.address);
		expect(await cosmicSignatureGameProxy.charityAddress()).to.equal(testAcct_.address);

		await cosmicSignatureGameProxy.setNanoSecondsExtra(99n);
		expect(await cosmicSignatureGameProxy.nanoSecondsExtra()).to.equal(99n);

		await cosmicSignatureGameProxy.setTimeIncrease(99n);
		expect(await cosmicSignatureGameProxy.timeIncrease()).to.equal(99n);

		await cosmicSignatureGameProxy.setInitialSecondsUntilPrize(99n);
		expect(await cosmicSignatureGameProxy.initialSecondsUntilPrize()).to.equal(99n);

		await cosmicSignatureGameProxy.setInitialBidAmountFraction(99n);
		expect(await cosmicSignatureGameProxy.initialBidAmountFraction()).to.equal(99n);

		await cosmicSignatureGameProxy.setPriceIncrease(99n);
		expect(await cosmicSignatureGameProxy.priceIncrease()).to.equal(99n);

		await cosmicSignatureGameProxy.setRoundStartCstAuctionLength(11n * 60n * 60n);
		expect(await cosmicSignatureGameProxy.roundStartCstAuctionLength()).to.equal(11n * 60n * 60n);

		await cosmicSignatureGameProxy.setStartingBidPriceCSTMinLimit(hre.ethers.parseEther("111"));
		expect(await cosmicSignatureGameProxy.startingBidPriceCSTMinLimit()).to.equal(hre.ethers.parseEther("111"));
		// await expect(cosmicSignatureGameProxy.setStartingBidPriceCSTMinLimit(111n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ProvidedStartingBidPriceCSTMinLimitIsTooSmall");

		await cosmicSignatureGameProxy.setTokenReward(1234567890n);
		expect(await cosmicSignatureGameProxy.tokenReward()).to.equal(1234567890n);

		await expect(cosmicSignatureGameProxy.setMainPrizePercentage(75n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const mainPrizePercentage_ = await cosmicSignatureGameProxy.mainPrizePercentage();
		await cosmicSignatureGameProxy.setMainPrizePercentage(mainPrizePercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.mainPrizePercentage()).to.equal(mainPrizePercentage_ + 1n);
		await cosmicSignatureGameProxy.setMainPrizePercentage(mainPrizePercentage_);

		await expect(cosmicSignatureGameProxy.setChronoWarriorEthPrizePercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const chronoWarriorEthPrizePercentage_ = await cosmicSignatureGameProxy.chronoWarriorEthPrizePercentage();
		await cosmicSignatureGameProxy.setChronoWarriorEthPrizePercentage(chronoWarriorEthPrizePercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.chronoWarriorEthPrizePercentage()).to.equal(chronoWarriorEthPrizePercentage_ + 1n);
		await cosmicSignatureGameProxy.setChronoWarriorEthPrizePercentage(chronoWarriorEthPrizePercentage_);

		await expect(cosmicSignatureGameProxy.setRafflePercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const rafflePercentage_ = await cosmicSignatureGameProxy.rafflePercentage();
		await cosmicSignatureGameProxy.setRafflePercentage(rafflePercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.rafflePercentage()).to.equal(rafflePercentage_ + 1n);
		await cosmicSignatureGameProxy.setRafflePercentage(rafflePercentage_);

		await expect(cosmicSignatureGameProxy.setStakingPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const stakingPercentage_ = await cosmicSignatureGameProxy.stakingPercentage();
		await cosmicSignatureGameProxy.setStakingPercentage(stakingPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.stakingPercentage()).to.equal(stakingPercentage_ + 1n);
		await cosmicSignatureGameProxy.setStakingPercentage(stakingPercentage_);

		await expect(cosmicSignatureGameProxy.setCharityPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		const charityPercentage_ = await cosmicSignatureGameProxy.charityPercentage();
		await cosmicSignatureGameProxy.setCharityPercentage(charityPercentage_ + 1n);
		expect(await cosmicSignatureGameProxy.charityPercentage()).to.equal(charityPercentage_ + 1n);
		await cosmicSignatureGameProxy.setCharityPercentage(charityPercentage_);

		await cosmicSignatureGameProxy.setTimeoutDurationToClaimMainPrize(99n);
		expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).to.equal(99n);

		await cosmicSignatureGameProxy.setCstRewardAmountMultiplier(99n);
		expect(await cosmicSignatureGameProxy.cstRewardAmountMultiplier()).to.equal(99n);

		await cosmicSignatureGameProxy.setNumRaffleETHWinnersBidding(99n);
		expect(await cosmicSignatureGameProxy.numRaffleETHWinnersBidding()).to.equal(99n);

		await cosmicSignatureGameProxy.setNumRaffleNftWinnersBidding(99n);
		expect(await cosmicSignatureGameProxy.numRaffleNftWinnersBidding()).to.equal(99n);

		await cosmicSignatureGameProxy.setNumRaffleNftWinnersStakingRWalk(99n);
		expect(await cosmicSignatureGameProxy.numRaffleNftWinnersStakingRWalk()).to.equal(99n);

		await cosmicSignatureGameProxy.setActivationTime(123n);
		expect(await cosmicSignatureGameProxy.activationTime()).to.equal(123n);
		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).to.equal(0n);

		// await expect(cosmicSignatureGameProxy.prepareMaintenance()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemMode");
		// await cosmicSignatureGameProxy.setRuntimeMode();
	});
	it("In the active mode, setters are not available", async function () {
		const isRuntimeMode_ = true;
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", isRuntimeMode_ ? 1 : 0, addr1.address, true /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0n);

		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).to.equal(0n);

		const testAcct_ = hre.ethers.Wallet.createRandom();
		// const revertStr = "System must be in MODE_MAINTENANCE.";
		// await expect(cosmicSignatureGameProxy.setRuntimeMode()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemMode").withArgs(revertStr, 0n);
		// await expect(cosmicSignatureGameProxy.setActivationTime(123n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await cosmicSignatureGameProxy.setActivationTime(123n);
		await cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(11n * 60n * 60n);
		await expect(cosmicSignatureGameProxy.setMarketingReward(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMaxMessageLength(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setTokenContract(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMarketingWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setPrizesWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCharityAddress(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNanoSecondsExtra(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setTimeIncrease(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setInitialSecondsUntilPrize(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setInitialBidAmountFraction(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setPriceIncrease(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setRoundStartCstAuctionLength(11n * 60n * 60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setStartingBidPriceCSTMinLimit(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setTokenReward(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setMainPrizePercentage(26n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setChronoWarriorEthPrizePercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setRafflePercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setStakingPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCharityPercentage(11n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setTimeoutDurationToClaimMainPrize(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setCstRewardAmountMultiplier(11n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNumRaffleETHWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNumRaffleNftWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicSignatureGameProxy.setNumRaffleNftWinnersStakingRWalk(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		// await cosmicSignatureGameProxy.prepareMaintenance();
	});
	it("In the inactive mode, active mode methods are not available", async function () {
		const isRuntimeMode_ = false;
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const {cosmicSignatureGameProxy, randomWalkNft,} =
			await basicDeployment(owner, "", isRuntimeMode_ ? 1 : 0, addr1.address, true /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).to.be.greaterThan(0n);

		// const bidParams = { message: "", randomWalkNftId: -1 };
		// const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		const bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.bid(/*params*/ (-1), "", { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicSignatureGameProxy.bidAndDonateNft(/*params*/ (-1), "", owner.address, 0, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicSignatureGameProxy.bidWithCst(10n ** 30n, "")).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		// todo-1 This reverts with a different error. It's probably correct, but take another look. Comment.
		await expect(cosmicSignatureGameProxy.claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NoLastBidder");
		// // todo-1 I have moved NFT donations to `PrizesWallet`.
		// await expect(cosmicSignatureGameProxy.claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		// // todo-1 I have moved NFT donations to `PrizesWallet`.
		// await expect(cosmicSignatureGameProxy.claimManyDonatedNfts([0])).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(owner.sendTransaction({ to: await cosmicSignatureGameProxy.getAddress(), value: bidPrice})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicSignatureGameProxy.donateEth({value: bidPrice})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicSignatureGameProxy.donateEthWithInfo("{}",{value: bidPrice})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");

		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		await randomWalkNft.connect(addr1).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		// // todo-1 I have moved NFT donations to `PrizesWallet`
		// // todo-1 and NFT donation without making a bid is now prohibited.
		// await expect(cosmicSignatureGameProxy.connect(addr1).donateNft(await randomWalkNft.getAddress(), 0n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
	});
	it("The active and inactive modes function correctly", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2,] = signers;
		// let cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();
		// let ownableErr = cosmicSignatureGameProxy.interface.getError("OwnableUnauthorizedAccount");

		// const bidParams = { message: "", randomWalkNftId: -1 };
		// const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);

		// let systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0n);

		let durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).to.equal(0n);

		const donationAmount = hre.ethers.parseEther('10');
		await cosmicSignatureGameProxy.connect(addr2).donateEth({ value: donationAmount });

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });

		// await cosmicSignatureGameProxy.prepareMaintenance();
		// await expect(cosmicSignatureGameProxy.connect(addr1).prepareMaintenance()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		await cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(123n * 60n);
		await expect(cosmicSignatureGameProxy.connect(addr1).setDelayDurationBeforeNextRound(123n * 60n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		// systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(1n);

		const delayDurationBeforeNextRound_ = await cosmicSignatureGameProxy.delayDurationBeforeNextRound();
		expect(delayDurationBeforeNextRound_).to.equal(123n * 60n);

		const durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send('evm_mine');
		await cosmicSignatureGameProxy.connect(addr1).claimPrize();

		// systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(2n);

		durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).to.equal(delayDurationBeforeNextRound_);

		// await cosmicSignatureGameProxy.setRuntimeMode();
		// systemModeCode_ = await cosmicSignatureGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0n);

		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
		durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).to.equal(0);

		// The next bidding round has started. So we are allowed to bid.
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
	});
	it("Unauthorized access to restricted methods is denied", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft, cosmicSignatureToken, charityWallet,} = await loadFixture(deployCosmicSignature);
		const [owner, addr1,] = signers;

		// await expect(cosmicSignatureGameProxy.connect(addr1).setRuntimeMode())
		// 	.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setActivationTime(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setDelayDurationBeforeNextRound(11n * 60n * 60n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMarketingReward(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMaxMessageLength(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setTokenContract(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMarketingWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCosmicSignatureNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setRandomWalkNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount")
		await expect(cosmicSignatureGameProxy.connect(addr1).setStakingWalletCosmicSignatureNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setStakingWalletRandomWalkNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setPrizesWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCharityAddress(addr1.address))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNanoSecondsExtra(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setTimeIncrease(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setInitialSecondsUntilPrize(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setInitialBidAmountFraction(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setPriceIncrease(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setRoundStartCstAuctionLength(11n * 60n * 60n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setStartingBidPriceCSTMinLimit(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setTokenReward(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setMainPrizePercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setChronoWarriorEthPrizePercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setRafflePercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setStakingPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCharityPercentage(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setTimeoutDurationToClaimMainPrize(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setCstRewardAmountMultiplier(12n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNumRaffleETHWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNumRaffleNftWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureGameProxy.connect(addr1).setNumRaffleNftWinnersStakingRWalk(1n))
			.to.be.revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");

		await expect(charityWallet.connect(addr1).setCharityAddress(addr1.address))
			.to.be.revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");

		await expect(cosmicSignatureToken.connect(addr1).mint(addr1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureToken.mint(addr1.address, 10000n));
		await expect(cosmicSignatureToken.connect(addr1)["burn(address,uint256)"](addr1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicSignatureToken, "OwnableUnauthorizedAccount");
		await expect(cosmicSignatureToken.connect(addr1)["burn(uint256)"](10000n));

		await expect(cosmicSignatureNft.connect(addr1).setNftBaseUri("://uri"))
			.to.be.revertedWithCustomError(cosmicSignatureNft, "OwnableUnauthorizedAccount");
	});
	it("The getDurationUntilActivation method functions correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", 0, addr1.address, true);

		const bnum = await hre.ethers.provider.getBlockNumber();
		const bdata = await hre.ethers.provider.getBlock(bnum);
		const ts = bdata.timestamp + 60;
		await cosmicSignatureGameProxy.setActivationTime(ts);
		// const at = await cosmicSignatureGameProxy.activationTime();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts - 1]);
		await hre.ethers.provider.send("evm_mine");
		expect((await hre.ethers.provider.getBlock("latest")).timestamp).to.equal(ts - 1);
		let durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).to.equal(1n);
		// await cosmicSignatureGameProxy.setRuntimeMode();
		// await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
		await hre.ethers.provider.send("evm_mine");
		expect((await hre.ethers.provider.getBlock("latest")).timestamp).to.equal(ts);
		durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).to.equal(0n);
		// await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts + 1]);
		await hre.ethers.provider.send("evm_mine");
		expect((await hre.ethers.provider.getBlock("latest")).timestamp).to.equal(ts + 1);
		durationUntilActivation_ = await cosmicSignatureGameProxy.getDurationUntilActivation();
		expect(durationUntilActivation_).to.equal(0n);
	});
	it("The transferOwnership method functions correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, addr2,] = signers;
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", 0, addr1.address, true);

		expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).to.be.greaterThan(0n);

		for ( let counter_ = 0; ; ++ counter_ ) {
			await cosmicSignatureGameProxy.transferOwnership(addr2.address);
			expect((await cosmicSignatureGameProxy.owner()).toString()).to.equal(addr2.address.toString());
			await cosmicSignatureGameProxy.connect(addr2).transferOwnership(owner.address);
			expect((await cosmicSignatureGameProxy.owner()).toString()).to.equal(owner.address.toString());
			if (counter_ > 0) {
				break;
			}
			await cosmicSignatureGameProxy.setActivationTime(123n);
			expect(await cosmicSignatureGameProxy.getDurationUntilActivation()).to.equal(0n);
		}
	});
	it("The initialize method is disabled", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		const [owner,] = signers;

		await expect(cosmicSignatureGameProxy.initialize(owner.address)).revertedWithCustomError(cosmicSignatureGameProxy, "InvalidInitialization");
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using the recommended approach", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		const [owner,] = signers;
		const implementation1AddressAsString_ =
			await cosmicSignatureGameProxy.runner.provider.getStorage(
				await cosmicSignatureGameProxy.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		expect(implementation1AddressAsString_).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
		await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);
		const CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
		const cosmicSignatureGameProxy2 =
			await hre.upgrades.upgradeProxy(
				cosmicSignatureGameProxy,
				CosmicSignatureGameOpenBid,
				{
					kind: "uups",
					call: "initialize2",
				}
			);
		expect(await cosmicSignatureGameProxy2.getAddress()).to.equal(await cosmicSignatureGameProxy.getAddress());
		const implementation2AddressAsString_ =
			await cosmicSignatureGameProxy2.runner.provider.getStorage(
				await cosmicSignatureGameProxy2.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		expect(implementation2AddressAsString_).not.equal(implementation1AddressAsString_);
		expect(await cosmicSignatureGameProxy2.timesBidPrice()).to.equal(3n);
		await cosmicSignatureGameProxy2.setTimesBidPrice(10n);
		expect(await cosmicSignatureGameProxy2.timesBidPrice()).to.equal(10n);
		await expect(cosmicSignatureGameProxy2.initialize(owner.address)).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
		await expect(cosmicSignatureGameProxy2.initialize2()).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using our minimalistic unsafe approach", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		const [owner,] = signers;
		const implementation1AddressAsString_ =
			await cosmicSignatureGameProxy.runner.provider.getStorage(
				await cosmicSignatureGameProxy.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		expect(implementation1AddressAsString_).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
		await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);
		const CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
		const cosmicSignatureGameOpenBid = await CosmicSignatureGameOpenBid.deploy();
		await cosmicSignatureGameOpenBid.waitForDeployment();
		await cosmicSignatureGameProxy.upgradeTo(await cosmicSignatureGameOpenBid.getAddress());
		const cosmicSignatureGameProxy2 = await hre.ethers.getContractAt("CosmicSignatureGameOpenBid", await cosmicSignatureGameProxy.getAddress());
		const implementation2AddressAsString_ =
			await cosmicSignatureGameProxy2.runner.provider.getStorage(
				await cosmicSignatureGameProxy2.getAddress(),

				// Comment-202412063 applies.
				"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
			);
		const implementation2Address_ = hre.ethers.getAddress(BigInt(implementation2AddressAsString_).toString(16).padStart(40, "0"));
		expect(implementation2Address_).equal(await cosmicSignatureGameOpenBid.getAddress());
		expect(await cosmicSignatureGameProxy2.timesBidPrice()).to.equal(0n);
		await cosmicSignatureGameProxy2.initialize2();
		expect(await cosmicSignatureGameProxy2.timesBidPrice()).to.equal(3n);
		await cosmicSignatureGameProxy2.setTimesBidPrice(10n);
		expect(await cosmicSignatureGameProxy2.timesBidPrice()).to.equal(10n);
		await expect(cosmicSignatureGameProxy2.initialize(owner.address)).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
		await expect(cosmicSignatureGameProxy2.initialize2()).revertedWithCustomError(cosmicSignatureGameProxy2, "InvalidInitialization");
	});

	// `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would not allow doing this.
	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade to a completely different contract using our minimalistic unsafe approach", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		const [owner,] = signers;

		await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);

		const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
		const brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.waitForDeployment();

		await cosmicSignatureGameProxy.upgradeTo(await brokenCharity.getAddress());

		// If we upgraded to `CosmicSignatureGameOpenBid`, we would call `cosmicSignatureGameProxy2.initialize2` at this point.

		await expect(owner.sendTransaction({ to: await cosmicSignatureGameProxy.getAddress(), value: 1000000000000000000n})).revertedWith("Test deposit failed.");
	});

	// Comment-202412129 relates.
	it("Only the owner is permitted to upgrade CosmicSignatureGame", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2,] = signers;

		// The recommended approach.
		{
			const CosmicSignatureGameOpenBid = await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid");
			const tx =
				hre.upgrades.upgradeProxy(
					cosmicSignatureGameProxy/*.connect(addr2)*/,
					CosmicSignatureGameOpenBid.connect(addr2),
					{
						kind: "uups",
						call: "initialize2",
					}
				);
			// await tx.wait();
			await expect(tx).revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		}

		// Our minimalistic unsafe approach.
		{
			await expect(cosmicSignatureGameProxy.connect(addr2).upgradeTo(addr1.address)).revertedWithCustomError(cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		}
	});
});
