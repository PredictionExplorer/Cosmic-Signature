const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const SKIP_LONG_TESTS = "1";
const { basicDeployment,basicDeploymentAdvanced } = require("../src//Deploy.js");

describe("Special test for Endurance Champion logic testing", function () {
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
	it("Endurance Champion selection is correct for specific test 1", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
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
			bidLogic,
		} = await basicDeploymentAdvanced("CosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		await cosmicGame.setTimeoutClaimPrize(0);	// zero the timeout varaible so we can get clean bid times for endurance champion check
		await cosmicGame.setTimeIncrease(0);		// zero time increment variables
		await cosmicGame.setInitialSecondsUntilPrize(0);
		await cosmicGame.setNanoSecondsExtra(ethers.BigNumber.from("1000000000"));
		await await cosmicGame.setRuntimeMode();

		// test case description:
		// first bid is made by owner, to initialize all the variables, duration of 1000 seconds
		// second bid is made by addr1 , duration of 2000 seconds
		// bid 3 will be made by addr2, duration of 5000 seconds. 
		// 5000 seconds is longer than 1000 seconds of the owner, and 2000 seconds of addr1, 
		// therefore addr2 is the Endurance Champion
		
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });

		let result,champion,duration;

		result = await cosmicGame.currentEnduranceChampion();
		champion = result[0]; duration = result[1];
		//console.log("before bid: champion = "+champion); console.log("duration = "+duration);

		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800000000]);
		await cosmicGame.connect(owner).bid(params, { value: bidPrice });	// bid1 (owner, for 1,000 seconds
		result = await cosmicGame.currentEnduranceChampion();
		champion = result[0]; duration = result[1];
		//console.log("after bid1: champion = "+champion); console.log("duration = "+duration);

		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800001000]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });	// bid2	(addr1, for 2,000 seconds)
		result = await cosmicGame.currentEnduranceChampion();
		champion = result[0]; duration = result[1];
		//console.log("after bid2: champion = "+champion); console.log("duration = "+duration);

		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800003000]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });	// bid3 (addr2, for 5,000 seconds)


		bidPrice = await cosmicGame.getBidPrice();
		await ethers.provider.send("evm_setNextBlockTimestamp", [1800008000]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });	// bid4 (close everything)

		result = await cosmicGame.currentEnduranceChampion();
		champion = result[0]; duration = result[1];
		//console.log("after bid2: champion = "+champion); console.log("duration = "+duration);
		expect(champion).to.equal(addr2.address);
		expect(duration).to.equal(5000);
	});
});
