
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const SKIP_LONG_TESTS = "1";
const { basicDeployment,basicDeploymentAdvanced } = require("../src//Deploy.js");

describe("Bid time accounting", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			sttaingWaalletRWalk,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		return {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	const InvalidBidderQueryRoundDef = {
		type: "tuple(string,uint256,uint256)",
		name: "InvalidBidderQueryRound",
		components: [
			{ name: "errStr", type: "string"},
			{ name: "providedRound", type: "uint256"},
			{ name:	"totalRounds", type: "uint256"},
		],
	};
	it("Bid time accounting: two bidders bid against each other, accounting correct", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);

		// test case description:
		// 		addr1 will make a total time of 2000 (in 2 bids)
		// 		addr2 will make a total time of 6000 (in 2 bids)
		let maxbtime,maxbaddr,prevbst,prevbaddr;
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800000000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid1 (addr1)

		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800001000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid2	(addr2)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800006000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid3 (addr1)
				
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800007000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid4 (addr2)

		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800008000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid5 (addr1)
		
		maxbtime = await cosmicGame.longestBidderTime();
		maxbaddr = await cosmicGame.longestBidderAddress();
		expect(maxbtime).to.equal(6000);
		expect(maxbaddr).to.equal(addr2.address);
	});
	it("Bid time accounting: all bidders have bids of same duration, accounting correct", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);

		// test case description:
		// 		all 3 bidders make bids of the same length
		// 		the bidder of addr2 will bid 6 times, and will be the winner
		// 		the bidders addr1 and addr2 will bid 3 times each
		// 		addr1 makes 4 bids
		// 		addr2 makes 6 bids
		// 		addr3 makes 3 bids
		// 		bid amount is 1000 for every bid
		let maxbtime,maxbaddr,prevbst,prevbaddr;
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800000000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid1 (addr1)

		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800001000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid2	(addr2)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800002000]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });	// bid3 (addr3)
				
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800003000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid4 (addr2)

		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800004000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid5 (addr1)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800005000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid6 (addr2)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800006000]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });	// bid7 (addr3)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800007000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid8 (addr2)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800008000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid9 (addr1)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800009000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid10 (addr2)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800010000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid11 (addr3)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800011000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid12(addr2)
		
		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800012000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid13 (addr1)
		
		maxbtime = await cosmicGame.longestBidderTime();
		maxbaddr = await cosmicGame.longestBidderAddress();

		expect(maxbtime).to.equal(6000);
		expect(maxbaddr).to.equal(addr2.address);
	});
});
