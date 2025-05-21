"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("BidStatistics", function () {
	// const InvalidBidderQueryRoundNumDef = {
	// 	type: "tuple(string,uint256,uint256)",
	// 	name: "InvalidBidderQueryRoundNum",
	// 	components: [
	// 		{ name: "errStr", type: "string"},
	// 		{ name: "providedRoundNum", type: "uint256"},
	// 		{ name:	"currentRoundNum", type: "uint256"},
	// 	],
	// };

	it("Bid time accounting: two bidders bid against each other, accounting correct", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;

		// test case description:
		// 		signer1 will make a maximum duration of 1000 seconds in his bids
		// 		signer2 will make a maximum duration of 5000 seconds in his bids
		let maxbtime, maxbaddr;
		// let donationAmount_ = hre.ethers.parseEther("10");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_000_000]);
		await hre.ethers.provider.send("evm_mine");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid1 (signer1)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_001_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid2	(signer2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_006_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid3 (signer1)
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_007_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid4 (signer2)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_008_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid5 (signer1)
		
		// todo-1 We now also have chrono-warrior.
		maxbtime = await cosmicSignatureGameProxy.enduranceChampionDuration();
		maxbaddr = await cosmicSignatureGameProxy.enduranceChampionAddress();
		expect(maxbtime).to.equal(5000);
		expect(maxbaddr).to.equal(signer2.address);
	});

	it("Bid time accounting: all bidders have bids of same duration, accounting correct", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;

		// test case description:
		// 		all 3 bidders make bids of the same length
		// 		the bidder of signer2 will bid 6 times, and will be the winner
		// 		the bidders signer1 and signer2 will bid 3 times each
		// 		signer1 makes 4 bids
		// 		signer2 makes 6 bids
		// 		signer3 makes 3 bids
		// 		bid amount is 1000 for every bid
		let maxbtime, maxbaddr;
		// let donationAmount_ = hre.ethers.parseEther("10");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_000_000]);
		await hre.ethers.provider.send("evm_mine");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid1 (signer1)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_001_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid2	(signer2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_002_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid3 (signer3)
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_003_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid4 (signer2)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_004_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid5 (signer1)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_005_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid6 (signer2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_006_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid7 (signer3)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_007_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid8 (signer2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_008_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid9 (signer1)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_009_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid10 (signer2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_010_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid11 (signer1)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_011_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid12(signer2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_012_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid13 (signer1)
		
		// todo-1 We now also have chrono-warrior.
		maxbtime = await cosmicSignatureGameProxy.enduranceChampionDuration();
		maxbaddr = await cosmicSignatureGameProxy.enduranceChampionAddress();
		expect(maxbtime).to.equal(1000);
		expect(maxbaddr).to.equal(signer1.address);
	});
	
	// todo-1 We now also have chrono-warrior.
	it("Endurance Champion selection is correct for a specific use case", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;

		// test case description:
		// first bid is made by signer0, to initialize all the variables, duration of 1000 seconds
		// second bid is made by signer1 , duration of 2000 seconds
		// bid 3 will be made by signer2, duration of 5000 seconds.
		// 5000 seconds is longer than 1000 seconds of signer0, and 2000 seconds of signer1,
		// therefore signer2 is the Endurance Champion
		
		// let donationAmount_ = hre.ethers.parseEther("10");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_080_000]);
		await hre.ethers.provider.send("evm_mine");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer0).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid1 (signer0, for 1,000 seconds

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_081_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid2 (signer1, for 2,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_083_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid3 (signer2, for 5,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_088_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });	// bid4 (close everything)

		// todo-1 We now also have chrono-warrior.
		// const result = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		const result = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		const [champion, duration,] = result;
		expect(champion).to.equal(signer2.address);
		expect(duration).to.equal(5000);
	});

	// it("Bid statistics are producing correct values and Stellar Spender address is assigned correctly", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
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
	// 	let paidCstPrice = evt.paidCstPrice;
	// 	spent = await cosmicSignatureGameProxy.getBidderTotalSpentAmounts(/* todo-9 roundNum_, */ signer1.address);
	// 	spentCst = spent[1];
	// 	expect(spentCst).to.equal(paidCstPrice);
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
	// 	paidCstPrice = evt.paidCstPrice;
	// 	let totalSpentCst_ = paidCstPrice + spentCst;
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

	// todo-1 This method no longer exists. Use `getBidderAddressAt` instead. But parts of this test could still be relevant.
	// it("The bidderAddress method", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
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
});
