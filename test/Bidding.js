"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("Bidding", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("Should be possible to bid", async function () {
		const {signers, cosmicSignatureGameProxy, prizesWallet,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// [ToDo-202411202-1]
		// This is a quick hack.
		// To be revisited.
		// [/ToDo-202411202-1]
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		const donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		expect(await cosmicSignatureGameProxy.getMainEthPrizeAmount()).to.equal((donationAmount * 25n) / 100n);
		// todo-1 We now also have chrono-warrior.
		// let echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		let echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(hre.ethers.ZeroAddress);
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: 1 })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ - 1n })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).lessThan(-1e9);

		const mainPrizeTimeIncrementInMicroSeconds1 = await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds();

		// check that if we sent too much, we get our money back
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ + 1000n, });
		const contractBalance = await hre.ethers.provider.getBalance(cosmicSignatureGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount + ethBidPrice_);

		let spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
		expect(spent[0]).to.equal(ethBidPrice_);

		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		// todo-1 We now also have chrono-warrior.
		// echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(addr1.address);

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (mainPrizeTimeIncrementInMicroSeconds1 / 1000000n) - 100n);

		const mainPrizeTimeIncrementInMicroSeconds2 = await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds();
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (mainPrizeTimeIncrementInMicroSeconds1 / 1000000n) - 100n + (mainPrizeTimeIncrementInMicroSeconds2 / 1000000n) - 1n);

		const mainPrizeTimeIncrementInMicroSeconds3 = await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds();
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (mainPrizeTimeIncrementInMicroSeconds1 / 1000000n) - 100n + (mainPrizeTimeIncrementInMicroSeconds2 / 1000000n) - 1n + (mainPrizeTimeIncrementInMicroSeconds3 / 1000000n) - 1n);

		await expect(cosmicSignatureGameProxy.connect(addr1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "MainPrizeEarlyClaim");

		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		await expect(cosmicSignatureGameProxy.connect(addr2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "MainPrizeEarlyClaim");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 100]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(addr2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "MainPrizeEarlyClaim");
		await hre.ethers.provider.send("evm_increaseTime", [100 - 1]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(addr2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "MainPrizeEarlyClaim");
		await expect(cosmicSignatureGameProxy.connect(addr1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "LastBidderOnly");

		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		// await hre.ethers.provider.send("evm_mine");

		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		await hre.ethers.provider.send("evm_increaseTime", [10]);
		await hre.ethers.provider.send("evm_mine");

		// todo-1 We now also have chrono-warrior.
		// echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(addr2.address);

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		// let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// let charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		// let raffleTotalEthPrizeAmount_ = await cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmount();
		await cosmicSignatureGameProxy.connect(addr3).claimMainPrize();
		let mainEthPrizeAmount2_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		let balance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		let mainEthPrizeExpectedAmount_ = (balance * 25n) / 100n;
		expect(mainEthPrizeAmount2_).to.equal(mainEthPrizeExpectedAmount_);
		// let w = await cosmicSignatureGameProxy.tryGetMainPrizeWinnerAddress(0);
		let w = await prizesWallet.mainPrizeWinnerAddresses(0);
		expect(w).to.equal(addr3.address);

		await expect(cosmicSignatureGameProxy.connect(addr2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NoBidsInRound");

		// after the prize has been claimed, let's bid again!
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		await expect(cosmicSignatureGameProxy.connect(addr1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "MainPrizeEarlyClaim");

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		// await hre.ethers.provider.send("evm_mine");

		// mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		await expect(cosmicSignatureGameProxy.connect(addr1).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "MainPrizeEarlyClaim");
		await cosmicSignatureGameProxy.connect(addr1).claimMainPrize();
		mainEthPrizeAmount2_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		balance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		mainEthPrizeExpectedAmount_ = (balance * 25n) / 100n;
		expect(mainEthPrizeAmount2_).to.equal(mainEthPrizeExpectedAmount_);

		// After the main prize claim timeout expires, anyone should be able to claim the prize.
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		expect(await cosmicSignatureGameProxy.getTotalBids()).to.equal(1);
		expect(await cosmicSignatureGameProxy.getBidderAddressAtPosition(0)).to.equal(addr1.address);
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");

		await expect(cosmicSignatureGameProxy.connect(addr2).claimMainPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "LastBidderOnly");

		await hre.ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		await cosmicSignatureGameProxy.connect(addr2).claimMainPrize();
		expect(await cosmicSignatureGameProxy.lastBidderAddress()).to.equal(hre.ethers.ZeroAddress);
	});
	it("Should be possible to bid with RandomWalk NFT", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: tokenPrice }); // nftId=0

		// switch to another account and attempt to use nftId=0 which we don't own
		// let bidParams = { message: "hello", randomWalkNftId: 0 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(owner).bid(/*params*/ 0, "hello", { value: ethBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "IncorrectERC721TokenOwner");
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ 0, "hello", { value: ethBidPrice_ });
		// await hre.ethers.provider.send("evm_mine");
		tokenPrice = await randomWalkNft.getMintPrice();
		let tx = await randomWalkNft.connect(owner).mint({ value: tokenPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNft.interface.parseLog(log);
		let token_id = parsed_log.args[0];
		// bidParams = { message: "", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicSignatureGameProxy.connect(owner).bid(/*params*/ token_id, "", { value: 0 })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(owner).bid(/*params*/ token_id, "", { value: ethBidPrice_ });
		// expect(await cosmicSignatureGameProxy.wasRandomWalkNftUsed(token_id)).to.equal(true);
		expect(await cosmicSignatureGameProxy.usedRandomWalkNfts(token_id)).to.equal(1);

		// try to bid again using the same nftId
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(owner).bid(/*params*/ token_id, "", { value: ethBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "UsedRandomWalkNft");
	});
	it("Shouldn't be possible to bid if bidder doesn't accept refunds on oversized bid() calls", async function () {
		const {cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);

		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(cBidder.doFailedBid({ value: donationAmount })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");
	});
	it("Shouldn't be possible to bid using very long message", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		const longMsg = "a".repeat(280 + 1);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		// let bidParams = { message: longMsg, randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), longMsg, { value: ethBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidMessageLengthOverflow");
	});
	it("getCstDutchAuctionDurations() method works", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });

		await cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "cst bid");

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

		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3, addr4, addr5,] = signers;

		let token_id = await mint_rwalk(addr1);
		// let bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ token_id, "bidWithRWalk", { value: ethBidPrice_ });
		token_id = await mint_rwalk(addr2);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ token_id, "bidWithRWalk", { value: ethBidPrice_ });
		token_id = await mint_rwalk(addr3);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ token_id, "bidWithRWalk", { value: ethBidPrice_ });
		token_id = await mint_rwalk(addr4);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr4).bid(/*params*/ token_id, "bidWithRWalk", { value: ethBidPrice_ });
		token_id = await mint_rwalk(addr5);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr5).bid(/*params*/ token_id, "bidWithRWalk", { value: ethBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		// todo-1 Take a closer look at this. What if it reverts with a different error?
		// todo-1 This is really not supposed to fail. It appears that this tests a no longer existing bug.
		await expect(cosmicSignatureGameProxy.connect(addr5).claimMainPrize()).not.revertedWith("panic code 0x12"); // divide by zero
		// todo-1 Maybe check that now it will revert with "NoLastBidder".
		// todo-1 Actually it will probably revert because the round is not active yet.
	});
	it("After bid() , bid-related counters have correct values", async function () {
		const {cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		// ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.mint({ value: tokenPrice }); // nftId=0

		// bidParams = { message: "rwalk bid", randomWalkNftId: 0n };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.bid(/*params*/ 0n, "rwalk bid", { value: ethBidPrice_ / 2n });

		// let lastBidType = await cosmicSignatureGameProxy.lastBidType();
		// expect(lastBidType).to.equal(1);

		let [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_] = await cosmicSignatureGameProxy.getCstDutchAuctionDurations();
		await hre.ethers.provider.send('evm_increaseTime', [Number(cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_) - 1]); // make CST price drop to almost 0
		// await hre.ethers.provider.send('evm_mine');

		await expect(cosmicSignatureGameProxy.bidWithCst(0n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "BidPrice");
		await cosmicSignatureGameProxy.bidWithCst(0n, "cst bid");

		// lastBidType = await cosmicSignatureGameProxy.lastBidType();
		// expect(lastBidType).to.equal(2);
	});
	it("On ETH bid, we refund the correct amount when msg.value is greater than required", async function () {
		const {cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);

		let donationAmount = hre.ethers.parseEther("1");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		let cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(cosmicSignatureGameProxyAddr);
		await cBidder.waitForDeployment();
		// let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = hre.ethers.parseEther("2");
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cBidder.doBid2({ value: amountSent });
		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let expectedBalanceAfter = amountSent - ethBidPrice_;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it("On ETH + RandomWalk NFT bid, we refund the correct amount when msg.value is greater than required", async function () {
		const {cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);

		let donationAmount = hre.ethers.parseEther("1");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		let cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(cosmicSignatureGameProxyAddr);
		await cBidder.waitForDeployment();
		// let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = hre.ethers.parseUnits("1",15);

		await randomWalkNft.setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.setApprovalForAll(await cBidder.getAddress(), true);

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.mint({ value: tokenPrice }); // nftId=0
		const ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cBidder.doBidRWalk2(0, { value: amountSent });
		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let discountedBidPrice = ethBidPrice_ / 2n;
		let expectedBalanceAfter = amountSent - discountedBidPrice;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it("Bidding a lot & staking a lot works correctly", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft, stakingWalletCosmicSignatureNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3, addr4, addr5,] = signers;

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		let donationAmount = hre.ethers.parseEther("100");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });

		let durationUntilMainPrize_;
		let ethBidPrice_;
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		for (let i = 0; i < 30; i++) {
			ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
			ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
			ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
			ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr4).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
			durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
			// await hre.ethers.provider.send('evm_mine');
			await cosmicSignatureGameProxy.connect(addr4).claimMainPrize();
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
				await cosmicSignatureNft.connect(owner_signer).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
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
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr4).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();

		// We need another time increase to claim as `addr5` (it has no bids, won't get raffle NFTs).
		const durationUntilTimeoutTimeToClaimMainPrize_ = durationUntilMainPrize_ + await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();

		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilTimeoutTimeToClaimMainPrize_)]);
		// await hre.ethers.provider.send('evm_mine');
		let totSupBefore = await cosmicSignatureNft.totalSupply();
		tx = await cosmicSignatureGameProxy.connect(addr5).claimMainPrize();
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
				throw 'Invalid action id ' + lastActionId;
			}
			// let stakeActionRecord = await stakingWalletCosmicSignatureNft.stakeActions(lastActionId);
			// expect(stakeActionRecord.nftOwnerAddress).to.equal(stakerAddr);
		}

		// todo-1 This is probably no longer needed. At least comment.
		await hre.ethers.provider.send('evm_increaseTime', [60 * 24 * 60 * 60]);
		// await hre.ethers.provider.send('evm_mine');

		let num_actions;
		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		for (let i = 0; i < Number(num_actions); i++) {
			// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
			let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwnerAddress;
			let owner_signer = await hre.ethers.getSigner(ownr);
			await hre.ethers.provider.send('evm_increaseTime', [100]);
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
		// const contractBalance = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());
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
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3,] = signers;

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await cosmicSignatureGameProxy.connect(addr1).claimMainPrize();

		await hre.ethers.provider.send('evm_increaseTime', [20000]); // make CST bid price cheaper
		await hre.ethers.provider.send('evm_mine');
		let startingBidPriceCST_ = await cosmicSignatureGameProxy.startingBidPriceCST();
		expect(startingBidPriceCST_).to.equal(200n * (10n ** 18n));
		// todo-1 This is not necessarily valid.
		let cstDutchAuctionBeginTimeStamp_ = await cosmicSignatureGameProxy.cstDutchAuctionBeginTimeStamp();
		expect(cstDutchAuctionBeginTimeStamp_).to.equal(await cosmicSignatureGameProxy.activationTime());
		let latestBlockTimeStamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp);
		let cstDutchAuctionRemainingDuration_ = (12n * 60n * 60n) - (latestBlockTimeStamp_ - cstDutchAuctionBeginTimeStamp_);
		let nextCstBidExpectedPrice_ = startingBidPriceCST_ * cstDutchAuctionRemainingDuration_ / (12n * 60n * 60n);
		// todo-1 This is not necessarily valid.
		let nextCstBidPrice_ = await cosmicSignatureGameProxy.getNextCstBidPrice();
		expect(nextCstBidPrice_).to.equal(nextCstBidExpectedPrice_);
		-- cstDutchAuctionRemainingDuration_;
		nextCstBidExpectedPrice_ = startingBidPriceCST_ * cstDutchAuctionRemainingDuration_ / (12n * 60n * 60n);
		await cosmicSignatureGameProxy.connect(addr1).bidWithCst(nextCstBidExpectedPrice_, "cst bid");
		startingBidPriceCST_ = await cosmicSignatureGameProxy.startingBidPriceCST();
		expect(startingBidPriceCST_).to.equal(nextCstBidExpectedPrice_ * 2n);

		cstDutchAuctionRemainingDuration_ = (12n * 60n * 60n) - 1n;
		nextCstBidExpectedPrice_ = startingBidPriceCST_ * cstDutchAuctionRemainingDuration_ / (12n * 60n * 60n);
		let tx = await cosmicSignatureGameProxy.connect(addr1).bidWithCst(nextCstBidExpectedPrice_ * 10n, "cst bid");
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("BidEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		expect(args.numCSTTokens).to.equal(nextCstBidExpectedPrice_);
		expect(args.ethBidPrice).to.equal(-1n);
		expect(args.lastBidderAddress).to.equal(addr1.address);
		expect(args.message).to.equal("cst bid");
	});
	it("Function bidderAddress() works as expected", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0n);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: ethBidPrice_ });

		let bAddr = await cosmicSignatureGameProxy.bidderAddress(0,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(0,1); 
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(0,2); 
		expect(bAddr).to.equal(addr1.address);

		bAddr = await expect(cosmicSignatureGameProxy.bidderAddress(1,2)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"InvalidBidderQueryRoundNum"
		);
		bAddr = await expect(cosmicSignatureGameProxy.bidderAddress(0,3)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"InvalidBidderQueryOffset"
		);
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await cosmicSignatureGameProxy.connect(addr3).claimMainPrize();
		await expect(cosmicSignatureGameProxy.bidderAddress(1, 1)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"BidderQueryNoBidsYet"
		);

		// lets check roundNum > 0 now

		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: ethBidPrice_ });

		bAddr = await cosmicSignatureGameProxy.bidderAddress(1,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(1,1);
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(1,2);
		expect(bAddr).to.equal(addr1.address);
	});
	// it("Bid statistics are generating correct values and StellarSpender addr is assigned correctly", async function () {
	// 	const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
	// 	const [owner, addr1,] = signers;
	//
	// 	let spent, spentEth, spentCst, tx, topic_sig, receipt, log, evt;
	// 	let cstDutchAuctionDurations_ = await cosmicSignatureGameProxy.getCstDutchAuctionDurations();
	// 	let cstDutchAuctionDuration_ = cstDutchAuctionDurations_[0];
	// 	// let bidParams = { message: "", randomWalkNftId: -1 };
	// 	// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
	// 	await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
	// 	spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
	// 	spentEth = spent[0];
	// 	expect(spentEth).to.equal(ethBidPrice_);
	// 	await hre.ethers.provider.send('evm_increaseTime', [Number(cstDutchAuctionDuration_) - 600]); // lower price to pay in CST
	// 	// await hre.ethers.provider.send('evm_mine');
	// 	tx = await cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "");
	// 	topic_sig = cosmicSignatureGameProxy.interface.getEvent("BidEvent").topicHash;
	// 	receipt = await tx.wait();
	// 	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 	evt = log.args.toObject();
	// 	let bidPriceCst = evt.numCSTTokens;
	// 	spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
	// 	spentCst = spent[1];
	// 	expect(spentCst).to.equal(bidPriceCst);
	//
	// 	// check that CST and ETH are accumulated in statistics
	// 	ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
	// 	await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
	// 	let totalEthSpent = ethBidPrice_ + spentEth;
	// 	spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
	// 	spentEth = spent[0];
	// 	expect(spentEth).to.equal(totalEthSpent);
	//
	// 	tx = await cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "");
	// 	receipt = await tx.wait();
	// 	log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 	evt = log.args.toObject();
	// 	bidPriceCst = evt.numCSTTokens;
	// 	let totalSpentCst_ = bidPriceCst + spentCst;
	// 	spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
	// 	spentCst = spent[1];
	// 	expect(spentCst).to.equal(totalSpentCst_);
	//
	// 	let maxBidderAddr = await cosmicSignatureGameProxy.stellarSpender();
	// 	let maxCstBidderAmount_ = await cosmicSignatureGameProxy.stellarSpenderTotalSpentCst();
	//
	// 	spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
	// 	expect(maxBidderAddr).to.equal(addr1.address);
	// });
	it("It is not possible to bid with CST if balance is not enough", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		// await expect(cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientCSTBalance");
		await expect(cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureToken, "ERC20InsufficientBalance");
	});
	it("getBidderAddressAtPosition() reverts if invalid position index is provided", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;
		
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		// ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();

		expect(await cosmicSignatureGameProxy.getBidderAddressAtPosition(0)).to.equal(addr1.address);
		expect(await cosmicSignatureGameProxy.getBidderAddressAtPosition(1)).to.equal(addr2.address);
		await expect(cosmicSignatureGameProxy.getBidderAddressAtPosition(2)).to.be.revertedWith("Position out of bounds");
	});
	// todo-1 Are this and the next tests exactly the same? If so is it a bug or a feature?
	it("Shouldn't be possible to bid if minting of Cosmic Signature Tokens fails", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);

		const BrokenToken = await hre.ethers.getContractFactory("BrokenToken2");
		const brokenToken= await BrokenToken.deploy(0);
		await brokenToken.waitForDeployment();
		// await cosmicSignatureGameProxy.setCosmicSignatureTokenRaw(await brokenToken.getAddress());
		await cosmicSignatureGameProxy.setCosmicSignatureToken(await brokenToken.getAddress());

		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp + 1);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		// See ToDo-202409245-0.
		// await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ERC20Mint");
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ })).to.be.revertedWith("Test mint() failed.");
	});
	it("Shouldn't be possible to bid if minting of Cosmic Signature Tokens fails (second mint)", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);

		const BrokenToken = await hre.ethers.getContractFactory("BrokenToken2");
		const numTokenMintsPerBid_ = 1;
		const brokenToken= await BrokenToken.deploy(numTokenMintsPerBid_);
		await brokenToken.waitForDeployment();
		// await cosmicSignatureGameProxy.setCosmicSignatureTokenRaw(await brokenToken.getAddress());
		await cosmicSignatureGameProxy.setCosmicSignatureToken(await brokenToken.getAddress());

		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp + 1);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ });
		ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
		// See ToDo-202409245-0.
		// await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ERC20Mint");
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: ethBidPrice_ })).to.be.revertedWith("Test mint() failed.");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		if (SKIP_LONG_TESTS) return;

		const {signers, cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;
		
		// const timeBump = 24 * 60 * 60;
		const numIterationsMain = 30;
		const numIterationsSecondary = 10000;

		for ( let i = 0; i < numIterationsMain; ++ i ) {
			for ( let j = 0; j < numIterationsSecondary; ++ j ) {
				const ethBidPrice_ = await cosmicSignatureGameProxy.getBidPrice();
				await cosmicSignatureGameProxy.bid((-1), "", { value: ethBidPrice_ });
				const cstBalanceAmount_ = await cosmicSignatureToken.balanceOf(owner.address);
				const nextCstBidPrice_ = await cosmicSignatureGameProxy.getNextCstBidPrice();
				// console.log(i, j, Number(nextCstBidPrice_) / (10.0 ** 18.0), Number(cstBalanceAmount_) / (10.0 ** 18.0));
				if (nextCstBidPrice_ <= cstBalanceAmount_) {
					await cosmicSignatureGameProxy.bidWithCst(nextCstBidPrice_, "");
					break;
				}
			}

			// await hre.ethers.provider.send("evm_increaseTime", [timeBump]);
			// await hre.ethers.provider.send("evm_mine");
			// let cstDutchAuctionDuration_ = await cosmicSignatureGameProxy.getCstDutchAuctionDurations()[0];
		}
	});
});
