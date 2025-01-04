"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("Events", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("should emit the correct events in the CosmicSignatureNft contract", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;
		
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(bidder1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");
		const tx = await cosmicSignatureGameProxy.connect(bidder1).claimMainPrize();
		await tx.wait();
		let seed = await cosmicSignatureNft.getNftSeed(0);
		expect(tx).to.emit(cosmicSignatureNft, "NftMinted").withArgs(0n, bidder1.address, seed, 0n);
	});
	it("should emit the correct events in the CharityWallet contract", async function () {
		const {signers, cosmicSignatureGameProxy, charityWallet,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		// DonationReceived
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(bidder1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		let charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		let stakingTotalEthRewardAmount_ = await cosmicSignatureGameProxy.getStakingTotalEthRewardAmount();
		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(charityWallet, "DonationReceived")
			.withArgs(await cosmicSignatureGameProxy.getAddress(), charityEthDonationAmount_ + stakingTotalEthRewardAmount_);
		const balance = await hre.ethers.provider.getBalance(await charityWallet.getAddress());
		expect(balance).to.equal(charityEthDonationAmount_ + stakingTotalEthRewardAmount_);

		// CharityAddressChanged
		await expect(charityWallet.connect(owner).setCharityAddress(bidder3.address))
			.to.emit(charityWallet, "CharityAddressChanged")
			.withArgs(bidder3.address);

		// DonationSent
		await expect(charityWallet.connect(bidder2).send())
			.to.emit(charityWallet, "DonationSent")
			.withArgs(bidder3.address, balance);
	});
	it("should emit EthDonated on successful donation", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		const INITIAL_AMOUNT = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.connect(owner).donateEth({ value: INITIAL_AMOUNT });

		const donationAmount = hre.ethers.parseEther("1");
		let roundNum = 0;
		await expect(cosmicSignatureGameProxy.connect(donor).donateEth({ value: donationAmount }))
			.to.emit(cosmicSignatureGameProxy, "EthDonated")
			.withArgs(roundNum, donor.address, donationAmount);

		const contractBalance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount + INITIAL_AMOUNT);
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	it("should emit MainPrizeClaimed and update winner on successful prize claim", async function () {
		const {signers, cosmicSignatureGameProxy, prizesWallet, randomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		// await randeomWalkNFT.connect(donor).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(donor).setApprovalForAll(await prizesWallet.getAddress(), true);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(donor).bidAndDonateNft(/*params*/ (-1), "", await randomWalkNft.getAddress(), 0, { value: ethBidPrice_ });

		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(bidder1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "DonatedNftClaimDenied");

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		let mainEthPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();

		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			// todo-1 Assert 1 more param passed to the event.
			.withArgs(0, bidder1.address, mainEthPrizeAmountBeforeClaim_);

		// const roundMainPrizeWinnerAddress_ = await cosmicSignatureGameProxy.winners(0);
		const roundMainPrizeWinnerAddress_ = await prizesWallet.mainPrizeWinnerAddresses(0);
		expect(roundMainPrizeWinnerAddress_).to.equal(bidder1.address);

		const mainEthPrizeAmountAfterClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		const balance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		const mainEthPrizeExpectedAmount_ = balance * 25n / 100n;
		expect(mainEthPrizeAmountAfterClaim_).to.equal(mainEthPrizeExpectedAmount_);

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(1)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "InvalidDonatedNftIndex");

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0);
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "DonatedNftAlreadyClaimed");

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });
		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(bidder1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });

		// bidParams = { message: "hello", randomWalkNftId: 1 };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(donor).bidAndDonateNft(/*params*/ 1, "hello", await randomWalkNft.getAddress(), 2, { value: ethBidPrice_ });

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		mainEthPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(cosmicSignatureGameProxy.connect(donor).claimMainPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			// todo-1 Assert 1 more param passed to the event.
			.withArgs(1, donor.address, mainEthPrizeAmountBeforeClaim_);

		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(1);
		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await cosmicSignatureGameProxy.connect(donor).claimDonatedNft(1);
		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(2);

		expect(await cosmicSignatureGameProxy.roundNum()).to.equal(2);
	});

	it("BidEvent is correctly emitted", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		// let bidParams = { message: "simple text", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		expect(await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "simple text", { value: ethBidPrice_ }))
			.to.emit(cosmicSignatureGameProxy, "BidEvent")
			.withArgs(addr1.address, 0, ethBidPrice_, -1, -1, 2000090000, "simple text");
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2100000000]);
		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		// bidParams = { message: "random walk", randomWalkNftId: 0 };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		expect(await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ 0, "random walk", { value: ethBidPrice_ }))
			.to.emit(cosmicSignatureGameProxy, "BidEvent")
			.withArgs(addr1.address, 0, 1020100000000000, 0, -1, 2100003601, "random walk");
	});
	it("ETH + RandomWalk NFT bid price is 50% lower", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		// let bidParams = { message: "random walk", randomWalkNftId: 0 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		let rwalkBidPrice = ethBidPrice_ / 2n;
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ 0, "random walk", { value: ethBidPrice_ }))
			.to.emit(cosmicSignatureGameProxy, "BidEvent")
			.withArgs(addr1.address, 0, rwalkBidPrice, 0, -1, 2000090000, "random walk");
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	it("DonatedNftClaimedEvent is correctly emitted", async function () {
		const {signers, cosmicSignatureGameProxy, prizesWallet, randomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(bidder1).mint({ value: mintPrice });
		// await randomWalkNft.connect(bidder1).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(bidder1).setApprovalForAll(await prizesWallet.getAddress(), true);
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(bidder1).bidAndDonateNft(/*params*/ (-1), "", await randomWalkNft.getAddress(), 0, { value: ethBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize());

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0))
			.to.emit(cosmicSignatureGameProxy, "DonatedNftClaimedEvent")
			.withArgs(0, 0, bidder1.address, await randomWalkNft.getAddress(), 0);
	});

	it("It's not permitted to bid before activation", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		const timestampBefore = latestBlock_.timestamp;

		await cosmicSignatureGameProxy.connect(owner).setActivationTime(timestampBefore + 4);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(bidder1).bid(/*params*/ (-1), "", { value: ethBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(
			bidder2.sendTransaction({
				to: await cosmicSignatureGameProxy.getAddress(),
				value: ethBidPrice_,
			}),
		).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");

		// await hre.ethers.provider.send("evm_increaseTime", [100]);
		// await hre.ethers.provider.send("evm_mine");

		// ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		expect((await cosmicSignatureGameProxy.getBidPrice()) === ethBidPrice_);
		await cosmicSignatureGameProxy.connect(bidder1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		expect((await cosmicSignatureGameProxy.getBidPrice()) > ethBidPrice_);
	});
	it("should be possible to bid by sending to the contract", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(bidder1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		expect((await cosmicSignatureGameProxy.getBidPrice()) > ethBidPrice_);

		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await bidder2.sendTransaction({
			to: await cosmicSignatureGameProxy.getAddress(),
			value: ethBidPrice_,
		});
		expect((await cosmicSignatureGameProxy.getBidPrice()) > ethBidPrice_);
	});
	// todo-1 Move this to "SystemManagement.js"?
	it("Admin events should work", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		const activationTime_ = 123_456_789_012n;
		await expect(cosmicSignatureGameProxy.connect(owner).setActivationTime(activationTime_))
			.to.emit(cosmicSignatureGameProxy, "ActivationTimeChanged")
			.withArgs(activationTime_);
		expect(await cosmicSignatureGameProxy.activationTime()).to.equal(activationTime_);

		// todo-1 setDelayDurationBeforeNextRound

		// todo-1 setMarketingWalletCstContributionAmount

		// todo-1 setMaxMessageLength

		let testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCosmicSignatureToken(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CosmicSignatureTokenAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.token()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCosmicSignatureNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CosmicSignatureNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.nft()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setRandomWalkNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "RandomWalkNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		// todo-1 setStakingWalletCosmicSignatureNft

		// todo-1 setStakingWalletRandomWalkNft

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setPrizesWallet(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "PrizesWalletAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.prizesWallet()).to.equal(testAcct_.address);

		// todo-1 setMarketingWallet

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCharityAddress(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CharityAddressChanged")
			.withArgs(testAcct_.address);
		expect((await cosmicSignatureGameProxy.charityAddress()).toString()).to.equal(testAcct_.address.toString());

		const mainPrizeTimeIncrementInMicroSeconds_ = 1003n;
		await expect(cosmicSignatureGameProxy.connect(owner).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds_))
			.to.emit(cosmicSignatureGameProxy, "MainPrizeTimeIncrementInMicroSecondsChanged")
			.withArgs(mainPrizeTimeIncrementInMicroSeconds_);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).to.equal(mainPrizeTimeIncrementInMicroSeconds_);

		const mainPrizeTimeIncrementIncreaseDivisor_ = 1001n;
		await expect(cosmicSignatureGameProxy.connect(owner).setMainPrizeTimeIncrementIncreaseDivisor(mainPrizeTimeIncrementIncreaseDivisor_))
			.to.emit(cosmicSignatureGameProxy, "MainPrizeTimeIncrementIncreaseDivisorChanged")
			.withArgs(mainPrizeTimeIncrementIncreaseDivisor_);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).to.equal(mainPrizeTimeIncrementIncreaseDivisor_);

		const initialSecondsUntilPrize_ = 1004n;
		await expect(cosmicSignatureGameProxy.connect(owner).setInitialSecondsUntilPrize(initialSecondsUntilPrize_))
			.to.emit(cosmicSignatureGameProxy, "InitialSecondsUntilPrizeChanged")
			.withArgs(initialSecondsUntilPrize_);
		expect((await cosmicSignatureGameProxy.initialSecondsUntilPrize()).toString()).to.equal(initialSecondsUntilPrize_.toString());

		const roundInitialEthBidPriceMultiplier_ = 1005n;
		await expect(cosmicSignatureGameProxy.connect(owner).setRoundInitialEthBidPriceMultiplier(roundInitialEthBidPriceMultiplier_))
			.to.emit(cosmicSignatureGameProxy, "RoundInitialEthBidPriceMultiplierChanged")
			.withArgs(roundInitialEthBidPriceMultiplier_);
		expect((await cosmicSignatureGameProxy.roundInitialEthBidPriceMultiplier()).toString()).to.equal(roundInitialEthBidPriceMultiplier_.toString());

		const roundInitialEthBidPriceDivisor_ = 1006n;
		await expect(cosmicSignatureGameProxy.connect(owner).setRoundInitialEthBidPriceDivisor(roundInitialEthBidPriceDivisor_))
			.to.emit(cosmicSignatureGameProxy, "RoundInitialEthBidPriceDivisorChanged")
			.withArgs(roundInitialEthBidPriceDivisor_);
		expect((await cosmicSignatureGameProxy.roundInitialEthBidPriceDivisor()).toString()).to.equal(roundInitialEthBidPriceDivisor_.toString());

		const priceIncrease_ = 1002n;
		await expect(cosmicSignatureGameProxy.connect(owner).setPriceIncrease(priceIncrease_))
			.to.emit(cosmicSignatureGameProxy, "PriceIncreaseChanged")
			.withArgs(priceIncrease_);
		expect((await cosmicSignatureGameProxy.priceIncrease()).toString()).to.equal(priceIncrease_.toString());

		// todo-1 setCstDutchAuctionDurationDivisor

		// todo-1 setStartingBidPriceCSTMinLimit

		// todo-1 setTokenReward

		let percentage_ = 11n;
		await expect(cosmicSignatureGameProxy.connect(owner).setMainEthPrizeAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "MainEthPrizeAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).to.equal(percentage_);
		
		percentage_ = 12n;
		await expect(cosmicSignatureGameProxy.connect(owner).setChronoWarriorEthPrizeAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "ChronoWarriorEthPrizeAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).to.equal(percentage_);

		percentage_ = 13n;
		await expect(cosmicSignatureGameProxy.connect(owner).setRaffleTotalEthPrizeAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "RaffleTotalEthPrizeAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.raffleTotalEthPrizeAmountPercentage()).to.equal(percentage_);

		// todo-1 percentage_ = 14n;
		// todo-1 setStakingTotalEthRewardAmountPercentage(percentage_)

		percentage_ = 15n;
		await expect(cosmicSignatureGameProxy.connect(owner).setCharityEthDonationAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "CharityEthDonationAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).to.equal(percentage_);

		const timeoutDurationToClaimMainPrize_ = 1003n;
		await expect(cosmicSignatureGameProxy.connect(owner).setTimeoutDurationToClaimMainPrize(timeoutDurationToClaimMainPrize_))
			.to.emit(cosmicSignatureGameProxy, "TimeoutDurationToClaimMainPrizeChanged")
			.withArgs(timeoutDurationToClaimMainPrize_);
		expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).to.equal(timeoutDurationToClaimMainPrize_);

		// todo-1 setCstRewardAmountMultiplier

		let numPrizes_ = 11n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleEthPrizesForBidders(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleEthPrizesForBiddersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).toString()).to.equal(numPrizes_.toString());

		numPrizes_ = 12n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleCosmicSignatureNftsForBidders(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForBiddersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).toString()).to.equal(numPrizes_.toString());

		numPrizes_ = 14n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).toString()).to.equal(numPrizes_.toString());
	});
});
