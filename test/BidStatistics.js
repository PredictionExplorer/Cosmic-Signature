"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

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
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;

		// test case description:
		// 		addr1 will make a maximum duration of 1000 seconds in his bids
		// 		addr2 will make a maximum duration of 5000 seconds in his bids
		let maxbtime, maxbaddr;
		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount_ });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_000_000]);
		await hre.ethers.provider.send("evm_mine");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid1 (addr1)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_001_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid2	(addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_006_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid3 (addr1)
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_007_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid4 (addr2)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_008_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid5 (addr1)
		
		// todo-1 We now also have chrono-warrior.
		maxbtime = await cosmicSignatureGameProxy.enduranceChampionDuration();
		maxbaddr = await cosmicSignatureGameProxy.enduranceChampionAddress();
		expect(maxbtime).to.equal(5000);
		expect(maxbaddr).to.equal(addr2.address);
	});
	it("Bid time accounting: all bidders have bids of same duration, accounting correct", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3,] = signers;

		// test case description:
		// 		all 3 bidders make bids of the same length
		// 		the bidder of addr2 will bid 6 times, and will be the winner
		// 		the bidders addr1 and addr2 will bid 3 times each
		// 		addr1 makes 4 bids
		// 		addr2 makes 6 bids
		// 		addr3 makes 3 bids
		// 		bid amount is 1000 for every bid
		let maxbtime, maxbaddr;
		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount_ });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_000_000]);
		await hre.ethers.provider.send("evm_mine");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid1 (addr1)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_001_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid2	(addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_002_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr3).bid((-1), "", { value: nextEthBidPrice_ });	// bid3 (addr3)
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_003_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid4 (addr2)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_004_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid5 (addr1)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_005_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid6 (addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_006_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr3).bid((-1), "", { value: nextEthBidPrice_ });	// bid7 (addr3)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_007_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid8 (addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_008_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid9 (addr1)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_009_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid10 (addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_010_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid11 (addr3)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_011_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid12(addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_012_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid13 (addr1)
		
		// todo-1 We now also have chrono-warrior.
		maxbtime = await cosmicSignatureGameProxy.enduranceChampionDuration();
		maxbaddr = await cosmicSignatureGameProxy.enduranceChampionAddress();
		expect(maxbtime).to.equal(1000);
		expect(maxbaddr).to.equal(addr1.address);
	});
	// todo-1 We now also have chrono-warrior.
	it("Endurance Champion selection is correct for a specific use case", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3,] = signers;

		// test case description:
		// first bid is made by owner, to initialize all the variables, duration of 1000 seconds
		// second bid is made by addr1 , duration of 2000 seconds
		// bid 3 will be made by addr2, duration of 5000 seconds. 
		// 5000 seconds is longer than 1000 seconds of the owner, and 2000 seconds of addr1, 
		// therefore addr2 is the Endurance Champion
		
		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount_ });

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_080_000]);
		await hre.ethers.provider.send("evm_mine");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(owner).bid((-1), "", { value: nextEthBidPrice_ });	// bid1 (owner, for 1,000 seconds

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_081_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr1).bid((-1), "", { value: nextEthBidPrice_ });	// bid2	(addr1, for 2,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_083_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr2).bid((-1), "", { value: nextEthBidPrice_ });	// bid3 (addr2, for 5,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_088_000]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr3).bid((-1), "", { value: nextEthBidPrice_ });	// bid4 (close everything)

		// todo-1 We now also have chrono-warrior.
		// const result = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		const result = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		const [champion, duration,] = result;
		expect(champion).to.equal(addr2.address);
		expect(duration).to.equal(5000);
	});
});
