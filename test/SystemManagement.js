"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("SystemManagement tests", function () {
	/// [ToDo-202411224-1]
	/// This TODO is done where it's mentioned.
	/// Rewrite all deployment functions this way.
	/// Remove other calls to `getSigners`. Use `signers` from the returned object.
	/// Find (case insensitive, not whole word, reg ex): DeployerAcct|deployCosmic|basicDeployment|signers|owner(?!ship\b)|addr[\ds]
	/// [/ToDo-202411224-1]
	async function deployCosmic() {
		const signers = await hre.ethers.getSigners();
		const [owner,] = signers;
		const contracts = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		contracts.signers = signers;
		return contracts;
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNFTId", type: "int256" },
		],
	};
	it("In the inactive mode, setters function correctly", async function () {
		const isRuntimeMode_ = false;
		const signers = await hre.ethers.getSigners();
		const [owner,] = signers;
		const {cosmicGameProxy,} =
			await basicDeployment(owner, "", isRuntimeMode_ ? 1 : 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		let testAcct_;

		// const systemModeCode_ = await cosmicGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(2);

		expect(await cosmicGameProxy.timeUntilActivation()).to.be.greaterThan(0n);

		await cosmicGameProxy.setDelayDurationBeforeNextRound(99n * 60n);
		expect(await cosmicGameProxy.delayDurationBeforeNextRound()).to.equal(99n * 60n);

		await cosmicGameProxy.setMarketingReward(1234567890n);
		expect(await cosmicGameProxy.marketingReward()).to.equal(1234567890n);

		await cosmicGameProxy.setMaxMessageLength(1234567890n);
		expect(await cosmicGameProxy.maxMessageLength()).to.equal(1234567890n);

		await expect(cosmicGameProxy.setPrizesWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setPrizesWallet(testAcct_.address);
		expect(await cosmicGameProxy.prizesWallet()).to.equal(testAcct_.address);

		await expect(cosmicGameProxy.setTokenContract(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setTokenContract(testAcct_.address);
		expect(await cosmicGameProxy.token()).to.equal(testAcct_.address);

		await expect(cosmicGameProxy.setMarketingWallet(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setMarketingWallet(testAcct_.address);
		expect(await cosmicGameProxy.marketingWallet()).to.equal(testAcct_.address);

		await expect(cosmicGameProxy.setCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setCosmicSignatureNft(testAcct_.address);
		expect(await cosmicGameProxy.nft()).to.equal(testAcct_.address);

		await expect(cosmicGameProxy.setRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setRandomWalkNft(testAcct_.address);
		expect(await cosmicGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicGameProxy.setStakingWalletCosmicSignatureNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setStakingWalletCosmicSignatureNft(testAcct_.address);
		expect(await cosmicGameProxy.stakingWalletCosmicSignatureNft()).to.equal(testAcct_.address);

		await expect(cosmicGameProxy.setStakingWalletRandomWalkNft(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setStakingWalletRandomWalkNft(testAcct_.address);
		expect(await cosmicGameProxy.stakingWalletRandomWalkNft()).to.equal(testAcct_.address);

		await expect(cosmicGameProxy.setCharity(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		testAcct_ = hre.ethers.Wallet.createRandom();
		await cosmicGameProxy.setCharity(testAcct_.address);
		expect(await cosmicGameProxy.charity()).to.equal(testAcct_.address);

		await cosmicGameProxy.setNanoSecondsExtra(99n);
		expect(await cosmicGameProxy.nanoSecondsExtra()).to.equal(99n);

		await cosmicGameProxy.setTimeIncrease(99n);
		expect(await cosmicGameProxy.timeIncrease()).to.equal(99n);

		await cosmicGameProxy.setInitialSecondsUntilPrize(99n);
		expect(await cosmicGameProxy.initialSecondsUntilPrize()).to.equal(99n);

		await cosmicGameProxy.updateInitialBidAmountFraction(99n);
		expect(await cosmicGameProxy.initialBidAmountFraction()).to.equal(99n);

		await cosmicGameProxy.setPriceIncrease(99n);
		expect(await cosmicGameProxy.priceIncrease()).to.equal(99n);

		await cosmicGameProxy.setRoundStartCstAuctionLength(11n * 60n * 60n);
		expect(await cosmicGameProxy.roundStartCstAuctionLength()).to.equal(11n * 60n * 60n);

		await cosmicGameProxy.setStartingBidPriceCSTMinLimit(hre.ethers.parseEther("111"));
		expect(await cosmicGameProxy.startingBidPriceCSTMinLimit()).to.equal(hre.ethers.parseEther("111"));
		await expect(cosmicGameProxy.setStartingBidPriceCSTMinLimit(111n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ProvidedStartingBidPriceCSTMinLimitIsTooSmall");

		await cosmicGameProxy.setTokenReward(1234567890n);
		expect(await cosmicGameProxy.tokenReward()).to.equal(1234567890n);

		await expect(cosmicGameProxy.setMainPrizePercentage(75n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		let mainPrizePercentage_ = await cosmicGameProxy.mainPrizePercentage();
		await cosmicGameProxy.setMainPrizePercentage(mainPrizePercentage_ + 1n);
		expect(await cosmicGameProxy.mainPrizePercentage()).to.equal(mainPrizePercentage_ + 1n);
		await cosmicGameProxy.setMainPrizePercentage(mainPrizePercentage_);

		await expect(cosmicGameProxy.setChronoWarriorEthPrizePercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		let chronoWarriorEthPrizePercentage_ = await cosmicGameProxy.chronoWarriorEthPrizePercentage();
		await cosmicGameProxy.setChronoWarriorEthPrizePercentage(chronoWarriorEthPrizePercentage_ + 1n);
		expect(await cosmicGameProxy.chronoWarriorEthPrizePercentage()).to.equal(chronoWarriorEthPrizePercentage_ + 1n);
		await cosmicGameProxy.setChronoWarriorEthPrizePercentage(chronoWarriorEthPrizePercentage_);

		await expect(cosmicGameProxy.setRafflePercentage(55n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		let rafflePercentage_ = await cosmicGameProxy.rafflePercentage();
		await cosmicGameProxy.setRafflePercentage(rafflePercentage_ + 1n);
		expect(await cosmicGameProxy.rafflePercentage()).to.equal(rafflePercentage_ + 1n);
		await cosmicGameProxy.setRafflePercentage(rafflePercentage_);

		await expect(cosmicGameProxy.setStakingPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		let stakingPercentage_ = await cosmicGameProxy.stakingPercentage();
		await cosmicGameProxy.setStakingPercentage(stakingPercentage_ + 1n);
		expect(await cosmicGameProxy.stakingPercentage()).to.equal(stakingPercentage_ + 1n);
		await cosmicGameProxy.setStakingPercentage(stakingPercentage_);

		await expect(cosmicGameProxy.setCharityPercentage(60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "PercentageValidation");
		let charityPercentage_ = await cosmicGameProxy.charityPercentage();
		await cosmicGameProxy.setCharityPercentage(charityPercentage_ + 1n);
		expect(await cosmicGameProxy.charityPercentage()).to.equal(charityPercentage_ + 1n);
		await cosmicGameProxy.setCharityPercentage(charityPercentage_);

		await cosmicGameProxy.setTimeoutDurationToClaimMainPrize(99n);
		expect(await cosmicGameProxy.timeoutDurationToClaimMainPrize()).to.equal(99n);

		await cosmicGameProxy.setErc20RewardMultiplier(99n);
		expect(await cosmicGameProxy.erc20RewardMultiplier()).to.equal(99n);

		await cosmicGameProxy.setNumRaffleETHWinnersBidding(99n);
		expect(await cosmicGameProxy.numRaffleETHWinnersBidding()).to.equal(99n);

		await cosmicGameProxy.setNumRaffleNFTWinnersBidding(99n);
		expect(await cosmicGameProxy.numRaffleNFTWinnersBidding()).to.equal(99n);

		await cosmicGameProxy.setNumRaffleNFTWinnersStakingRWalk(99n);
		expect(await cosmicGameProxy.numRaffleNFTWinnersStakingRWalk()).to.equal(99n);

		await cosmicGameProxy.setActivationTime(123n);
		expect(await cosmicGameProxy.activationTime()).to.equal(123n);
		expect(await cosmicGameProxy.timeUntilActivation()).to.equal(0n);

		// await expect(cosmicGameProxy.prepareMaintenance()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemMode");
		// await cosmicGameProxy.setRuntimeMode();
	});
	it("In the active mode, setters are not available", async function () {
		const isRuntimeMode_ = true;
		const signers = await hre.ethers.getSigners();
		const [owner,] = signers;
		const {cosmicGameProxy,} =
			await basicDeployment(owner, "", isRuntimeMode_ ? 1 : 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		// const systemModeCode_ = await cosmicGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0);

		expect(await cosmicGameProxy.timeUntilActivation()).to.equal(0n);

		const testAcct_ = hre.ethers.Wallet.createRandom();
		// const revertStr = "System must be in MODE_MAINTENANCE.";
		// await expect(cosmicGameProxy.setRuntimeMode()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemMode").withArgs(revertStr, 0n);
		// await expect(cosmicGameProxy.setActivationTime(123n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await cosmicGameProxy.setActivationTime(123n);
		await cosmicGameProxy.setDelayDurationBeforeNextRound(11n * 60n * 60n);
		await expect(cosmicGameProxy.setMarketingReward(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setMaxMessageLength(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setPrizesWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setTokenContract(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setMarketingWallet(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setStakingWalletCosmicSignatureNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setStakingWalletRandomWalkNft(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setCharity(testAcct_.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setNanoSecondsExtra(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setTimeIncrease(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setInitialSecondsUntilPrize(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.updateInitialBidAmountFraction(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setPriceIncrease(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setRoundStartCstAuctionLength(11n * 60n * 60n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setStartingBidPriceCSTMinLimit(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setTokenReward(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setMainPrizePercentage(26n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setChronoWarriorEthPrizePercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setRafflePercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setStakingPercentage(6n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setCharityPercentage(11n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setTimeoutDurationToClaimMainPrize(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setErc20RewardMultiplier(11n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setNumRaffleETHWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setNumRaffleNFTWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		await expect(cosmicGameProxy.setNumRaffleNFTWinnersStakingRWalk(99n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsActive");
		// await cosmicGameProxy.prepareMaintenance();
	});
	it("In the inactive mode, active mode methods are not available", async function () {
		const isRuntimeMode_ = false;
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const {cosmicGameProxy, randomWalkNFT,} =
			await basicDeployment(owner, "", isRuntimeMode_ ? 1 : 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true /* , isRuntimeMode_ */);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		expect(await cosmicGameProxy.timeUntilActivation()).to.be.greaterThan(0n);

		const bidParams = { message: "", randomWalkNFTId: -1 };
		const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		const bidPrice = await cosmicGameProxy.getBidPrice();
		await expect(cosmicGameProxy.bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicGameProxy.bidAndDonateNFT(params, owner.address, 0, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicGameProxy.bidWithCST("")).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");

		// todo-0 This reverts with a different error. It's probably correct, but take another look. Comment.
		await expect(cosmicGameProxy.claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NoLastBidder");

		await expect(cosmicGameProxy.claimDonatedNFT(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicGameProxy.claimManyDonatedNFTs([0])).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(owner.sendTransaction({ to: await cosmicGameProxy.getAddress(), value: bidPrice})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicGameProxy.donate({value: bidPrice})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(cosmicGameProxy.donateWithInfo("{}",{value: bidPrice})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");

		const mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await randomWalkNFT.connect(addr1).setApprovalForAll(await cosmicGameProxy.getAddress(), true);
		await expect(cosmicGameProxy.connect(addr1).donateNFT(await randomWalkNFT.getAddress(), 0n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
	});
	it('The active and inactive modes function correctly', async function () {
		const {signers, cosmicGameProxy,} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2,] = signers;
		// let cosmicGameAddr = await cosmicGameProxy.getAddress();
		// let ownableErr = cosmicGameProxy.interface.getError("OwnableUnauthorizedAccount");

		const bidParams = { message: "", randomWalkNFTId: -1 };
		const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);

		// let systemModeCode_ = await cosmicGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0);

		let durationUntilActivation_ = await cosmicGameProxy.timeUntilActivation();
		expect(durationUntilActivation_).to.equal(0n);

		const donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.connect(addr2).donate({ value: donationAmount });

		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		// await cosmicGameProxy.prepareMaintenance();
		// await expect(cosmicGameProxy.connect(addr1).prepareMaintenance()).to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");

		await cosmicGameProxy.setDelayDurationBeforeNextRound(123n * 60n);
		await expect(cosmicGameProxy.connect(addr1).setDelayDurationBeforeNextRound(123n * 60n)).to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");

		// systemModeCode_ = await cosmicGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(1);

		const delayDurationBeforeNextRound_ = await cosmicGameProxy.delayDurationBeforeNextRound();
		expect(delayDurationBeforeNextRound_).to.equal(123n * 60n);

		const durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).claimPrize();

		// systemModeCode_ = await cosmicGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(2);

		durationUntilActivation_ = await cosmicGameProxy.timeUntilActivation();
		expect(durationUntilActivation_).to.equal(delayDurationBeforeNextRound_);

		// await cosmicGameProxy.setRuntimeMode();
		// systemModeCode_ = await cosmicGameProxy.systemMode();
		// expect(systemModeCode_).to.equal(0);

		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicGameProxy.setActivationTime(latestBlock_.timestamp);
		durationUntilActivation_ = await cosmicGameProxy.timeUntilActivation();
		expect(durationUntilActivation_).to.equal(0);

		// The next bidding round has started. So we are allowed to bid.
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
	});
	it("Unauthorized access to privileged methods is denied", async function () {
		const {signers, cosmicGameProxy, cosmicSignature, cosmicToken, charityWallet,} = await loadFixture(deployCosmic);
		const [owner, addr1,] = signers;

		// await expect(cosmicGameProxy.connect(addr1).setRuntimeMode())
		// 	.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setActivationTime(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setDelayDurationBeforeNextRound(11n * 60n * 60n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMarketingReward(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMaxMessageLength(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setPrizesWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTokenContract(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMarketingWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setCosmicSignatureNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setRandomWalkNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount")
		await expect(cosmicGameProxy.connect(addr1).setStakingWalletCosmicSignatureNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingWalletRandomWalkNft(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setCharity(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNanoSecondsExtra(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTimeIncrease(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setInitialSecondsUntilPrize(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).updateInitialBidAmountFraction(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setPriceIncrease(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setRoundStartCstAuctionLength(11n * 60n * 60n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStartingBidPriceCSTMinLimit(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTokenReward(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMainPrizePercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setChronoWarriorEthPrizePercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setRafflePercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingPercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setCharityPercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTimeoutDurationToClaimMainPrize(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setErc20RewardMultiplier(12n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleETHWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleNFTWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleNFTWinnersStakingRWalk(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");

		await expect(charityWallet.connect(addr1).setCharity(addr1.address))
			.to.be.revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");

		await expect(cosmicToken.connect(addr1).mint(addr1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicToken, "OwnableUnauthorizedAccount");
		await expect(cosmicToken.mint(addr1.address, 10000n));
		await expect(cosmicToken.connect(addr1)["burn(address,uint256)"](addr1.address, 10000n))
			.to.be.revertedWithCustomError(cosmicToken, "OwnableUnauthorizedAccount");
		await expect(cosmicToken.connect(addr1)["burn(uint256)"](10000n));

		await expect(cosmicSignature.connect(addr1).setBaseURI("://uri"))
			.to.be.revertedWithCustomError(cosmicSignature, "OwnableUnauthorizedAccount");
	});
	it("The timeUntilActivation method functions correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner,] = signers;
		const {cosmicGameProxy,} =
			await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);

		const bnum = await hre.ethers.provider.getBlockNumber();
		const bdata = await hre.ethers.provider.getBlock(bnum);
		const ts = bdata.timestamp + 60;
		await cosmicGameProxy.setActivationTime(ts);
		// const at = await cosmicGameProxy.activationTime();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts - 1]);
		await hre.ethers.provider.send("evm_mine");
		let tua = await cosmicGameProxy.timeUntilActivation();
		expect(tua).to.equal(1n);
		// await cosmicGameProxy.setRuntimeMode();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
		await hre.ethers.provider.send("evm_mine");
		tua = await cosmicGameProxy.timeUntilActivation();
		expect(tua).to.equal(0n);
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts + 1]);
		await hre.ethers.provider.send("evm_mine");
		tua = await cosmicGameProxy.timeUntilActivation();
		expect(tua).to.equal(0n);
	});
	it("The transferOwnership method functions correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, addr2,] = signers;
		const {cosmicGameProxy,} =
			await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);

		expect(await cosmicGameProxy.timeUntilActivation()).to.be.greaterThan(0n);

		for ( let counter_ = 0; ; ++ counter_ ) {
			await cosmicGameProxy.transferOwnership(addr2.address);
			expect((await cosmicGameProxy.owner()).toString()).to.equal(addr2.address.toString());
			await cosmicGameProxy.connect(addr2).transferOwnership(owner.address);
			expect((await cosmicGameProxy.owner()).toString()).to.equal(owner.address.toString());
			if (counter_ > 0) {
				break;
			}
			await cosmicGameProxy.setActivationTime(123n);
			expect(await cosmicGameProxy.timeUntilActivation()).to.equal(0n);
		}
	});
	it("The upgradeTo method functions correctly", async function () {
		const {signers, cosmicGameProxy,} = await loadFixture(deployCosmic);
		const [owner,] = signers;

		const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
		let brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.waitForDeployment();

		await cosmicGameProxy.upgradeTo(await brokenCharity.getAddress());
		await expect(owner.sendTransaction({ to: await cosmicGameProxy.getAddress(), value: 1000000000000000000n})).to.be.revertedWith("Test deposit failed.");
	});
	it("The initialize method is disabled", async function () {
		const {signers, cosmicGameProxy,} = await loadFixture(deployCosmic);
		const [owner,] = signers;

		await expect(cosmicGameProxy.initialize(owner.address)).revertedWithCustomError(cosmicGameProxy, "InvalidInitialization");
	});
	// todo-1 We upgrade the implementation, not the proxy, right? Rephrase?
	it("Only the owner is permitted to upgrade the proxy", async function () {
		const {signers, cosmicGameProxy,} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2,] = signers;

		await expect(cosmicGameProxy.connect(addr2).upgradeTo(addr1.address)).revertedWithCustomError(cosmicGameProxy, "OwnableUnauthorizedAccount");
	});
});
