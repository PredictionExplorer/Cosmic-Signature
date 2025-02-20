"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt32 } = require("../src/Helpers.js");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("Bidding", function () {
	it("Should be possible to bid", async function () {
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, prizesWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;

		// [ToDo-202411202-1]
		// This is a quick hack.
		// To be revisited.
		// [/ToDo-202411202-1]
		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(0n);

		const donationAmount_ = 10n * 10n ** 18n;
		await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });
		expect(await cosmicSignatureGameProxy.getMainEthPrizeAmount()).to.equal((donationAmount_ * 25n) / 100n);
		// todo-1 We now also have chrono-warrior.
		// let echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		let echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(hre.ethers.ZeroAddress);
		await expect(cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: 1 })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ - 1n })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");

		const initialDurationUntilMainPrize_ = await cosmicSignatureGameProxy.getInitialDurationUntilMainPrize();
		expect(initialDurationUntilMainPrize_).to.equal(24n * 60n * 60n + 1n);
		const mainPrizeTimeIncrement_ = await cosmicSignatureGameProxy.getMainPrizeTimeIncrement();
		expect(mainPrizeTimeIncrement_).to.equal(60n * 60n);
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).lessThan(-1e9);

		// let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		// console.log(latestBlock_.baseFeePerGas);

		// Testing that if we send too much, we will get a refund back.
		// Keeping in mind that a too small refund won't be transferred back to the bidder.
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ + BigInt(10 ** 15), });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(initialDurationUntilMainPrize_);
		const contractBalance = await hre.ethers.provider.getBalance(cosmicSignatureGameProxyAddr);
		expect(contractBalance).to.equal(donationAmount_ + nextEthBidPrice_);

		let roundNum_ = await cosmicSignatureGameProxy.roundNum();
		let spent = await cosmicSignatureGameProxy.getBidderTotalSpentAmounts(roundNum_, signer1.address);
		expect(spent[0]).to.equal(nextEthBidPrice_);

		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(initialDurationUntilMainPrize_ - 100n);

		// todo-1 We now also have chrono-warrior.
		// echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(signer1.address);

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(initialDurationUntilMainPrize_ - 100n + mainPrizeTimeIncrement_ - 1n);

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(initialDurationUntilMainPrize_ - 100n + mainPrizeTimeIncrement_ - 1n + mainPrizeTimeIncrement_ - 1n);

		await expect(cosmicSignatureGameProxy.connect(signer1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeEarlyClaim");

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		await expect(cosmicSignatureGameProxy.connect(signer2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 100]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(signer2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		await hre.ethers.provider.send("evm_increaseTime", [100 - 1]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(signer2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		await expect(cosmicSignatureGameProxy.connect(signer1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeClaimDenied");

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		await hre.ethers.provider.send("evm_increaseTime", [10]);
		await hre.ethers.provider.send("evm_mine");

		// todo-1 We now also have chrono-warrior.
		// echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(signer2.address);

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		// let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// let charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		// let raffleTotalEthPrizeAmountForBidders_ = await cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmountForBidders();
		await cosmicSignatureGameProxy.connect(signer3).claimMainPrize();
		let mainEthPrizeAmount2_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		let balance = await hre.ethers.provider.getBalance(cosmicSignatureGameProxyAddr);
		let mainEthPrizeExpectedAmount_ = (balance * 25n) / 100n;
		expect(mainEthPrizeAmount2_).to.equal(mainEthPrizeExpectedAmount_);
		// let w = await cosmicSignatureGameProxy.tryGetMainPrizeWinnerAddress(0);
		let w = await prizesWallet.mainPrizeBeneficiaryAddresses(0);
		expect(w).to.equal(signer3.address);

		await expect(cosmicSignatureGameProxy.connect(signer2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");

		// after the prize has been claimed, let's bid again!
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		await expect(cosmicSignatureGameProxy.connect(signer1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeEarlyClaim");

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		// await hre.ethers.provider.send("evm_mine");

		// mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		await expect(cosmicSignatureGameProxy.connect(signer1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();
		mainEthPrizeAmount2_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		balance = await hre.ethers.provider.getBalance(cosmicSignatureGameProxyAddr);
		mainEthPrizeExpectedAmount_ = (balance * 25n) / 100n;
		expect(mainEthPrizeAmount2_).to.equal(mainEthPrizeExpectedAmount_);

		// After the main prize claim timeout expires, anyone should be able to claim the prize.
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		roundNum_ = await cosmicSignatureGameProxy.roundNum();
		expect(await cosmicSignatureGameProxy.getTotalNumBids(roundNum_)).equal(1);
		expect(await cosmicSignatureGameProxy.getBidderAddressAt(roundNum_, 0)).equal(signer1.address);
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");

		await expect(cosmicSignatureGameProxy.connect(signer2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "MainPrizeClaimDenied");

		// todo-1 Increase time by the exactly remaining time minus 1 and then claim twice. The 1st claim will be reverted.
		await hre.ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		await cosmicSignatureGameProxy.connect(signer2).claimMainPrize();
		expect(await cosmicSignatureGameProxy.lastBidderAddress()).to.equal(hre.ethers.ZeroAddress);
	});

	it("Should be possible to bid with RandomWalk NFT", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer1).mint({ value: tokenPrice }); // nftId=0

		// switch to another account and attempt to use nftId=0 which we don't own
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(2n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEth(0, "hello", { value: nextEthPlusRandomWalkNftBidPrice_ * 2n })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "CallerIsNotNftOwner");
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth(0, "hello", { value: nextEthPlusRandomWalkNftBidPrice_ });
		tokenPrice = await randomWalkNft.getMintPrice();
		let tx = await randomWalkNft.connect(signer0).mint({ value: tokenPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNft.interface.parseLog(log);
		let token_id = parsed_log.args[0];
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEth(token_id, "", { value: 0 })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(signer0).bidWithEth(token_id, "", { value: nextEthPlusRandomWalkNftBidPrice_ });
		expect(await cosmicSignatureGameProxy.usedRandomWalkNfts(token_id)).to.equal(1);

		// try to bid again using the same nftId
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEth(token_id, "", { value: nextEthPlusRandomWalkNftBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "UsedRandomWalkNft");
	});

	it("Shouldn't be possible to bid if bidder doesn't accept refunds on oversized bidWithEth calls", async function () {
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract.waitForDeployment();

		let bidAmount = hre.ethers.parseEther("10");
		await expect(bidderContract.connect(signer0).doFailedBidWithEth({ value: bidAmount })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "FundTransferFailed");
	});

	it("Shouldn't be possible to bid using very long message", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		// let donationAmount_ = hre.ethers.parseEther("10");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });
		const longMsg = "a".repeat(280 + 1);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), longMsg, { value: nextEthBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "TooLongBidMessage");
	});

	it("getCstDutchAuctionDurations() method works", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		let nextCstBidPrice_ = await cosmicSignatureGameProxy.getNextCstBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithCst(nextCstBidPrice_, "cst bid");

		const cstDutchAuctionDurations_ = await cosmicSignatureGameProxy.getCstDutchAuctionDurations();
		// const cstDutchAuctionDuration_ = cstDutchAuctionDurations_[0];
		const cstDutchAuctionElapsedDuration_ = cstDutchAuctionDurations_[1];
		expect(cstDutchAuctionElapsedDuration_).to.equal(0n);
	});

	it("There is an execution path for all bidders being RandomWalk NFT bidders", async function () {
		// todo-1 Move this function to a separate file and use it everywhere.
		async function mint_rwalk(a) {
			const tokenPrice = await randomWalkNft.getMintPrice();
			let tx = await randomWalkNft.connect(a).mint({ value: tokenPrice });
			let receipt = await tx.wait();
			let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNft.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}

		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3, signer4, signer5,] = signers;

		let token_id = await mint_rwalk(signer1);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth(token_id, "bidWithRWalk", { value: nextEthPlusRandomWalkNftBidPrice_ });
		token_id = await mint_rwalk(signer2);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth(token_id, "bidWithRWalk", { value: nextEthPlusRandomWalkNftBidPrice_ });
		token_id = await mint_rwalk(signer3);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth(token_id, "bidWithRWalk", { value: nextEthPlusRandomWalkNftBidPrice_ });
		token_id = await mint_rwalk(signer4);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(signer4).bidWithEth(token_id, "bidWithRWalk", { value: nextEthPlusRandomWalkNftBidPrice_ });
		token_id = await mint_rwalk(signer5);
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(signer5).bidWithEth(token_id, "bidWithRWalk", { value: nextEthPlusRandomWalkNftBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		// todo-1 Take a closer look at this. What if it reverts with a different error?
		// todo-1 This is really not supposed to fail. It appears that this tests a no longer existing bug.
		await expect(cosmicSignatureGameProxy.connect(signer5).claimMainPrize()).not.revertedWith("panic code 0x12"); // divide by zero
		// todo-1 Maybe check that now it will revert with "NoLastBidder".
		// todo-1 Actually it will probably revert because the round is not active yet.
	});

	it("After bidWithEth, bid-related counters have correct values", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;
		
		// let donationAmount_ = hre.ethers.parseEther("10");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer0).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer0).mint({ value: tokenPrice }); // nftId=0

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(signer0).bidWithEth(0n, "rwalk bid", { value: nextEthPlusRandomWalkNftBidPrice_ });

		// let lastBidType = await cosmicSignatureGameProxy.lastBidType();
		// expect(lastBidType).to.equal(1);

		let [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_] = await cosmicSignatureGameProxy.getCstDutchAuctionDurations();
		await hre.ethers.provider.send("evm_increaseTime", [Number(cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_) - 1]); // make CST price drop to almost 0
		// await hre.ethers.provider.send("evm_mine");

		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithCst(0n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		await cosmicSignatureGameProxy.connect(signer0).bidWithCst(0n, "cst bid");

		// lastBidType = await cosmicSignatureGameProxy.lastBidType();
		// expect(lastBidType).to.equal(2);
	});

	it("On ETH bid, we refund the correct amount when msg.value is greater than required", async function () {
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		// let donationAmount_ = hre.ethers.parseEther("1");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract.waitForDeployment();
		const bidderContractAddr = await bidderContract.getAddress();

		let amountSent = hre.ethers.parseEther("2");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract.connect(signer0).doBidWithEth2({ value: amountSent });
		let bidderContractBalanceAmountAfter = await hre.ethers.provider.getBalance(bidderContractAddr);
		let bidderContractExpectedBalanceAmountAfter = amountSent - nextEthBidPrice_;
		expect(bidderContractBalanceAmountAfter).to.equal(bidderContractExpectedBalanceAmountAfter);
	});

	it("On ETH + RandomWalk NFT bid, we refund the correct amount when msg.value is greater than required", async function () {
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, randomWalkNft,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		// let donationAmount_ = hre.ethers.parseEther("1");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract.waitForDeployment();
		const bidderContractAddr = await bidderContract.getAddress();

		let amountSent = hre.ethers.parseUnits("1", 15);

		await randomWalkNft.connect(signer0).setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.connect(signer0).setApprovalForAll(bidderContractAddr, true);

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer0).mint({ value: tokenPrice }); // nftId=0
		const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract.connect(signer0).doBidWithEthRWalk2(0, { value: amountSent });
		let bidderContractBalanceAmountAfter = await hre.ethers.provider.getBalance(bidderContractAddr);
		let discountedBidPrice = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		expect(discountedBidPrice).to.equal((nextEthBidPrice_ + 1n) / 2n);
		let bidderContractExpectedBalanceAmountAfter = amountSent - discountedBidPrice;
		expect(bidderContractBalanceAmountAfter).to.equal(bidderContractExpectedBalanceAmountAfter);
	});

	it("Bidding a lot & staking a lot works correctly", async function () {
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, stakingWalletCosmicSignatureNft, stakingWalletCosmicSignatureNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3, signer4, signer5,] = signers;

		// ToDo-202411202-1 applies.
		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(0n);

		// let donationAmount_ = hre.ethers.parseEther("100");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		let durationUntilMainPrize_;
		let nextEthBidPrice_;
		for ( let counter_ = 0; counter_ < 30; ++ counter_ ) {
			await hre.ethers.provider.send("evm_increaseTime", [counter_ * 60 * 60]);
			await hre.ethers.provider.send("evm_mine");
			nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
			nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
			nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });
			nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await cosmicSignatureGameProxy.connect(signer4).bidWithEth((-1), "", { value: nextEthBidPrice_ });
			durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
			// await hre.ethers.provider.send("evm_mine");
			await cosmicSignatureGameProxy.connect(signer4).claimMainPrize();
		}
		let tx, receipt, log, parsed_log;
		let topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		let ts = await cosmicSignatureNft.totalSupply();
		// let rn = await cosmicSignatureGameProxy.roundNum();
		const tokensByStaker = {};
		const stakeActionIds_ = [];
		for (let i = 0; i < Number(ts); i++) {
			let ownr = await cosmicSignatureNft.ownerOf(i);
			let owner_signer = await hre.ethers.getSigner(ownr);
			let userTokens = tokensByStaker[ownr];
			if (userTokens === undefined) {
				await cosmicSignatureNft.connect(owner_signer).setApprovalForAll(stakingWalletCosmicSignatureNftAddr, true);
				userTokens = [];
			}
			userTokens.push(i);
			tokensByStaker[ownr] = userTokens;
			tx = await stakingWalletCosmicSignatureNft.connect(owner_signer).stake(i);
			receipt = await tx.wait();
			log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			parsed_log = stakingWalletCosmicSignatureNft.interface.parseLog(log);
			// console.log(log.args.stakeActionId);
			stakeActionIds_.push(log.args.stakeActionId);
		}
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer4).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();

		// We need another time increase to claim as `signer5` (it has no bids, won't get raffle NFTs).
		const durationUntilTimeoutTimeToClaimMainPrize_ = durationUntilMainPrize_ + await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();

		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilTimeoutTimeToClaimMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let totSupBefore = await cosmicSignatureNft.totalSupply();
		tx = await cosmicSignatureGameProxy.connect(signer5).claimMainPrize();
		receipt = await tx.wait();
		topic_sig = cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerCosmicSignatureNftAwarded").topicHash;
		let raffle_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);

		// all Raffle NFTs must have zero address because they are not staked, verify it
		for (let i = 0; i < raffle_logs.length; i++) {
			let rlog = cosmicSignatureGameProxy.interface.parseLog(raffle_logs[i]);
			// let winnerAddress_ = rlog.args.winnerAddress;
			// let ownr = await cosmicSignatureNft.ownerOf(rlog.args.prizeCosmicSignatureNftId);
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(rlog.args.prizeCosmicSignatureNftId);
			// expect(stakerAddr).to.equal("0x0000000000000000000000000000000000000000");
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.wasNftUsed(rlog.args.prizeCosmicSignatureNftId);
			// expect(nftWasUsed_).to.equal(false);
			expect(nftWasUsed_).to.equal(0n);
		}

		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignatureNft.totalSupply();
		for (let i = 0; i < Number(ts); i++) {
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(i);
			// if (stakerAddr == "0x0000000000000000000000000000000000000000") {
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.wasNftUsed(i);
			// if ( ! nftWasUsed_ ) {
			if (nftWasUsed_ == 0n) {
				let ownr = await cosmicSignatureNft.ownerOf(i);
				let userTokens = tokensByStaker[ownr];
				if (userTokens === undefined) {
					userTokens = [];
				}
				userTokens.push(i);
				tokensByStaker[ownr] = userTokens;
				if (i >= Number(totSupBefore)) {
					// this is new NFT, it is not staked yet
					continue;
				}
			}
			// let isStaked = await stakingWalletCosmicSignatureNft.isTokenStaked(i);
			// expect(isStaked).to.equal(true);
			// let lastActionId = await stakingWalletCosmicSignatureNft.lastActionIdByTokenId(i);
			let lastActionId = stakeActionIds_[i];
			// todo-1 Why do we convert this to `Number`? Review all conversions like this.
			lastActionId = Number(lastActionId);
			// if (lastActionId < 0) {
			if (lastActionId <= 0) {
				throw "Invalid action id " + lastActionId;
			}
			// let stakeActionRecord = await stakingWalletCosmicSignatureNft.stakeActions(lastActionId);
			// expect(stakeActionRecord.nftOwnerAddress).to.equal(stakerAddr);
		}

		// todo-1 This is probably no longer needed. At least comment.
		await hre.ethers.provider.send("evm_increaseTime", [60 * 24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		let num_actions;
		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		for (let i = 0; i < Number(num_actions); i++) {
			// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
			let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwnerAddress;
			let owner_signer = await hre.ethers.getSigner(ownr);
			await hre.ethers.provider.send("evm_increaseTime", [100]);
			// await hre.ethers.provider.send("evm_mine");
			// await stakingWalletCosmicSignatureNft.connect(owner_signer).unstake(i);
			await stakingWalletCosmicSignatureNft.connect(owner_signer).unstake(stakeActionIds_[i], 1000);
		}

		// at this point, all NFTs were unstaked

		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(num_actions).to.equal(0);
		// for (let i = 0; i < Number(num_actions); i++) {
		// 	// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
		// 	let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
		// 	action_rec = action_rec.toObject();
		// 	let ownr = action_rec.nftOwnerAddress;
		// 	let num_deposits = await stakingWalletCosmicSignatureNft.numEthDeposits();
		// 	let owner_signer = await hre.ethers.getSigner(ownr);
		// 	for (let j = 0; j < Number(num_deposits); j++) {
		// 		let deposit_rec = await stakingWalletCosmicSignatureNft.ethDeposits(j);
		// 		// await stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([i], [j]);
		// 		await stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([stakeActionIds_[i]], [j]);
		// 	}
		// }

		// // Comment-202409209 applies.
		// const contractBalance = await hre.ethers.provider.getBalance(stakingWalletCosmicSignatureNftAddr);
		// const m = await stakingWalletCosmicSignatureNft.modulo();
		// expect(m).to.equal(contractBalance);

		// check that every staker has its own NFTs back
		for (let user in tokensByStaker) {
			let userTokens = tokensByStaker[user];
			for (let i = 0; i < userTokens.length; i++) {
				let o = await cosmicSignatureNft.ownerOf(userTokens[i]);
				expect(o).to.equal(user);
			}
		}
	});

	it("Bidding with CST works", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;

		// // Comment-202501192 applies.
		// await hre.ethers.provider.send("evm_mine");

		const delayDurationBeforeRoundActivation_ = await cosmicSignatureGameProxy.delayDurationBeforeRoundActivation();

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal(1n);
		await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(0n);
		await hre.ethers.provider.send("evm_increaseTime", [Number(delayDurationBeforeRoundActivation_) - 1]);
		await hre.ethers.provider.send("evm_mine");
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		// Making CST bid price cheaper.
		await hre.ethers.provider.send("evm_increaseTime", [20000]);
		await hre.ethers.provider.send("evm_mine");

		// let cstDutchAuctionBeginningBidPrice_ = await cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice();
		let cstDutchAuctionBeginningBidPrice_ = await cosmicSignatureGameProxy.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		expect(cstDutchAuctionBeginningBidPrice_).to.equal(200n * (10n ** 18n));
		let cstDutchAuctionBeginningTimeStamp_ = await cosmicSignatureGameProxy.cstDutchAuctionBeginningTimeStamp();
		expect(cstDutchAuctionBeginningTimeStamp_).to.equal(await cosmicSignatureGameProxy.roundActivationTime());
		let [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_,] = await cosmicSignatureGameProxy.getCstDutchAuctionDurations();
		expect(cstDutchAuctionElapsedDuration_).to.equal(20000n);
		++ cstDutchAuctionElapsedDuration_;
		let cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_;
		let nextCstBidExpectedPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
		let nextCstBidPrice_ = await cosmicSignatureGameProxy.getNextCstBidPrice(1n);
		expect(nextCstBidPrice_).to.equal(nextCstBidExpectedPrice_);
		await cosmicSignatureGameProxy.connect(signer1).bidWithCst(nextCstBidPrice_, "cst bid");
		cstDutchAuctionBeginningBidPrice_ = await cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice();
		expect(cstDutchAuctionBeginningBidPrice_).to.equal(nextCstBidPrice_ * 2n);

		cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - 1n;
		nextCstBidExpectedPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
		let tx = await cosmicSignatureGameProxy.connect(signer1).bidWithCst(nextCstBidExpectedPrice_ * 10n, "cst bid");
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("BidPlaced").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		expect(args.lastBidderAddress).to.equal(signer1.address);
		expect(args.ethBidPrice).to.equal(-1n);
		expect(args.cstBidPrice).to.equal(nextCstBidExpectedPrice_);
		expect(args.message).to.equal("cst bid");
		cstDutchAuctionBeginningBidPrice_ = await cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice();
		expect(cstDutchAuctionBeginningBidPrice_).to.equal(nextCstBidExpectedPrice_ * 2n);
	});

	// todo-1 This method no longer exists. Use `getBidderAddressAt` instead. But parts of this test could still be relevant.
	// it("Function bidderAddress() works as expected", async function () {
	// 	const {ownerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0, signer1, signer2, signer3,] = signers;
	//
	// 	// ToDo-202411202-1 applies.
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(0n);
	//
	// 	let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	//
	// 	let bAddr = await cosmicSignatureGameProxy.bidderAddress(0, 0);
	// 	expect(bAddr).to.equal(signer3.address);
	//
	// 	bAddr = await cosmicSignatureGameProxy.bidderAddress(0, 1); 
	// 	expect(bAddr).to.equal(signer2.address);
	//
	// 	bAddr = await cosmicSignatureGameProxy.bidderAddress(0, 2); 
	// 	expect(bAddr).to.equal(signer1.address);
	//
	// 	bAddr = await expect(cosmicSignatureGameProxy.bidderAddress(1, 2)).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameProxy,
	// 		"InvalidBidderQueryRoundNum"
	// 	);
	// 	bAddr = await expect(cosmicSignatureGameProxy.bidderAddress(0, 3)).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameProxy,
	// 		"InvalidBidderQueryOffset"
	// 	);
	// 	let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
	// 	await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await cosmicSignatureGameProxy.connect(signer3).claimMainPrize();
	// 	await expect(cosmicSignatureGameProxy.bidderAddress(1, 1)).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameProxy,
	// 		"BidderQueryNoBidsYet"
	// 	);
	//
	// 	// lets check roundNum > 0 now
	//
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	//
	// 	bAddr = await cosmicSignatureGameProxy.bidderAddress(1, 0);
	// 	expect(bAddr).to.equal(signer3.address);
	// 	bAddr = await cosmicSignatureGameProxy.bidderAddress(1, 1);
	// 	expect(bAddr).to.equal(signer2.address);
	// 	bAddr = await cosmicSignatureGameProxy.bidderAddress(1, 2);
	// 	expect(bAddr).to.equal(signer1.address);
	// });
	// it("Bid statistics are generating correct values and StellarSpender addr is assigned correctly", async function () {
	// 	const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0, signer1,] = signers;
	//
	// 	let spent, spentEth, spentCst, tx, topic_sig, receipt, log, evt;
	// 	let cstDutchAuctionDurations_ = await cosmicSignatureGameProxy.getCstDutchAuctionDurations();
	// 	let cstDutchAuctionDuration_ = cstDutchAuctionDurations_[0];
	// 	let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	// 	spent = await cosmicSignatureGameProxy.getBidderTotalSpentAmounts(/* todo-9 roundNum_, */ signer1.address);
	// 	spentEth = spent[0];
	// 	expect(spentEth).to.equal(nextEthBidPrice_);
	// 	await hre.ethers.provider.send("evm_increaseTime", [Number(cstDutchAuctionDuration_) - 600]); // lower price to pay in CST
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	tx = await cosmicSignatureGameProxy.connect(signer1).bidWithCst(10n ** 30n, "");
	// 	topic_sig = cosmicSignatureGameProxy.interface.getEvent("BidPlaced").topicHash;
	// 	receipt = await tx.wait();
	// 	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 	evt = log.args.toObject();
	// 	let cstBidPrice = evt.cstBidPrice;
	// 	spent = await cosmicSignatureGameProxy.getBidderTotalSpentAmounts(/* todo-9 roundNum_, */ signer1.address);
	// 	spentCst = spent[1];
	// 	expect(spentCst).to.equal(cstBidPrice);
	//
	// 	// check that CST and ETH are accumulated in statistics
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
	// 	let totalEthSpent = nextEthBidPrice_ + spentEth;
	// 	spent = await cosmicSignatureGameProxy.getBidderTotalSpentAmounts(/* todo-9 roundNum_, */ signer1.address);
	// 	spentEth = spent[0];
	// 	expect(spentEth).to.equal(totalEthSpent);
	//
	// 	tx = await cosmicSignatureGameProxy.connect(signer1).bidWithCst(10n ** 30n, "");
	// 	receipt = await tx.wait();
	// 	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 	evt = log.args.toObject();
	// 	cstBidPrice = evt.cstBidPrice;
	// 	let totalSpentCst_ = cstBidPrice + spentCst;
	// 	spent = await cosmicSignatureGameProxy.getBidderTotalSpentAmounts(/* todo-9 roundNum_, */ signer1.address);
	// 	spentCst = spent[1];
	// 	expect(spentCst).to.equal(totalSpentCst_);
	//
	// 	let maxBidderAddr = await cosmicSignatureGameProxy.stellarSpender();
	// 	let maxCstBidderAmount_ = await cosmicSignatureGameProxy.stellarSpenderTotalSpentCst();
	//
	// 	spent = await cosmicSignatureGameProxy.getBidderTotalSpentAmounts(/* todo-9 roundNum_, */ signer1.address);
	// 	expect(maxBidderAddr).to.equal(signer1.address);
	// });
	it("It is not possible to bid with CST if balance is not enough", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth(-1n, "eth bid", {value: nextEthBidPrice_,});
		// await expect(cosmicSignatureGameProxy.connect(signer1).bidWithCst(10n ** 30n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientCSTBalance");
		await expect(cosmicSignatureGameProxy.connect(signer1).bidWithCst(10n ** 30n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureToken, "ERC20InsufficientBalance");
	});

	it("The getBidderAddressAt method behaves correctly", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;
		
		// let donationAmount_ = hre.ethers.parseEther("10");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", {value: nextEthBidPrice_,});
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", {value: nextEthBidPrice_,});

		expect(await cosmicSignatureGameProxy.getBidderAddressAt(0, 0)).to.equal(signer1.address);
		expect(await cosmicSignatureGameProxy.getBidderAddressAt(0, 1)).to.equal(signer2.address);

		// // This no longer reverts.
		// await expect(cosmicSignatureGameProxy.getBidderAddressAtPosition(0, 2)).to.be.revertedWith("Position out of bounds");
	});

	it("Shouldn't be possible to bid if minting of Cosmic Signature Tokens fails", async function () {
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		const brokenCosmicSignatureTokenFactory = await hre.ethers.getContractFactory("BrokenCosmicSignatureToken2", deployerAcct);
		const brokenCosmicSignatureToken = await brokenCosmicSignatureTokenFactory.deploy(0);
		await brokenCosmicSignatureToken.waitForDeployment();
		const brokenCosmicSignatureTokenAddr = await brokenCosmicSignatureToken.getAddress();
		// await cosmicSignatureGameProxy.setCosmicSignatureTokenRaw(brokenCosmicSignatureTokenAddr);
		await cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureToken(brokenCosmicSignatureTokenAddr);

		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ })).to.be.revertedWith("Test mint() failed.");
	});

	it("Shouldn't be possible to bid if minting of Cosmic Signature Tokens fails (second mint)", async function () {
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		const numTokenMintsPerBid_ = 1;
		const brokenCosmicSignatureTokenFactory = await hre.ethers.getContractFactory("BrokenCosmicSignatureToken2", deployerAcct);
		const brokenCosmicSignatureToken = await brokenCosmicSignatureTokenFactory.deploy(numTokenMintsPerBid_);
		await brokenCosmicSignatureToken.waitForDeployment();
		const brokenCosmicSignatureTokenAddr = await brokenCosmicSignatureToken.getAddress();
		// await cosmicSignatureGameProxy.setCosmicSignatureTokenRaw(brokenCosmicSignatureTokenAddr);
		await cosmicSignatureGameProxy.connect(ownerAcct).setCosmicSignatureToken(brokenCosmicSignatureTokenAddr);

		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ })).to.be.revertedWith("Test mint() failed.");
	});

	// This is a stress test that executes multiple transactions per block.
	//
	// todo-1 It would be nice to validate that the behavior is correct.
	//
	// todo-1 Add `claimMainPrize` calls.
	//
	// todo-1 Arbitrum mines 4 blocks per second with equal timestamps. Try to test that.
	// todo-1 There is the `allowBlocksWithSameTimestamp` parameter, but setting it would make all blocks having the same timestamp,
	// todo-1 which would break all tests and other scripts. It appears to be impossible to change it temporarily at runtime.
	// 
	// todo-1 Develop a separate test and/or refactor this one to test `bidWithEth` reentrancy. They can bid by reentering.
	// todo-1 But see ToDo-202502186-0.
	it("Long-term aggressive bidding doesn't produce irregularities", async function () {
		if (SKIP_LONG_TESTS) return;

		const {signers, cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployContractsForUnitTesting);
		
		// Comment-202501192 applies.
		await hre.ethers.provider.send("evm_mine");

		// {
		// 	let latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	// await hre.ethers.provider.send("evm_increaseTime", [0]);
		// 	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [latestBlockTimeStamp]);
		// 	await hre.ethers.provider.send("evm_mine");
		// 	latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	// await hre.ethers.provider.send("evm_mine");
		// 	latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	console.log();
		// }

		const transactions = [];
		let randomNumber;

		const mineBlockIfNeeded = async (force) => {
			let timeIncrease = force ? 1 : ((randomNumber & 0xFF) - 0xB0);
			if (timeIncrease > 0) {
				if (timeIncrease >= 10) {
					timeIncrease *= 40;
				}
				if (timeIncrease > 1) {
					await hre.ethers.provider.send("evm_increaseTime", [timeIncrease]);
				}

				// todo-1 Bug. Even if `timeIncrease` is zero the next block timestamp will still be incremented.
				// todo-1 Sending "evm_increaseTime" of zero won't help.
				await hre.ethers.provider.send("evm_mine");

				let errorDetails;
				for (const transaction of transactions) {
					try {
						// console.log(transaction);

						// // todo-1 This can throw an error, but the error doesn't appear to contain usable info on what caused the error.
						// await transaction.wait();

						// await expect(transaction).not.reverted;
						// await expect(transaction).fulfilled;

						// We are going to also be OK with the transaction not reverting.
						// todo-1 This fails to detect the actual error, if any, and always throws that the transaction didn't revert,
						// todo-1 probably for the same reason `transaction.wait` doesn't throw a usable error.
						await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");

						// console.log("Success 1.", transactions.length);
					} catch (error2Details) {
						// console.log("Error.", transactions.length);

						// console.log();
						// console.log(error2Details.message);
						// console.log(error2Details);

						// // ChatGPT recommended this approach, but it doesn't work.
						// const revertData = error2Details.data;
						// // const revertData = error2Details;
						// if (revertData) {
						// 	const decodedError = cosmicSignatureGameProxy.interface.parseError(revertData);
						// 	console.log("Custom Error Name:", decodedError.name);
						// } else {
						// 	console.error("Error data not found.");
						// }

						if(error2Details.message.endsWith(", but it didn't revert")) {
							// console.log("Success 2.", transactions.length);
						} else if ( errorDetails === undefined ||
										errorDetails.message.startsWith("Sender doesn't have enough funds to send tx.") &&
										( ! error2Details.message.startsWith("Sender doesn't have enough funds to send tx.") )
									) {
							errorDetails = error2Details;
						}
					}
				}
				transactions.length = 0;
				if (errorDetails !== undefined) {
					// console.log(errorDetails.message);
					throw errorDetails;
				}
			}
		};

		await hre.ethers.provider.send("evm_setAutomine", [false]);
		try {
			// This loop will keep spinning until an error is thrown due to a signer running out of ETH,
			// or any other error.
			for ( let counter = 0; /*counter < 300*/; ++ counter ) {
				randomNumber = generateRandomUInt32();
				const signer = signers[(randomNumber & 0xFFFF) % signers.length];
				// if ((counter & 0xFF) == 0) {
				// 	console.log((
				// 		await hre.ethers.provider.getBlock("latest")).timestamp,
				// 		((await hre.ethers.provider.getBalance(signer.address)) + 10n ** 18n / 2n) / (10n ** 18n),
				// 		Number(await cosmicSignatureGameProxy.getNextEthBidPrice(1n)) / (10 ** 18)
				// 	);
				// }
				let transactionQueued = false;
				if (await cosmicSignatureGameProxy.lastBidderAddress() != hre.ethers.ZeroAddress) {
					const cstBalanceAmount_ = await cosmicSignatureToken.balanceOf(signer.address);
					const nextCstBidPrice_ = await cosmicSignatureGameProxy.getNextCstBidPrice(1n);

					// [Comment-202502193]
					// This is (likely) going to be enough for each of up to 2 CST bids. Further bids within the same block will (likely) fail.
					// [/Comment-202502193]
					const nextCstBidPrice2_ = nextCstBidPrice_ * 2n;

					if (cstBalanceAmount_ >= nextCstBidPrice2_) {
						transactions.push(await cosmicSignatureGameProxy.connect(signer).bidWithCst(nextCstBidPrice2_, "", {gasLimit: 450_000}));
						transactionQueued = true;
					}
				}
				if ( ! transactionQueued ) {
					const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
					// const nextEthBidPrice2_ = 11n;

					// [Comment-202502191]
					// This is going to be enough for each of up to 4 ETH bids. Further bids within the same block will fail.
					// [/Comment-202502191]
					const nextEthBidPrice2_ = nextEthBidPrice_ * 1041n / 1000n;

					transactions.push(await cosmicSignatureGameProxy.connect(signer).bidWithEth((-1n), "", {value: nextEthBidPrice2_, gasLimit: 450_000}));
				}
				randomNumber >>= 16;
				await mineBlockIfNeeded(false);
			}
		} catch (errorDetails) {
			// console.log(errorDetails.message);
			let error2Details;
			try {
				// Mining whatever was queued.
				await mineBlockIfNeeded(true);
			} catch (error2Details2) {
				error2Details = error2Details2;
			}
			await hre.ethers.provider.send("evm_setAutomine", [true]);
			if ( ! errorDetails.message.startsWith("Sender doesn't have enough funds to send tx.") ) {
				throw errorDetails;
			}
			if (error2Details !== undefined && ( ! error2Details.message.startsWith("Sender doesn't have enough funds to send tx.") )) {
				throw error2Details;
			}
		}
	});

	it("The getDurationUntilRoundActivation and getDurationElapsedSinceRoundActivation methods behave correctly", async function () {
		const {ownerAcct, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);

		// [Comment-202501192]
		// todo-1 Improve this comment. See todos.
		// Issue. `loadFixture` doesn't remove blocks generated after it was called for the first time
		// and/or has some other similar issues.
		// Additionally, near Comment-202501193, HardHat is configured for deterministic mined block timing,
		// but that behavior appears to not work stably.
		// todo-1 Or `interval: 0` has fixed it? (No, it got better, but some tests still fail sometimes.)
		// todo-1 But getting latest block timestamp before executing a non-`view` function still doesn't work correct.
		// todo-1 It can return a block like a minute ago.
		// todo-1 Maybe that's the timestamp after the initil call to `loadFixture`.
		// So this hack appears to make block timestamps more deterministic.
		// [/Comment-202501192]
		await hre.ethers.provider.send("evm_mine");

		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		const newRoundActivationTime_ = latestBlock_.timestamp + 2;
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(newRoundActivationTime_);

		for ( let counter_ = -1; counter_ <= 1; ++ counter_ ) {
			latestBlock_ = await hre.ethers.provider.getBlock("latest");
			expect(latestBlock_.timestamp).equal(newRoundActivationTime_ + counter_);
			const durationUntilRoundActivation_ = await cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			expect(durationUntilRoundActivation_).equal( - counter_ );
			const durationElapsedSinceRoundActivation_ = await cosmicSignatureGameProxy.getDurationElapsedSinceRoundActivation();
			expect(durationElapsedSinceRoundActivation_).equal(counter_);
			await hre.ethers.provider.send("evm_mine");
		}
	});
});
