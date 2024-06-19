const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment } = require("../src//Deploy.js");
const DEFAULT_VALUE = "111";
const DEFAULT_INDEX = "11";
const DEFAULT_ADDRESS = "0x1111111111111111111111111111111111111111";

// CHecks that storage offsets and slots in BusinessLogic contract and CosmicGame contract
// are pointing to the same indexes
describe("DelegateCallStorage", function () {
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
		[deployerAcct] = await ethers.getSigners();

		const CGTest = await ethers.getContractFactory("CGTest");
		let cgtest = await CGTest.connect(deployerAcct).deploy();
		await cgtest.deployed();

		const BLTest = await ethers.getContractFactory("BLTest");
		let bltest = await BLTest.connect(deployerAcct).deploy();
		await bltest.deployed();
		await cgtest.connect(deployerAcct).setBusinessLogicContract(bltest.address);
		return { cgtest, bltest };
	}
	it("lastBidType", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f0();
		let value = await cgtest.lastBidType();
		expect(await value).to.equal(2);
	});
	it("usedRandomWalkNFTs", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f1();
		let value = await cgtest.usedRandomWalkNFTs(ethers.BigNumber.from(DEFAULT_INDEX));
		expect(await value).to.equal(true);
	});
	it("randomWalk", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f2();
		let value = await cgtest.randomWalk();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("bidPrice", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f3();
		let value = await cgtest.bidPrice();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("numETHBids", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f4();
		let value = await cgtest.numETHBids();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("lastBidder", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f5();
		let value = await cgtest.lastBidder();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("roundNum", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f6();
		let value = await cgtest.roundNum();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("prizeTime", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f7();
		let value = await cgtest.prizeTime();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("activationTime", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f8();
		let value = await cgtest.activationTime();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("initialSecondsUntilPrize", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f9();
		let value = await cgtest.initialSecondsUntilPrize();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("raffleParticipants", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f10();
		let value = await cgtest.raffleParticipants(ethers.BigNumber.from(DEFAULT_INDEX));
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("numRaffleParticipants", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f11();
		let value = await cgtest.numRaffleParticipants();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("token", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f12();
		let value = await cgtest.token();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("marketingWallet", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f13();
		let value = await cgtest.marketingWallet();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("startingBidPriceCST", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f14();
		let value = await cgtest.startingBidPriceCST();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("lastCSTBidTime", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f15();
		let value = await cgtest.lastCSTBidTime();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("numCSTBids", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f16();
		let value = await cgtest.numCSTBids();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("ETHToCSTBidRatio", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f17();
		let value = await cgtest.ETHToCSTBidRatio();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("CSTAuctionLength", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f18();
		let value = await cgtest.CSTAuctionLength();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("nanoSecondsExtra", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f19();
		let value = await cgtest.nanoSecondsExtra();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("timeIncrease", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f20();
		let value = await cgtest.timeIncrease();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("priceIncrease", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f21();
		let value = await cgtest.priceIncrease();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("timeoutClaimPrize", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f22();
		let value = await cgtest.timeoutClaimPrize();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("charity", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f23();
		let value = await cgtest.charity();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("initialBidAmountFraction", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f24();
		let value = await cgtest.initialBidAmountFraction();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("prizePercentage", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f25();
		let value = await cgtest.prizePercentage();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("charityPercentage", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f26();
		let value = await cgtest.charityPercentage();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("rafflePercentage", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f27();
		let value = await cgtest.rafflePercentage();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("stakingPercentage", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f28();
		let value = await cgtest.stakingPercentage();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("numRaffleETHWinnersBidding", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f29();
		let value = await cgtest.numRaffleETHWinnersBidding();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("numRaffleNFTWinnersBidding", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f30();
		let value = await cgtest.numRaffleNFTWinnersBidding();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("numRaffleNFTWinnersStakingCST", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f31();
		let value = await cgtest.numRaffleNFTWinnersStakingCST();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("winners", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f32();
		let value = await cgtest.winners(ethers.BigNumber.from(DEFAULT_INDEX));
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("raffleEntropy", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f33();
		let value = await cgtest.raffleEntropy();
		expect(await value).to.equal("0x1111111111111111111111111111111111111111000000000000000000000000");
	});
	it("raffleWallet", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f34();
		let value = await cgtest.raffleWallet();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("stakingWalletCST", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f35();
		let value = await cgtest.stakingWalletCST();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("donatedNFTs", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f36();
		let value = await cgtest.donatedNFTs(ethers.BigNumber.from(DEFAULT_INDEX));
		expect(value.round).to.equal(DEFAULT_VALUE);
	});
	it("numDonatedNFTs", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f37();
		let value = await cgtest.numDonatedNFTs();
		expect(await value).to.equal(ethers.BigNumber.from(DEFAULT_VALUE));
	});
	it("nft", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f38();
		let value = await cgtest.nft();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("bLogic", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f39();
		let value = await cgtest.bLogic();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("extraStorage", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f40();
		let value = await cgtest.extraStorage(DEFAULT_INDEX);
		expect(await value).to.equal(DEFAULT_VALUE);
	});
	it("systemMode", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f41();
		let value = await cgtest.systemMode();
		expect(await value).to.equal(DEFAULT_VALUE);
	});
	it("stakingWalletRWalk", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f42();
		let value = await cgtest.stakingWalletRWalk();
		expect(await value).to.equal(DEFAULT_ADDRESS);
	});
	it("numRaffleNFTWinnersStakingRWalk", async function () {
		const { cgtest, bltest } = await loadFixture(deployCosmic);
		await cgtest.f43();
		let value = await cgtest.numRaffleNFTWinnersStakingRWalk();
		expect(await value).to.equal(DEFAULT_VALUE);
	});
});
