"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = false;

describe("BidStatistics", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmicSignature(deployerAcct) {
		const [owner, addr1, , , , , , addr7,] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureNft,
			cosmicSignatureToken,
			cosmicSignatureDao,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			// marketingWallet,
			// cosmicSignatureGame,
		} = await basicDeployment(owner, "", addr7.address, addr1.address, true, 1);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureNft,
			cosmicSignatureToken,
			cosmicSignatureDao,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			// marketingWallet,
			// cosmicSignatureGame,
		};
	}
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
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
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const {cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);

		// test case description:
		// 		addr1 will make a maximum duration of 1000 seconds in his bids
		// 		addr2 will make a maximum duration of 5000 seconds in his bids
		let maxbtime,maxbaddr,prevbst,prevbaddr;
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800000000]);
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid1 (addr1)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800001000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid2	(addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800006000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid3 (addr1)
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800007000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid4 (addr2)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800008000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid5 (addr1)
		
		// todo-1 We now also have chrono-warrior.
		maxbtime = await cosmicSignatureGameProxy.enduranceChampionDuration();
		maxbaddr = await cosmicSignatureGameProxy.enduranceChampionAddress();
		expect(maxbtime).to.equal(5000);
		expect(maxbaddr).to.equal(addr2.address);
	});
	it("Bid time accounting: all bidders have bids of same duration, accounting correct", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);

		// test case description:
		// 		all 3 bidders make bids of the same length
		// 		the bidder of addr2 will bid 6 times, and will be the winner
		// 		the bidders addr1 and addr2 will bid 3 times each
		// 		addr1 makes 4 bids
		// 		addr2 makes 6 bids
		// 		addr3 makes 3 bids
		// 		bid amount is 1000 for every bid
		let maxbtime,maxbaddr,prevbst,prevbaddr;
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800000000]);
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid1 (addr1)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800001000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid2	(addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800002000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });	// bid3 (addr3)
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800003000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid4 (addr2)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800004000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid5 (addr1)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800005000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid6 (addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800006000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });	// bid7 (addr3)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800007000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid8 (addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800008000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid9 (addr1)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800009000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid10 (addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800010000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid11 (addr3)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800011000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid12(addr2)
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800012000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid13 (addr1)
		
		// todo-1 We now also have chrono-warrior.
		maxbtime = await cosmicSignatureGameProxy.enduranceChampionDuration();
		maxbaddr = await cosmicSignatureGameProxy.enduranceChampionAddress();
		expect(maxbtime).to.equal(1000);
		expect(maxbaddr).to.equal(addr1.address);
	});
	// todo-1 We now also have chrono-warrior.
	it("Endurance Champion selection is correct for a specific use case", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);

		// test case description:
		// first bid is made by owner, to initialize all the variables, duration of 1000 seconds
		// second bid is made by addr1 , duration of 2000 seconds
		// bid 3 will be made by addr2, duration of 5000 seconds. 
		// 5000 seconds is longer than 1000 seconds of the owner, and 2000 seconds of addr1, 
		// therefore addr2 is the Endurance Champion
		
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800080000]);
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(owner).bid(/*params*/ (-1), "", { value: bidPrice });	// bid1 (owner, for 1,000 seconds

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800081000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });	// bid2	(addr1, for 2,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800083000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });	// bid3 (addr2, for 5,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [1800088000]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });	// bid4 (close everything)

		// todo-1 We now also have chrono-warrior.
		// const result = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		const result = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		const [champion, duration] = result;
		expect(champion).to.equal(addr2.address);
		expect(duration).to.equal(5000);
	});
});
