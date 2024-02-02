const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const SKIP_LONG_TESTS = "1";
const { basicDeployment } = require("../src//Deploy.js");

describe("Staking tests", function () {
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
			stakingWallet,
			marketingWallet,
			bLogic,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false);

		return {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bLogic,
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
	it("Shouldn't be possible to deposit to StakingWallet from arbitrary address", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		await expect(stakingWallet.deposit(1111,{value:ethers.utils.parseEther("2")})).to.be.revertedWith(
			"Only the CosmicGame contract can deposit.",
		);
	});
	it("Shouldn't be possible to deposit to StakingWallet transfer to CharityWallet fails", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(cBidder.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();

		await expect(newStakingWallet.deposit(1111,{value:ethers.utils.parseEther("2")})).to.be.revertedWith(
			"Transfer to charity contract failed.",
		);
	});
	it("Shouldn't be possible to unstake() twice", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(deposit_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await newStakingWallet.unstake(0);

		await expect(newStakingWallet.unstake(0)).to.be.revertedWith("Token has already been unstaked");
	});
	it("Shouldn't be possible to unstake by a user different from the owner", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(deposit_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		await expect(newStakingWallet.connect(addr1).unstake(0)).to.be.revertedWith("Only the owner can unstake");
	});
	it("Shouldn't be possible to unstake before unstake date", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0);
		let receipt = await tx.wait();

		await expect(newStakingWallet.unstake(0)).to.be.revertedWith("Not allowed to unstake yet");
	});
	it("Shouldn't be possible to unstake before unstake date", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(deposit_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		await expect(newStakingWallet.claimReward(0,0)).to.be.revertedWith("Token has not been unstaked");
	});
	it("Shouldn't be possible to claim deposit more than once", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(deposit_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		expect(await newStakingWallet.deposit(unstakeTime,{value:ethers.utils.parseEther("2")}));
		expect(await newStakingWallet.unstake(0));
		expect(await newStakingWallet.claimReward(0,0));
		await expect(newStakingWallet.claimReward(0,0)).to.be.revertedWith("This deposit was claimed already");
	});
});
