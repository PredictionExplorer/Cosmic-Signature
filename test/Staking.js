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

		await expect(stakingWallet.deposit({value:ethers.utils.parseEther("2")})).to.be.revertedWith(
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
		let newStakingWallet = await StakingWallet.deploy(cBidder.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();

		await expect(newStakingWallet.deposit({value:ethers.utils.parseEther("2")})).to.be.revertedWith(
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
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await newStakingWallet.unstake(0);

		await expect(newStakingWallet.unstake(0)).to.be.revertedWith("Token has already been unstaked.");
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
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		await expect(newStakingWallet.connect(addr1).unstake(0)).to.be.revertedWith("Only the owner can unstake.");
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
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();

		await expect(newStakingWallet.unstake(0)).to.be.revertedWith("Not allowed to unstake yet.");
	});
	it("Shouldn't be possible to claim reward without executing unstake()", async function () {
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
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await newStakingWallet.deposit({value:ethers.utils.parseEther("2")});

		await expect(newStakingWallet.claimReward(0,0)).to.be.revertedWith("Token has not been unstaked.");
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
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		expect(await newStakingWallet.deposit({value:ethers.utils.parseEther("2")}));
		expect(await newStakingWallet.unstake(0));
		expect(await newStakingWallet.claimReward(0,0));
		await expect(newStakingWallet.claimReward(0,0)).to.be.revertedWith("This deposit was claimed already.");
	});
	it("Shouldn't be possible to claim deposit by a user different from the owner", async function () {
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
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		expect(await newStakingWallet.deposit({value:ethers.utils.parseEther("2")}));
		expect(await newStakingWallet.unstake(0));
		await expect(newStakingWallet.connect(addr1).claimReward(0,0)).to.be.revertedWith("Only the owner can claim reward.");
	});
	it("Shouldn't be possible to claim deposits made earlier than stakeDate", async function () {
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
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, cBidder.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWallet.address, true);

		await newStakingWallet.connect(addr1).stake(1,false);
		await newStakingWallet.deposit({value:ethers.utils.parseEther("2")});
		await ethers.provider.send("evm_mine");
		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeEligibleTime = log.args.unstakeTime.toNumber();
		let block = await stakingWallet.provider.getBlock(receipt.blockNumber);
		let stakeTimestamp = block.timestamp;
		await ethers.provider.send("evm_setNextBlockTimestamp", [unstakeEligibleTime]);
		await ethers.provider.send("evm_mine");
		let depositTimestamp = stakeTimestamp - 1;
		await newStakingWallet.unstake(1);
		await expect(newStakingWallet.claimReward(1,0)).to.be.revertedWith("You were not staked yet.");
	});
	it("Shouldn't be possible to claim deposits after unstakeDate", async function () {
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
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, addr1.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = newStakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWallet.stakeActions(0);
		let numStakeActions = await newStakingWallet.numStakeActions();
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWallet.connect(addr1).stake(1,false); // we need to stake, otherwise charity will get the deposit
		let nextTimestamp = stakeRecord.unstakeEligibleTime+1;
		await ethers.provider.send("evm_setNextBlockTimestamp", [nextTimestamp]);

		await newStakingWallet.unstake(0);
		nextTimestamp = nextTimestamp + 1;
		await ethers.provider.send("evm_setNextBlockTimestamp", [nextTimestamp]);
		tx = await newStakingWallet.deposit({value:ethers.utils.parseEther("2")});
		receipt = await tx.wait();
		topic_sig = newStakingWallet.interface.getEventTopic("EthDepositEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWallet.interface.parseLog(receipt_logs[0]);
		await expect(newStakingWallet.claimReward(0,0)).to.be.revertedWith("You were already unstaked.");
	});
	it("Shouldn't be possible to claim deposits with invalid stakeActionId or ETHDepositId", async function () {
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
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, addr1.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWallet.address, true);

		let tx = await newStakingWallet.stake(0,false);
		let receipt = await tx.wait();
		let topic_sig = newStakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWallet.stakeActions(0);
		let numStakeActions = await newStakingWallet.numStakeActions();
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWallet.connect(addr1).stake(1,false); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send("evm_setNextBlockTimestamp", [stakeRecord.unstakeEligibleTime+1]);

		await newStakingWallet.unstake(0);
		tx = await newStakingWallet.deposit({value:ethers.utils.parseEther("2")});
		receipt = await tx.wait();
		topic_sig = newStakingWallet.interface.getEventTopic("EthDepositEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWallet.interface.parseLog(receipt_logs[0]);
		let numActions = await newStakingWallet.numStakeActions();
		let numDeposits = await newStakingWallet.numETHDeposits();
		await expect(newStakingWallet.claimReward(numActions.toNumber(),0)).to.be.revertedWith("Invalid stakeActionId.");
		await expect(newStakingWallet.claimReward(0,numDeposits.toNumber())).to.be.revertedWith("Invalid ETHDepositId.");
	});
	it("It is not possible to claim reward from StakingWallet if deposit to sender address fails", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
		} = await loadFixture(deployCosmic);

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		const StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address, randomWalkNFT.address, owner.address, addr1.address);
		await newStakingWallet.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWallet.address, true);

		const BrokenStaker = await ethers.getContractFactory("BrokenStaker");
		let brokenStaker = await BrokenStaker.deploy(newStakingWallet.address,newCosmicSignature.address);
		await brokenStaker.deployed();
		await newCosmicSignature.setApprovalForAll(stakingWallet.address, true);

		await newCosmicSignature.mint(brokenStaker.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		let tx = await brokenStaker.doStake(0,false);
		let receipt = await tx.wait();
		let topic_sig = newStakingWallet.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWallet.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWallet.stakeActions(0);
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWallet.connect(addr1).stake(1,false); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send("evm_setNextBlockTimestamp", [stakeRecord.unstakeEligibleTime + 1]);

		tx = await newStakingWallet.deposit({value:ethers.utils.parseEther("2")});
		receipt = await tx.wait();
		topic_sig = newStakingWallet.interface.getEventTopic("EthDepositEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWallet.interface.parseLog(receipt_logs[0]);

		await brokenStaker.doUnstake(0);
		await brokenStaker.startBlockingDeposits();

		await expect(brokenStaker.doClaimReward(0,0)).to.be.revertedWith("Reward transfer failed.");

    });
	it("Changing charity address works", async function () {
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

		await stakingWallet.setCharity(addr1.address);
		let charityAddr = await stakingWallet.charity();
		expect(charityAddr).to.equal(addr1.address);
		await expect(stakingWallet.connect(addr1).setCharity(addr2.address)).to.be.revertedWith("Ownable: caller is not the owner");
	});
	it("Settimg niminal stake period works", async function () {
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

		await stakingWallet.setMinStakePeriod(ethers.BigNumber.from("3600"));
		let minStakePeriod = await stakingWallet.minStakePeriod();
		expect(minStakePeriod.toString()).to.equal("3600");
		await expect(stakingWallet.connect(addr1).setMinStakePeriod(ethers.BigNumber.from("7200"))).to.be.revertedWith("Ownable: caller is not the owner");
	});
	it("Unstake date is correctly set", async function () {
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

		await stakingWallet.setMinStakePeriod(ethers.BigNumber.from("3600"));
		let minStakePeriod = await stakingWallet.minStakePeriod();
		expect(minStakePeriod.toString()).to.equal("3600");
		await expect(stakingWallet.connect(addr1).setMinStakePeriod(ethers.BigNumber.from("7200"))).to.be.revertedWith("Ownable: caller is not the owner");
	});
	it("Internal staker state variables for checking uniquness are correctly set", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);

		const NewStakingWallet = await ethers.getContractFactory("TestStakingWallet");
		let newStakingWallet = await NewStakingWallet.deploy(cosmicSignature.address,cosmicSignature.address, cosmicGame.address,charityWallet.address);
        await newStakingWallet.deployed();
		await cosmicGame.setStakingWallet(newStakingWallet.address);
		await cosmicGame.setRuntimeMode();

		let sampleTokenId = 33;
		let tokenStaked = await newStakingWallet.isTokenStakedCST(sampleTokenId);
		expect(tokenStaked).to.equal(false);
		await newStakingWallet.insertTokenCST(sampleTokenId,0);
		let tokenIndexCheck = await newStakingWallet.tokenIndicesCST(sampleTokenId);
		expect(tokenIndexCheck).to.equal(1);
		let tokenIdCheck = await newStakingWallet.stakedTokensCST(tokenIndexCheck-1);
		expect(tokenIdCheck).to.equal(sampleTokenId);
		await expect(newStakingWallet.insertTokenCST(sampleTokenId,0)).to.be.revertedWith("Token already in the list.");

		let numTokens = await newStakingWallet.numTokensStakedCST();
		expect(numTokens).to.equal(1);

		await newStakingWallet.removeTokenCST(sampleTokenId);
		await expect(newStakingWallet.removeTokenCST(owner.address)).to.be.revertedWith("Token is not in the list.");
		let bidPrice = await cosmicGame.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGame.bid(params, { value: bidPrice }));
		
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		await cosmicGame.claimPrize();
		await cosmicSignature.setApprovalForAll(newStakingWallet.address, true);
		await newStakingWallet.stake(0,false);
		await expect(newStakingWallet.insertTokenCST(0,0)).to.be.revertedWith("Token already in the list.");
		numTokens = await newStakingWallet.numTokensStakedCST();
		expect(numTokens).to.equal(1);
		await ethers.provider.send("evm_increaseTime", [86400*60]);
		await ethers.provider.send("evm_mine");
		await expect(newStakingWallet.unstake(0)).not.to.be.reverted;
		numTokens = await newStakingWallet.numTokensStakedCST();
		expect(numTokens).to.equal(0);
		await expect(newStakingWallet.removeTokenCST(0)).to.be.revertedWith("Token is not in the list.");

		let tokenList = []; 
		let flagList = []
		let totSup = await cosmicSignature.totalSupply();
		for (let i=0;i<totSup.toNumber(); i++) {
			tokenList.push(i);
			flagList.push(false);
		}
		// check 'many' type calls
		tx = await newStakingWallet.stakeMany(tokenList,flagList);
		receipt = await tx.wait();
		topic_sig = newStakingWallet.interface.getEventTopic("StakeActionEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let actions = [];
		let tokenId = 0;
		for (let i=0; i<receipt_logs.length; i++) {
			let evt = newStakingWallet.interface.parseLog(receipt_logs[i]);
			actions.push(evt.args.actionId);
			tokenId = evt.args.tokenId;
		}
		await expect(newStakingWallet.insertTokenCST(tokenId,0)).to.be.revertedWith("Token already in the list.");
		await ethers.provider.send("evm_increaseTime", [86400*60]);
		await ethers.provider.send("evm_mine");
		let numToksBefore = await newStakingWallet.numTokensStakedCST();
		await expect(newStakingWallet.unstakeMany(actions)).not.to.be.reverted;
		numToksAfter = await newStakingWallet.numTokensStakedCST();
		expect(numToksAfter).to.equal(0);
		// end of check
	
		// repeat the process again, and expect 0 tokens staked at the end
		// check 'many'
		tx = await newStakingWallet.stakeMany(tokenList,flagList);
		receipt = await tx.wait();
		topic_sig = newStakingWallet.interface.getEventTopic("StakeActionEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		actions = [];
		for (let i=0; i<receipt_logs.length; i++) {
			let evt = newStakingWallet.interface.parseLog(receipt_logs[i]);
			actions.push(evt.args.actionId);
		}
		await ethers.provider.send("evm_increaseTime", [86400*60]);
		await ethers.provider.send("evm_mine");
		numStakerToksBefore = await newStakingWallet.numTokensStakedCST();
		await expect(newStakingWallet.unstakeMany(actions)).not.to.be.reverted;
		numToksAfter= await newStakingWallet.numTokensStakedCST();
		expect(numToksAfter).to.equal(0);
		// end of check
		
		let contractBalance = await ethers.provider.getBalance(stakingWallet.address);
        let m = await stakingWallet.modulo();
        expect(m).to.equal(contractBalance);
	});
	
	it("User stakes his 10 RandomWalk tokens and gets all 10 tokens back after claim", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,true);

		for(let i=0; i < 10 ;i++) {
			let tokenPrice = await randomWalkNFT.getMintPrice();
			await randomWalkNFT.mint({ value: tokenPrice })
		}
		for (let i=0; i < 10; i++) {
			await randomWalkNFT.setApprovalForAll(stakingWallet.address, true);
			let tx = await stakingWallet.stake(i,true);
		}

		let bidPrice = await cosmicGame.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await cosmicGame.claimPrize();

		// forward timestamp se we can unstake
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(60*3600*24).toNumber()]);
		await ethers.provider.send("evm_mine");

		for (let i=0; i < 10; i++) {
			await stakingWallet.unstake(i);
			let o = await randomWalkNFT.ownerOf(i);
			expect(o).to.equal(owner.address);
		}

	})
	it("User stakes his 10 CosmicSignature tokens and gets all 10 tokens back after claim", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);

		let CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let StakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await StakingWallet.deploy(newCosmicSignature.address,randomWalkNFT.address,cosmicGame.address,charityWallet.address);
		await cosmicGame.setStakingWallet(newStakingWallet.address);
		await cosmicGame.setRuntimeMode();

		for(let i=0; i < 10 ;i++) {
			await newCosmicSignature.mint(owner.address,0);
		}
		for (let i=0; i < 10; i++) {
			await newCosmicSignature.setApprovalForAll(newStakingWallet.address, true);
			let tx = await newStakingWallet.stake(i,false);
		}

		let bidPrice = await cosmicGame.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await cosmicGame.claimPrize();

		// forward timestamp se we can unstake
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(60*3600*24).toNumber()]);
		await ethers.provider.send("evm_mine");

		for (let i=0; i < 10; i++) {
			await newStakingWallet.unstake(i);
			let o = await newCosmicSignature.ownerOf(i);
			expect(o).to.equal(owner.address);
		}
	})
	it("StakingWallet is properly distributing prize amount() (modulo check)", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
		} = await loadFixture(deployCosmic);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr1).claimPrize();

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr2).claimPrize();

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr3).claimPrize();

		await cosmicSignature.connect(addr1).setApprovalForAll(stakingWallet.address, true);
		await cosmicSignature.connect(addr2).setApprovalForAll(stakingWallet.address, true);
		await cosmicSignature.connect(addr3).setApprovalForAll(stakingWallet.address, true);

		// make all winners to stake their tokens
		let CSTtotalSupply = await cosmicSignature.totalSupply();
		for (let i = 0; i < CSTtotalSupply.toNumber(); i++) {
			let o = await cosmicSignature.ownerOf(i);
			let ownerSigner = cosmicSignature.provider.getSigner(o);
			await stakingWallet.connect(ownerSigner).stake(i,false);
		}

		// at this point we have initial data with 3 token holders (holding 1 or more
		// CS tokens) with stake operation executed. Now we are ready to test staking

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);

		let previousModulo = await stakingWallet.modulo();
		let previousStakingAmount = await cosmicGame.stakingAmount();
		let csTotalSupply = await cosmicSignature.totalSupply();
		let roundNum = await cosmicGame.roundNum();
		let tx = await cosmicGame.connect(addr3).claimPrize();
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("EthDepositEvent");
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = stakingWallet.interface.parseLog(log);
		let depositRecord = await stakingWallet.ETHDeposits(parsed_log.args.depositNum);
		let amountInRound = depositRecord.depositAmount.div(depositRecord.numStaked);
		let moduloInRound = depositRecord.depositAmount.mod(depositRecord.numStaked);
		expect(parsed_log.args.amount).to.equal(previousStakingAmount);
		expect(parsed_log.args.modulo).to.equal(moduloInRound);
	});
	it("unstakeClaimRestake() works as intended", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.deployed();

		const NewStakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await NewStakingWallet.deploy(newCosmicSignature.address,randomWalkNFT.address, owner.address,charityWallet.address);
        await newStakingWallet.deployed();

		let own = await cosmicSignature.owner();
		await newCosmicSignature.connect(owner).setApprovalForAll(newStakingWallet.address, true);
		await newCosmicSignature.connect(owner).mint(owner.address, 0);
		await newCosmicSignature.connect(owner).mint(owner.address, 0);
		await newStakingWallet.connect(owner).stake(0,false);
		await newStakingWallet.connect(owner).stake(1,false);

		await ethers.provider.send("evm_increaseTime", [60]);
		await ethers.provider.send("evm_mine");

		await newStakingWallet.connect(owner).deposit({value:ethers.utils.parseEther("3")});
		await ethers.provider.send("evm_increaseTime", [50*60*60*24]);
		await ethers.provider.send("evm_mine");

		let balanceBefore = await ethers.provider.getBalance(owner.address);
		await newStakingWallet.connect(owner).unstakeClaimRestake(0,0);
		await newStakingWallet.connect(owner).unstakeClaimRestake(1,0);
		// test success is validated by token ownership, if owner is StakingWallet
		// then restake operation has been successsful
		let o = await newCosmicSignature.ownerOf(0);
		expect(o).to.equal(newStakingWallet.address);
		o = await newCosmicSignature.ownerOf(1);
		expect(o).to.equal(newStakingWallet.address);
		// we also make another validation, balance of owner should be at least 1 ETH bigger
		// then before unstake (because the deposit is for 3 ETH)
		let balanceAfter = await ethers.provider.getBalance(owner.address);
		let balDiff = balanceAfter.sub(balanceBefore);
		let twoEth = ethers.utils.parseEther("2");
		expect(balDiff.gt(twoEth)).to.equal(true);
	});
	it("unstakeClaimRestakeMany() works as intended", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.deployed();

		const NewStakingWallet = await ethers.getContractFactory("StakingWallet");
		let newStakingWallet = await NewStakingWallet.deploy(newCosmicSignature.address,randomWalkNFT.address, owner.address,charityWallet.address);
        await newStakingWallet.deployed();

		let own = await cosmicSignature.owner();
		await newCosmicSignature.connect(owner).setApprovalForAll(newStakingWallet.address, true);
		await newCosmicSignature.connect(owner).mint(owner.address, 0);
		await newCosmicSignature.connect(owner).mint(owner.address, 0);
		await newStakingWallet.connect(owner).stake(0,false);
		await newStakingWallet.connect(owner).stake(1,false);

		await ethers.provider.send("evm_increaseTime", [60]);
		await ethers.provider.send("evm_mine");

		await newStakingWallet.connect(owner).deposit({value:ethers.utils.parseEther("3")});
		await ethers.provider.send("evm_increaseTime", [50*60*60*24]);
		await ethers.provider.send("evm_mine");


		let balanceBefore = await ethers.provider.getBalance(owner.address);
		await newStakingWallet.connect(owner).unstakeClaimRestakeMany([0,1],[0,1],[0,1],[0,0]);
		// test success is validated by token ownership, if owner is StakingWallet
		// then restake operation has been successsful
		let o = await newCosmicSignature.ownerOf(0);
		expect(o).to.equal(newStakingWallet.address);
		o = await newCosmicSignature.ownerOf(1);
		expect(o).to.equal(newStakingWallet.address);
		// we also make another validation, balance of owner should be at least 1 ETH bigger
		// then before unstake (because the deposit is for 3 ETH)
		let balanceAfter = await ethers.provider.getBalance(owner.address);
		let balDiff = balanceAfter.sub(balanceBefore);
		let twoEth = ethers.utils.parseEther("1");
		expect(balDiff.gt(twoEth)).to.equal(true);
	});
});
