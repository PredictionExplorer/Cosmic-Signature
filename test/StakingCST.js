"use strict";

const { /*time,*/ loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
// const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');
const { basicDeployment, basicDeploymentAdvanced } = require('../src/Deploy.js');
// const { toUtf8Bytes } = require('@ethersproject/strings');

// const SKIP_LONG_TESTS = '1';

describe('Staking CST tests', function () {
	// todo-1 `deployerAcct` wasn't used, so I have commented it out. Do the same in other tests.
	async function deployCosmic(/*deployerAcct*/) {
		const [contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
		} = await basicDeployment(contractDeployerAcct, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);

		return {
			cosmicGameProxy: cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
		};
	}
	const bidParamsEncoding = {
		type: 'tuple(string,int256)',
		name: 'bidparams',
		components: [
			{ name: 'msg', type: 'string' },
			{ name: 'rwalk', type: 'int256' }
		]
	};
	it("Shouldn't be possible to deposit to StakingWalletCST from arbitrary address", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmic);
		// const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		await expect(stakingWalletCST.depositIfPossible({ value: ethers.parseEther('2') })).to.be.revertedWithCustomError(
			contractErrors,
			'DepositFromUnauthorizedSender'
		);
	});

	// // Comment-202409209 applies.
	// it("Shouldn't be possible to deposit to StakingWalletCST if the transfer to CharityWallet fails", async function () {
	// 	const {
	// 		cosmicGameProxy,
	// 		cosmicToken,
	// 		cosmicSignature,
	// 		charityWallet,
	// 		cosmicDAO,
	// 		randomWalkNFT,
	// 		raffleWallet,
	// 		stakingWalletCST,
	// 		stakingWalletRWalk,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await loadFixture(deployCosmic);
	// 	const [owner, addr1, addr2, addr3] = await ethers.getSigners();
	// 	const contractErrors = await ethers.getContractFactory('CosmicGameErrors');
	//
	// 	const BidderContract = await ethers.getContractFactory('BidderContract');
	// 	const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
	// 	await cBidder.waitForDeployment();
	// 	await cBidder.startBlockingDeposits();
	//
	// 	const BrokenCharity = await ethers.getContractFactory('BrokenCharity');
	// 	const newCharity = await BrokenCharity.deploy();
	// 	await newCharity.waitForDeployment();
	//
	// 	const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
	// 	// todo-9 The 3rd parameter no longer exists.
	// 	const newStakingWalletCST = await StakingWalletCST.deploy(await cBidder.getAddress(), owner.address, await newCharity.getAddress());
	// 	await newStakingWalletCST.waitForDeployment();
	//
	// 	await expect(
	// 		// todo-9 This function has been replaced with `depositIfPossible`.
	// 		newStakingWalletCST.deposit({ value: ethers.parseEther('2') })
	// 	).to.be.revertedWithCustomError(contractErrors, 'FundTransferFailed');
	// });

	it("Shouldn't be possible to unstake() twice", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await owner.address
			// await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		const tx = await newStakingWalletCST.stakeMany([0,1]);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);

		expect(await newStakingWalletCST.lastActionIdByTokenId(0)).to.equal(0);
		expect(await newStakingWalletCST.stakerByTokenId(0)).to.equal(owner.address);
		expect(await newStakingWalletCST.stakerByTokenId(99n)).to.equal(ethers.ZeroAddress);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		await newStakingWalletCST.unstake(0);

		await expect(newStakingWalletCST.unstake(0)).to.be.revertedWithCustomError(
			contractErrors,
			'TokenAlreadyUnstaked'
		);
		expect(await newStakingWalletCST.wasTokenUsed(0)).to.equal(true);

		await expect(newStakingWalletCST.depositIfPossible({ value: ethers.parseEther('1') })).not.to.be.reverted;
		await expect(newStakingWalletCST.depositIfPossible({ value: ethers.parseEther('2') })).not.to.be.reverted;
		expect(await newStakingWalletCST.numETHDeposits()).to.equal(1n);
		const d = await newStakingWalletCST.ETHDeposits(0);
		expect(d.depositAmount).to.equal(ethers.parseEther('3'));
	});
	it("Shouldn't be possible to unstake by a user different from the owner", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		const tx = await newStakingWalletCST.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		await expect(newStakingWalletCST.connect(addr1).unstake(0)).to.be.revertedWithCustomError(
			contractErrors,
			'AccessError'
		);
	});
	it("Shouldn't be possible to claim reward without executing unstake()", async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		const tx = await newStakingWalletCST.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		const unstakeTime = log.args.unstakeTime;
		const numStakedNFTs = await newStakingWalletCST.numStakedNFTs();
		expect(numStakedNFTs).to.equal(1);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		await expect(cosmicGameProxy.depositStakingCSTIfPossible({ value: ethers.parseEther('2') })).not.to.be.reverted;

		await expect(newStakingWalletCST.claimManyRewards([0], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'TokenNotUnstaked'
		);
	});
	it("Shouldn't be possible to claim deposit more than once", async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		const tx = await newStakingWalletCST.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		const unstakeTime = log.args.unstakeTime;
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		await expect(cosmicGameProxy.depositStakingCSTIfPossible({ value: ethers.parseEther('2') })).not.to.be.reverted;
		await expect(newStakingWalletCST.unstake(0)).not.to.be.reverted;
		await expect(newStakingWalletCST.claimManyRewards([0], [0])).not.to.be.reverted;
		await expect(newStakingWalletCST.claimManyRewards([0], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'DepositAlreadyClaimed'
		);
	});
	it("Shouldn't be possible to claim deposit by a user different from the owner", async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		const tx = await newStakingWalletCST.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		const unstakeTime = log.args.unstakeTime;
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		await expect(cosmicGameProxy.depositStakingCSTIfPossible({ value: ethers.parseEther('2') })).not.to.be.reverted;
		await newStakingWalletCST.unstake(0);
		await expect(newStakingWalletCST.connect(addr1).claimManyRewards([0], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'AccessError'
		);
	});
	it("Shouldn't be possible to claim deposits made earlier than stakeDate", async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		await newStakingWalletCST.connect(addr1).stake(1);
		await expect(cosmicGameProxy.depositStakingCSTIfPossible({ value: ethers.parseEther('2') })).not.to.be.reverted;
		await ethers.provider.send('evm_mine');
		const tx = await newStakingWalletCST.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		const block = await ethers.provider.getBlock(receipt.blockNumber);
		const stakeTimestamp = block.timestamp;
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		const depositTimestamp = stakeTimestamp - 1;
		await newStakingWalletCST.unstake(1);
		await expect(newStakingWalletCST.claimManyRewards([1], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'DepositOutsideStakingWindow'
		);
	});
	it("Shouldn't be possible to claim deposits after unstakeDate", async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// addr1.address
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		const unstakeTime = log.args.unstakeTime;
		const stakeRecord = await newStakingWalletCST.stakeActions(0);
		const numStakeActions = await newStakingWalletCST.numStakeActions();
		const stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise the deposit would be rejected
		await ethers.provider.send('evm_increaseTime', [6000]);
		await newStakingWalletCST.unstake(0);
		await ethers.provider.send('evm_increaseTime', [6000]);
		tx = /*await*/ cosmicGameProxy.depositStakingCSTIfPossible({ value: ethers.parseEther('2') });
		await expect(tx).not.to.be.reverted;
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEvent('EthDepositEvent').topicHash;
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		await expect(newStakingWalletCST.claimManyRewards([0], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'DepositOutsideStakingWindow'
		);
	});
	it("Shouldn't be possible to claim deposits with invalid stakeActionId or ETHDepositId", async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// addr1.address
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		const unstakeTime = log.args.unstakeTime;
		const stakeRecord = await newStakingWalletCST.stakeActions(0);
		const numStakeActions = await newStakingWalletCST.numStakeActions();
		const stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise the deposit would be rejected
		await ethers.provider.send('evm_increaseTime', [6000]);

		await newStakingWalletCST.unstake(0);
		tx = /*await*/ cosmicGameProxy.depositStakingCSTIfPossible({ value: ethers.parseEther('2') });
		await expect(tx).not.to.be.reverted;
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEvent('EthDepositEvent').topicHash;
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		const numActions = await newStakingWalletCST.numStakeActions();
		const numDeposits = await newStakingWalletCST.numETHDeposits();
		await expect(newStakingWalletCST.claimManyRewards([numActions], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidActionId'
		);
		await expect(newStakingWalletCST.claimManyRewards([0], [numDeposits])).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidDepositId'
		);
	});
	it('It is not possible to claim reward from StakingWalletCST if deposit to sender address fails', async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		newCosmicSignature.waitForDeployment();
		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// addr1.address
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		const BrokenStakingWalletCST = await ethers.getContractFactory('BrokenStakingWalletCST');
		const brokenStakingWalletCST = await BrokenStakingWalletCST.deploy();
		await brokenStakingWalletCST.waitForDeployment();
		await brokenStakingWalletCST.setStakingWallet(await newStakingWalletCST.getAddress());
		await brokenStakingWalletCST.doSetApprovalForAll(await newCosmicSignature.getAddress());
		await newCosmicSignature.setApprovalForAll(await stakingWalletCST.getAddress(), true);

		await newCosmicSignature.mint(await brokenStakingWalletCST.getAddress(), 0);
		await newCosmicSignature.mint(addr1.address, 0);

		let tx = await brokenStakingWalletCST.doStake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		const unstakeTime = log.args.unstakeTime;
		const stakeRecord = await newStakingWalletCST.stakeActions(0);
		const stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise the deposit would be rejected
		await ethers.provider.send('evm_increaseTime', [6000]);

		tx = /*await*/ cosmicGameProxy.depositStakingCSTIfPossible({ value: ethers.parseEther('2') });
		await expect(tx).not.to.be.reverted;
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEvent('EthDepositEvent').topicHash;
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);

		await brokenStakingWalletCST.doUnstake(0);
		await brokenStakingWalletCST.startBlockingDeposits();

		await expect(brokenStakingWalletCST.doClaimReward(0, 0)).to.be.revertedWithCustomError(
			contractErrors,
			'FundTransferFailed'
		);
	});

	// // [Comment-202409209]
	// // This test no longer makes sense because `StakingWalletCST` no longer sends funds to charity,
	// // and doesn't even store charity address.
	// // One implication of that refactoring is that a deposit to `StakingWalletCST` is not supposed to fail under normal conditions.
	// // It is, however, possible that `StakingWalletCST` will reject the deposit, which we consider an expected error.
	// // todo-0 Nick, you might want to develop similar tests for the cases listed in ToDo-202409226-0.
	// // todo-0 Once you are done, remove ToDo-202409226-0 and all mentionings of it.
	// // Comment-202409208 relates.
	// // [/Comment-202409209]
	// it('A failure to deposit to StakingWalletCST shouldn\'t abort the process of claiming main prize', async function () {
	// 	const [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
	// 	const {
	// 		cosmicGameProxy,
	// 		cosmicToken,
	// 		cosmicSignature,
	// 		charityWallet,
	// 		cosmicDAO,
	// 		raffleWallet,
	// 		randomWalkNFT,
	// 		stakingWalletCST,
	// 		stakingWalletRWalk
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true,
	// 		false
	// 	);
	// 	const contractErrors = await ethers.getContractFactory('CosmicGameErrors');
	//
	// 	const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
	// 	const newCosmicSignature = await CosmicSignature.deploy(owner.address);
	// 	newCosmicSignature.waitForDeployment();
	//
	// 	const BrokenStakingWalletCST = await ethers.getContractFactory('BrokenStakingWalletCST');
	// 	const brokenStakingWalletCST = await BrokenStakingWalletCST.deploy();
	// 	await brokenStakingWalletCST.waitForDeployment();
	//
	// 	const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
	// 	const newStakingWalletCST = await StakingWalletCST.deploy(
	// 		await newCosmicSignature.getAddress(),
	// 		await brokenStakingWalletCST.getAddress()
	//			// todo-9 The 3rd parameter no longer exists.
	// 		addr1.address
	// 	);
	// 	await newStakingWalletCST.waitForDeployment();
	// 	await brokenStakingWalletCST.setStakingWallet(await newStakingWalletCST.getAddress());
	// 	await brokenStakingWalletCST.doSetApprovalForAll(await newCosmicSignature.getAddress());
	// 	await brokenStakingWalletCST.startBlockingDeposits();
	//
	// 	await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
	// 	await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
	// 	await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCST.getAddress(), true);
	//
	// 	await cosmicGameProxy.setStakingWalletCST(brokenStakingWalletCST);
	// 	await cosmicGameProxy.setRuntimeMode();
	//
	// 	await newCosmicSignature.setApprovalForAll(await stakingWalletCST.getAddress(), true);
	// 	await newCosmicSignature.mint(await brokenStakingWalletCST.getAddress(), 0);
	// 	await newCosmicSignature.mint(addr1.address, 0);
	//
	// 	await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise the deposit would be rejected
	// 	await ethers.provider.send('evm_increaseTime', [6000]); // prepare for unstake
	//
	// 	const bidPrice = await cosmicGameProxy.getBidPrice();
	// 	const bidParams = { msg: '', rwalk: -1 };
	// 	const params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicGameProxy.bid(params, { value: bidPrice });
	//
	// 	const prizeTime = await cosmicGameProxy.timeUntilPrize();
	// 	await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await ethers.provider.send('evm_mine');
	//
	// 	await expect(cosmicGameProxy.claimPrize()).not.to.be.reverted;
	// });

	// // Comment-202409209 applies.
	// it('Changing charity address works', async function () {
	// 	const {
	// 		cosmicGameProxy,
	// 		cosmicToken,
	// 		cosmicSignature,
	// 		charityWallet,
	// 		cosmicDAO,
	// 		randomWalkNFT,
	// 		raffleWallet,
	// 		stakingWalletCST,
	// 		stakingWalletRWalk,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await loadFixture(deployCosmic);
	// 	const [owner, addr1, addr2, addr3] = await ethers.getSigners();
	//
	// 	await stakingWalletCST.setCharity(addr3.address);
	// 	const charityAddr = await stakingWalletCST.charity();
	// 	expect(charityAddr).to.equal(addr3.address);
	// 	await expect(stakingWalletCST.connect(addr1).setCharity(addr2.address))
	// 		.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	// });

	it('Internal staker state variables for checking uniquness are correctly set', async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
		} = await basicDeployment(owner, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false, false);
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');
		
		// todo-1 Is this still true, given that the test passes?
		// * THIS TEST IS BROKEN for unknown reasons (hardhat trace hangs, no way to know, pending for deep debugging)
		const NewStakingWalletCST = await ethers.getContractFactory('TestStakingWalletCST');
		const newStakingWalletCST = await NewStakingWalletCST.deploy(
			await cosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// await charityWallet.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		const actTimeStamp = (await ethers.provider.getBlock('latest')).timestamp;
		await cosmicGameProxy.setActivationTime(actTimeStamp);
		await cosmicGameProxy.setRuntimeMode();

		const sampleTokenId = 33;
		const tokenStaked = await newStakingWalletCST.isTokenStaked(sampleTokenId);
		expect(tokenStaked).to.equal(false);
		await newStakingWalletCST.insertToken(sampleTokenId, 0);
		const tokenIndexCheck = await newStakingWalletCST.tokenIndices(sampleTokenId);
		expect(tokenIndexCheck).to.equal(1);
		const tokenIdCheck = await newStakingWalletCST.stakedTokens(Number(tokenIndexCheck) - 1);
		expect(tokenIdCheck).to.equal(sampleTokenId);
		await expect(newStakingWalletCST.insertToken(sampleTokenId, 0)).to.be.revertedWithCustomError(
			contractErrors,
			'TokenAlreadyInserted'
		);

		await newStakingWalletCST.removeToken(sampleTokenId);
		await expect(newStakingWalletCST.removeToken(sampleTokenId)).to.be.revertedWithCustomError(
			contractErrors,
			'TokenAlreadyDeleted'
		);

		const bidPrice = await cosmicGameProxy.getBidPrice();
		const bidParams = { msg: '', rwalk: -1 };
		const params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		await ethers.provider.send('evm_mine');
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await cosmicGameProxy.claimPrize();
		
		await cosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		const tx = await newStakingWalletCST.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);

		await expect(newStakingWalletCST.insertToken(0, 0)).to.be.revertedWithCustomError(
			contractErrors,
			'TokenAlreadyInserted'
		);
		let numTokens = await newStakingWalletCST.numTokensStaked();
		expect(numTokens).to.equal(1);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		await expect(newStakingWalletCST.unstake(0)).not.to.be.reverted;
		numTokens = await newStakingWalletCST.numTokensStaked();
		expect(numTokens).to.equal(0);
		await expect(newStakingWalletCST.removeToken(0)).to.be.revertedWithCustomError(
			contractErrors,
			'TokenAlreadyDeleted'
		);

		const tokenList = [];
		const totSup = await cosmicSignature.totalSupply();
		for (let i = 0; i < Number(totSup); i++) {
			tokenList.push(i);
		}

		// // Comment-202409208 relates.
		// const contractBalance = await ethers.provider.getBalance(await stakingWalletCST.getAddress());
		// const m = await stakingWalletCST.modulo();
		// expect(m).to.equal(contractBalance);
	});
	it('User stakes his 10 CosmicSignature tokens and gets all 10 tokens back after claim', async function () {
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
		} = await basicDeployment(owner, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false, false);

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress()
			// await charityWallet.getAddress()
		);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		for (let i = 0; i < 10; i++) {
			await newCosmicSignature.mint(owner.address, 0);
		}
		for (let i = 0; i < 10; i++) {
			await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
			const tx = await newStakingWalletCST.stake(i);
			const receipt = await tx.wait();
			const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
			const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
			const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		}

		const bidPrice = await cosmicGameProxy.getBidPrice();
		const bidParams = { msg: '', rwalk: -1 };
		const params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		const prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		await cosmicGameProxy.claimPrize();

		// forward timestamp se we can unstake
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		for (let i = 4; i < 10; i++) {
			await newStakingWalletCST.unstake(i);
			const o = await newCosmicSignature.ownerOf(i);
			expect(o).to.equal(owner.address);
		}
		await newStakingWalletCST.unstakeClaim(0,0);
		await newStakingWalletCST.unstakeClaimMany([1],[1],[0]);
		await newStakingWalletCST.unstakeMany([2,3]);
	});

	// // Comment-202409208 relates.
	// it('StakingWalletCST is properly distributing prize amount() (modulo check)', async function () {
	// 	const [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
	// 	const {
	// 		cosmicGameProxy,
	// 		cosmicToken,
	// 		cosmicSignature,
	// 		charityWallet,
	// 		cosmicDAO,
	// 		raffleWallet,
	// 		randomWalkNFT,
	// 		stakingWalletCST,
	// 		stakingWalletRWalk
	// 	} = await loadFixture(deployCosmic);
	//
	// 	let bidPrice = await cosmicGameProxy.getBidPrice();
	// 	let bidParams = { msg: '', rwalk: -1 };
	// 	let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
	// 	let prizeTime = await cosmicGameProxy.timeUntilPrize();
	// 	await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await cosmicGameProxy.connect(addr1).claimPrize();
	//
	// 	bidPrice = await cosmicGameProxy.getBidPrice();
	// 	bidParams = { msg: '', rwalk: -1 };
	// 	params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
	// 	prizeTime = await cosmicGameProxy.timeUntilPrize();
	// 	await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await cosmicGameProxy.connect(addr2).claimPrize();
	// 	bidPrice = await cosmicGameProxy.getBidPrice();
	// 	bidParams = { msg: '', rwalk: -1 };
	// 	params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
	// 	prizeTime = await cosmicGameProxy.timeUntilPrize();
	// 	await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await cosmicGameProxy.connect(addr3).claimPrize();
	//
	// 	await cosmicSignature.connect(addr1).setApprovalForAll(await stakingWalletCST.getAddress(), true);
	// 	await cosmicSignature.connect(addr2).setApprovalForAll(await stakingWalletCST.getAddress(), true);
	// 	await cosmicSignature.connect(addr3).setApprovalForAll(await stakingWalletCST.getAddress(), true);
	//
	// 	// make all winners to stake their tokens
	// 	const CSTtotalSupply = await cosmicSignature.totalSupply();
	// 	for (let i = 0; i < Number(CSTtotalSupply); i++) {
	// 		const o = await cosmicSignature.ownerOf(i);
	// 		const ownerSigner = await ethers.getSigner(o);
	// 		await stakingWalletCST.connect(ownerSigner).stake(i);
	// 	}
	//
	// 	// at this point we have initial data with 3 token holders (holding 1 or more
	// 	// CS tokens) with stake operation executed. Now we are ready to test staking
	//
	// 	bidPrice = await cosmicGameProxy.getBidPrice();
	// 	bidParams = { msg: '', rwalk: -1 };
	// 	params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
	// 	prizeTime = await cosmicGameProxy.timeUntilPrize();
	// 	await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	//
	// 	const previousModulo = await stakingWalletCST.modulo();
	// 	const previousStakingAmount = await cosmicGameProxy.stakingAmount();
	// 	const csTotalSupply = await cosmicSignature.totalSupply();
	// 	const roundNum = await cosmicGameProxy.roundNum();
	// 	const tx = await cosmicGameProxy.connect(addr3).claimPrize();
	// 	const receipt = await tx.wait();
	// 	const topic_sig = stakingWalletCST.interface.getEvent('EthDepositEvent').topicHash;
	// 	const log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const parsed_log = stakingWalletCST.interface.parseLog(log);
	// 	const depositRecord = await stakingWalletCST.ETHDeposits(parsed_log.args.depositNum);
	// 	const amountInRound = depositRecord.depositAmount/depositRecord.numStaked;
	// 	const moduloInRound = depositRecord.depositAmount % depositRecord.numStaked;
	// 	expect(parsed_log.args.amount).to.equal(previousStakingAmount);
	// 	expect(parsed_log.args.modulo).to.equal(moduloInRound);
	//
	// 	await stakingWalletCST.moduloToCharity();
	// });

	it('The random picking of winner from StakingWalletCST is really random', async function () {
		const signers = await ethers.getSigners();
		const owner = signers[0];
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
		} = await basicDeployment(owner, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false, false);

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.waitForDeployment();

		const NewStakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await NewStakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			// await charityWallet.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();

		const NewStakingWalletRWalk = await ethers.getContractFactory('StakingWalletRWalk');
		const newStakingWalletRWalk = await NewStakingWalletRWalk.deploy(await randomWalkNFT.getAddress());
		await newStakingWalletRWalk.waitForDeployment();

		const numSigners = 20;
		const numLoops = 20;
		// const randomSeed = 11235813; // fib
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			await newCosmicSignature.connect(signer).setApprovalForAll(await newStakingWalletCST.getAddress(), true);
			await randomWalkNFT.connect(signer).setApprovalForAll(await newStakingWalletRWalk.getAddress(), true);
		}
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			for (let j = 0; j < numLoops; j++) {
				await newCosmicSignature.connect(owner).mint(signer.address, 0);
				const tokenId = i * numLoops + j;
				await newStakingWalletCST.connect(signer).stake(tokenId);
			}
		}
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			for (let j = 0; j < numLoops; j++) {
				const mintPrice = await randomWalkNFT.getMintPrice();
				await randomWalkNFT.connect(signer).mint({ value: mintPrice });
				const tokenId = i * numLoops + j;
				await newStakingWalletRWalk.connect(signer).stake(tokenId);
			}
		}
		// verification algorithm is simple: if from 400 staked tokens at least
		// 1 staker is chosen (i.e. all stakers win at least 1 token)
		// then we consider randomness works. Sample size is 100 (25% of the population)
		{
			const luckyStakers = {};
			const numSamples = 1000;
			for (let i = 0; i < numSamples; i++) {
				const r = Math.floor(Math.random() * 0xffffff).toString(16).padEnd(6, "0")
				const luckyAddr = await newStakingWalletRWalk.pickRandomStaker(ethers.hashMessage('0x'+r));
				let numToks = luckyStakers[luckyAddr];
				if (numToks === undefined) {
					numToks = 0;
				}
				numToks = numToks + 1;
				luckyStakers[luckyAddr] = numToks;
			}
			for (let i = 0; i < numSigners; i++) {
				const signer = signers[i];
				const numToks = luckyStakers[signer.address];
				const msg = 'The raffle algorithm for holders is not random, staker ' + signer.address;
				if (numToks === undefined) {
					throw msg;
				}
				if (numToks == 0) {
					throw msg;
				}
			}
		}
	});
	it("Shouldn't be possible to use a token twice for stake/unstake", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await ethers.getSigners();
		const contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// const BidderContract = await ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		const newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		const newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			// await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		const tx = await newStakingWalletCST.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		await newStakingWalletCST.unstake(0);

		await expect(newStakingWalletCST.stake(0)).to.be.revertedWithCustomError(contractErrors, 'OneTimeStaking');
	});
});
