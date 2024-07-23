const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const SKIP_LONG_TESTS = "1";
const { basicDeployment,basicDeploymentAdvanced } = require("../src//Deploy.js");

describe("Staking CST tests", function () {
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
			stakingWalletRWalk,
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
			stakingWalletCST,
			stakingWalletRWalk,
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		await expect(stakingWalletCST.deposit({value:ethers.utils.parseEther("2")})).to.be.revertedWithCustomError(contractErrors,"DepositFromUnauthorizedSender");

	});
	it("Shouldn't be possible to deposit to StakingWallet if the transfer to CharityWallet fails", async function () {
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
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		await cBidder.startBlockingDeposits();

		const BrokenCharity = await ethers.getContractFactory("BrokenCharity");
		let newCharity= await BrokenCharity.deploy();
		await newCharity.deployed();

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(cBidder.address, owner.address, newCharity.address);
		await newStakingWalletCST.deployed();

		await expect(newStakingWalletCST.deposit({value:ethers.utils.parseEther("2")})).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, cBidder.address);
		await newStakingWalletCST.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");
		await newStakingWalletCST.unstake(0);

		await expect(newStakingWalletCST.unstake(0)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyUnstaked");
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, cBidder.address);
		await newStakingWalletCST.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");

		await expect(newStakingWalletCST.connect(addr1).unstake(0)).to.be.revertedWithCustomError(contractErrors,"AccessError");
	});
	it("Shouldn't be possible to claim reward without executing unstake()", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, cBidder.address);
		await newStakingWalletCST.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let numStakedNFTs = await newStakingWalletCST.numStakedNFTs();
		expect(numStakedNFTs).to.equal(1);
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");
		await cosmicGame.depositStakingCST({value:ethers.utils.parseEther("2")});

		await expect(newStakingWalletCST.claimReward(0,0)).to.be.revertedWithCustomError(contractErrors,"TokenNotUnstaked");
	});
	it("Shouldn't be possible to claim deposit more than once", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, cBidder.address);
		await newStakingWalletCST.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");

		await cosmicGame.depositStakingCST({value:ethers.utils.parseEther("2")});
		expect(await newStakingWalletCST.unstake(0));
		expect(await newStakingWalletCST.claimReward(0,0));
		await expect(newStakingWalletCST.claimReward(0,0)).to.be.revertedWithCustomError(contractErrors,"DepositAlreadyClaimed");
	});
	it("Shouldn't be possible to claim deposit by a user different from the owner", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, cBidder.address);
		await newStakingWalletCST.deployed();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");

		await cosmicGame.depositStakingCST({value:ethers.utils.parseEther("2")});
		expect(await newStakingWalletCST.unstake(0));
		await expect(newStakingWalletCST.connect(addr1).claimReward(0,0)).to.be.revertedWithCustomError(contractErrors,"AccessError");
	});
	it("Shouldn't be possible to claim deposits made earlier than stakeDate", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, cBidder.address);
		await newStakingWalletCST.deployed();
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWalletCST.address, true);

		await newStakingWalletCST.connect(addr1).stake(1);
		await cosmicGame.depositStakingCST({value:ethers.utils.parseEther("2")});
		await ethers.provider.send("evm_mine");
		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let block = await stakingWalletCST.provider.getBlock(receipt.blockNumber);
		let stakeTimestamp = block.timestamp;
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");
		let depositTimestamp = stakeTimestamp - 1;
		await newStakingWalletCST.unstake(1);
		await expect(newStakingWalletCST.claimReward(1,0)).to.be.revertedWithCustomError(contractErrors,"DepositOutsideStakingWindow");
	});
	it("Shouldn't be possible to claim deposits after unstakeDate", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, addr1.address);
		await newStakingWalletCST.deployed();
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWalletCST.address, true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWalletCST.stakeActions(0);
		let numStakeActions = await newStakingWalletCST.numStakeActions();
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send("evm_increaseTime", [6000]);
		await newStakingWalletCST.unstake(0);
		await ethers.provider.send("evm_increaseTime", [6000]);
		tx = await cosmicGame.depositStakingCST({value:ethers.utils.parseEther("2")});
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEventTopic("EthDepositEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		await expect(newStakingWalletCST.claimReward(0,0)).to.be.revertedWithCustomError(contractErrors,"DepositOutsideStakingWindow");
	});
	it("Shouldn't be possible to claim deposits with invalid stakeActionId or ETHDepositId", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, addr1.address);
		await newStakingWalletCST.deployed();
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWalletCST.address, true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWalletCST.stakeActions(0);
		let numStakeActions = await newStakingWalletCST.numStakeActions();
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send("evm_increaseTime", [6000]);

		await newStakingWalletCST.unstake(0);
		tx = await cosmicGame.depositStakingCST({value:ethers.utils.parseEther("2")});
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEventTopic("EthDepositEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		let numActions = await newStakingWalletCST.numStakeActions();
		let numDeposits = await newStakingWalletCST.numETHDeposits();
		await expect(newStakingWalletCST.claimReward(numActions.toNumber(),0)).to.be.revertedWithCustomError(contractErrors,"InvalidActionId");
		await expect(newStakingWalletCST.claimReward(0,numDeposits.toNumber())).to.be.revertedWithCustomError(contractErrors,"InvalidDepositId");
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
			stakingWalletCST,
			stakingWalletRWalk,
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address, addr1.address);
		await newStakingWalletCST.deployed();
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(newStakingWalletCST.address, true);

		const BrokenStaker = await ethers.getContractFactory("BrokenStaker");
		let brokenStaker = await BrokenStaker.deploy(newStakingWalletCST.address,newCosmicSignature.address);
		await brokenStaker.deployed();
		await newCosmicSignature.setApprovalForAll(stakingWalletCST.address, true);

		await newCosmicSignature.mint(brokenStaker.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		let tx = await brokenStaker.doStake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWalletCST.stakeActions(0);
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send("evm_increaseTime", [6000]);

		tx = await cosmicGame.depositStakingCST({value:ethers.utils.parseEther("2")});
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEventTopic("EthDepositEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);

		await brokenStaker.doUnstake(0);
		await brokenStaker.startBlockingDeposits();

		await expect(brokenStaker.doClaimReward(0,0)).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		await stakingWalletCST.setCharity(addr1.address);
		let charityAddr = await stakingWalletCST.charity();
		expect(charityAddr).to.equal(addr1.address);
		await expect(stakingWalletCST.connect(addr1).setCharity(addr2.address)).to.be.revertedWith("Ownable: caller is not the owner");
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bLogic,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const NewStakingWalletCST = await ethers.getContractFactory("TestStakingWalletCST");
		let newStakingWalletCST = await NewStakingWalletCST.deploy(cosmicSignature.address,cosmicGame.address,charityWallet.address);
        await newStakingWalletCST.deployed();
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		let actTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
		await cosmicGame.setActivationTime(actTimeStamp);
		await cosmicGame.setRuntimeMode();

		let sampleTokenId = 33;
		let tokenStaked = await newStakingWalletCST.isTokenStaked(sampleTokenId);
		expect(tokenStaked).to.equal(false);
		await newStakingWalletCST.insertToken(sampleTokenId,0);
		let tokenIndexCheck = await newStakingWalletCST.tokenIndices(sampleTokenId);
		expect(tokenIndexCheck).to.equal(1);
		let tokenIdCheck = await newStakingWalletCST.stakedTokens(tokenIndexCheck-1);
		expect(tokenIdCheck).to.equal(sampleTokenId);
		await expect(newStakingWalletCST.insertToken(sampleTokenId,0)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyInserted");

		let numTokens = await newStakingWalletCST.numTokensStaked();
		expect(numTokens).to.equal(1);

		await newStakingWalletCST.removeToken(sampleTokenId);
		await expect(newStakingWalletCST.removeToken(owner.address)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyDeleted");

		let bidPrice = await cosmicGame.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGame.bid(params, { value: bidPrice }));
		
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		await cosmicGame.claimPrize();
		await cosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);

		await expect(newStakingWalletCST.insertToken(0,0)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyInserted");
		numTokens = await newStakingWalletCST.numTokensStaked();
		expect(numTokens).to.equal(1);
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");
		await expect(newStakingWalletCST.unstake(0)).not.to.be.reverted;
		numTokens = await newStakingWalletCST.numTokensStaked();
		expect(numTokens).to.equal(0);
		await expect(newStakingWalletCST.removeToken(0)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyDeleted");

		let tokenList = []; 
		let totSup = await cosmicSignature.totalSupply();
		for (let i=0;i<totSup.toNumber(); i++) {
			tokenList.push(i);
		}
		// check 'many' type calls
		tx = await newStakingWalletCST.stakeMany(tokenList);
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEventTopic("StakeActionEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let actions = [];
		let tokenId = 0;
		for (let i=0; i<receipt_logs.length; i++) {
			let evt = newStakingWalletCST.interface.parseLog(receipt_logs[i]);
			actions.push(evt.args.actionId);
			tokenId = evt.args.tokenId;
		}
		await expect(newStakingWalletCST.insertToken(tokenId,0)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyInserted");
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");
		let numToksBefore = await newStakingWalletCST.numTokensStaked();
		await expect(newStakingWalletCST.unstakeMany(actions)).not.to.be.reverted;
		numToksAfter = await newStakingWalletCST.numTokensStaked();
		expect(numToksAfter).to.equal(0);
		// end of check
	
		// repeat the process again, and expect 0 tokens staked at the end
		// check 'many'
		tx = await newStakingWalletCST.stakeMany(tokenList);
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEventTopic("StakeActionEvent");
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		actions = [];
		for (let i=0; i<receipt_logs.length; i++) {
			let evt = newStakingWalletCST.interface.parseLog(receipt_logs[i]);
			actions.push(evt.args.actionId);
		}
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");
		numStakerToksBefore = await newStakingWalletCST.numTokensStaked();
		await expect(newStakingWalletCST.unstakeMany(actions)).not.to.be.reverted;
		numToksAfter= await newStakingWalletCST.numTokensStaked();
		expect(numToksAfter).to.equal(0);
		// end of check
		
		let contractBalance = await ethers.provider.getBalance(stakingWalletCST.address);
        let m = await stakingWalletCST.modulo();
        expect(m).to.equal(contractBalance);
	});
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bLogic,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);

		let CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await StakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address,charityWallet.address);
		await cosmicGame.setStakingWalletCST(newStakingWalletCST.address);
		await cosmicGame.setRuntimeMode();

		for(let i=0; i < 10 ;i++) {
			await newCosmicSignature.mint(owner.address,0);
		}
		for (let i=0; i < 10; i++) {
			await newCosmicSignature.setApprovalForAll(newStakingWalletCST.address, true);
			let tx = await newStakingWalletCST.stake(i);
			let receipt = await tx.wait();
			let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
			let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
			let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
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
		await ethers.provider.send("evm_increaseTime", [6000]);
		await ethers.provider.send("evm_mine");

		for (let i=0; i < 10; i++) {
			await newStakingWalletCST.unstake(i);
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
			stakingWalletCST,
			stakingWalletRWalk
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

		await cosmicSignature.connect(addr1).setApprovalForAll(stakingWalletCST.address, true);
		await cosmicSignature.connect(addr2).setApprovalForAll(stakingWalletCST.address, true);
		await cosmicSignature.connect(addr3).setApprovalForAll(stakingWalletCST.address, true);

		// make all winners to stake their tokens
		let CSTtotalSupply = await cosmicSignature.totalSupply();
		for (let i = 0; i < CSTtotalSupply.toNumber(); i++) {
			let o = await cosmicSignature.ownerOf(i);
			let ownerSigner = cosmicSignature.provider.getSigner(o);
			await stakingWalletCST.connect(ownerSigner).stake(i);
		}

		// at this point we have initial data with 3 token holders (holding 1 or more
		// CS tokens) with stake operation executed. Now we are ready to test staking

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);

		let previousModulo = await stakingWalletCST.modulo();
		let previousStakingAmount = await cosmicGame.stakingAmount();
		let csTotalSupply = await cosmicSignature.totalSupply();
		let roundNum = await cosmicGame.roundNum();
		let tx = await cosmicGame.connect(addr3).claimPrize();
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEventTopic("EthDepositEvent");
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = stakingWalletCST.interface.parseLog(log);
		let depositRecord = await stakingWalletCST.ETHDeposits(parsed_log.args.depositNum);
		let amountInRound = depositRecord.depositAmount.div(depositRecord.numStaked);
		let moduloInRound = depositRecord.depositAmount.mod(depositRecord.numStaked);
		expect(parsed_log.args.amount).to.equal(previousStakingAmount);
		expect(parsed_log.args.modulo).to.equal(moduloInRound);
	});
	it("The random picking of winner from StakingWallet is really random", async function () {
		let signers = await ethers.getSigners();
		let owner = signers[0];
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bLogic,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.deployed();

		const NewStakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		let newStakingWalletCST = await NewStakingWalletCST.deploy(newCosmicSignature.address, cosmicGame.address,charityWallet.address);
        await newStakingWalletCST.deployed();

		const NewStakingWalletRWalk = await ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await NewStakingWalletRWalk.deploy(randomWalkNFT.address,cosmicGame.address);
        await newStakingWalletRWalk.deployed();

		let numSigners = 20;
		let numLoops = 20;
		let randomSeed = 11235813; // fib
		for (let i=0; i<numSigners; i++) {
			let signer = signers[i];
			await newCosmicSignature.connect(signer).setApprovalForAll(newStakingWalletCST.address, true);
			await randomWalkNFT.connect(signer).setApprovalForAll(newStakingWalletRWalk.address, true);
		}
		for (let i=0; i<numSigners; i++) {
			let signer = signers[i];
			for (let j=0; j<numLoops; j++) {
				await newCosmicSignature.connect(owner).mint(signer.address, 0);
				let tokenId = i*numLoops+ j;
				await newStakingWalletCST.connect(signer).stake(tokenId);
			}
		}
		for (let i=0; i<numSigners; i++) {
			let signer = signers[i];
			for (let j=0; j<numLoops; j++) {
				let mintPrice = await randomWalkNFT.getMintPrice();
				await randomWalkNFT.connect(signer).mint({ value: mintPrice });
				let tokenId = i*numLoops+ j;
				await newStakingWalletRWalk.connect(signer).stake(tokenId);
			}
		}
		// verification algorithm is simple: if from 400 staked tokens at least
		// 1 staker is chosen (i.e. all stakers win at least 1 token)
		// then we consider randomness works. Sample size is 100 (25% of the population)
		{
			let luckyStakers = {};
			let numSamples = 100;
			for (let i=0; i<numSamples; i++) {
				let rand = randomSeed + i;
				let bn = ethers.BigNumber.from(rand);
				let hex = bn.toHexString(bn);
				let hash = ethers.utils.keccak256(hex);
				let luckyAddr = await newStakingWalletRWalk.pickRandomStaker(hash);
				let numToks = luckyStakers[luckyAddr];
				if (numToks === undefined) {
					numToks = 0;
				}
				numToks = numToks + 1;
				luckyStakers[luckyAddr] = numToks;
			}
			for (let i=0; i<numSigners; i++) {
				let signer = signers[i];
				let numToks = luckyStakers[signer.address];
				let msg = "The raffle algorithm for holders is not random, staker "+signer.address;
				if (numToks === undefined) {
					throw msg;
				}
				if (numToks == 0) {
					throw msg;
				}
			}
		}
	})
});
