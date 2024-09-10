const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');
const SKIP_LONG_TESTS = '1';
const { basicDeployment, basicDeploymentAdvanced } = require('../src//Deploy.js');
const { toUtf8Bytes } = require('@ethersproject/strings');

describe('Staking CST tests', function () {
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
		[contractDeployerAcct] = await ethers.getSigners();
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
	it("Shouldn't be possible to deposit to StakingWallet from arbitrary address", async function () {
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		await expect(stakingWalletCST.deposit({ value: ethers.parseEther('2') })).to.be.revertedWithCustomError(
			contractErrors,
			'DepositFromUnauthorizedSender'
		);
	});
	it("Shouldn't be possible to deposit to StakingWallet if the transfer to CharityWallet fails", async function () {
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();
		await cBidder.startBlockingDeposits();

		const BrokenCharity = await ethers.getContractFactory('BrokenCharity');
		let newCharity = await BrokenCharity.deploy();
		await newCharity.waitForDeployment();

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(await cBidder.getAddress(), owner.address, await newCharity.getAddress());
		await newStakingWalletCST.waitForDeployment();

		await expect(
			newStakingWalletCST.deposit({ value: ethers.parseEther('2') })
		).to.be.revertedWithCustomError(contractErrors, 'FundTransferFailed');
	});
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await owner.address,
			await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		let tx = await newStakingWalletCST.stakeMany([0,1]);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);

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

		await newStakingWalletCST.deposit({ value: ethers.parseEther('1') });
		await newStakingWalletCST.deposit({ value: ethers.parseEther('2') });
		let d = await newStakingWalletCST.ETHDeposits(0);
		expect(d.depositAmount).to.equal(ethers.parseEther('3'));
		expect(await newStakingWalletCST.numETHDeposits()).to.equal(1n);
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		await expect(newStakingWalletCST.connect(addr1).unstake(0)).to.be.revertedWithCustomError(
			contractErrors,
			'AccessError'
		);
	});
	it("Shouldn't be possible to claim reward without executing unstake()", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let numStakedNFTs = await newStakingWalletCST.numStakedNFTs();
		expect(numStakedNFTs).to.equal(1);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		await cosmicGameProxy.depositStakingCST({ value: ethers.parseEther('2') });

		await expect(newStakingWalletCST.claimManyRewards([0], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'TokenNotUnstaked'
		);
	});
	it("Shouldn't be possible to claim deposit more than once", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		await cosmicGameProxy.depositStakingCST({ value: ethers.parseEther('2') });
		await newStakingWalletCST.unstake(0);
		await newStakingWalletCST.claimManyRewards([0], [0]);
		await expect(newStakingWalletCST.claimManyRewards([0], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'DepositAlreadyClaimed'
		);
	});
	it("Shouldn't be possible to claim deposit by a user different from the owner", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		await cosmicGameProxy.depositStakingCST({ value: ethers.parseEther('2') });
		await newStakingWalletCST.unstake(0);
		await expect(newStakingWalletCST.connect(addr1).claimManyRewards([0], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'AccessError'
		);
	});
	it("Shouldn't be possible to claim deposits made earlier than stakeDate", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		await newStakingWalletCST.connect(addr1).stake(1);
		await cosmicGameProxy.depositStakingCST({ value: ethers.parseEther('2') });
		await ethers.provider.send('evm_mine');
		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		let block = await ethers.provider.getBlock(receipt.blockNumber);
		let stakeTimestamp = block.timestamp;
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		let depositTimestamp = stakeTimestamp - 1;
		await newStakingWalletCST.unstake(1);
		await expect(newStakingWalletCST.claimManyRewards([1], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'DepositOutsideStakingWindow'
		);
	});
	it("Shouldn't be possible to claim deposits after unstakeDate", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			addr1.address
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
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWalletCST.stakeActions(0);
		let numStakeActions = await newStakingWalletCST.numStakeActions();
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send('evm_increaseTime', [6000]);
		await newStakingWalletCST.unstake(0);
		await ethers.provider.send('evm_increaseTime', [6000]);
		tx = await cosmicGameProxy.depositStakingCST({ value: ethers.parseEther('2') });
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);
		await newCosmicSignature.mint(addr1.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			addr1.address
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
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWalletCST.stakeActions(0);
		let numStakeActions = await newStakingWalletCST.numStakeActions();
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send('evm_increaseTime', [6000]);

		await newStakingWalletCST.unstake(0);
		tx = await cosmicGameProxy.depositStakingCST({ value: ethers.parseEther('2') });
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEvent('EthDepositEvent').topicHash;
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		let numActions = await newStakingWalletCST.numStakeActions();
		let numDeposits = await newStakingWalletCST.numETHDeposits();
		await expect(newStakingWalletCST.claimManyRewards([numActions], [0])).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidActionId'
		);
		await expect(newStakingWalletCST.claimManyRewards([0], [numDeposits])).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidDepositId'
		);
	});
	it('It is not possible to claim reward from StakingWallet if deposit to sender address fails', async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			addr1.address
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		const BrokenStaker = await ethers.getContractFactory('BrokenStaker');
		let brokenStaker = await BrokenStaker.deploy(await newStakingWalletCST.getAddress(), await newCosmicSignature.getAddress());
		await brokenStaker.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await stakingWalletCST.getAddress(), true);

		await newCosmicSignature.mint(await brokenStaker.getAddress(), 0);
		await newCosmicSignature.mint(addr1.address, 0);

		let tx = await brokenStaker.doStake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		let stakeRecord = await newStakingWalletCST.stakeActions(0);
		let stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCST.connect(addr1).stake(1); // we need to stake, otherwise charity will get the deposit
		await ethers.provider.send('evm_increaseTime', [6000]);

		tx = await cosmicGameProxy.depositStakingCST({ value: ethers.parseEther('2') });
		receipt = await tx.wait();
		topic_sig = newStakingWalletCST.interface.getEvent('EthDepositEvent').topicHash;
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCST.interface.parseLog(receipt_logs[0]);

		await brokenStaker.doUnstake(0);
		await brokenStaker.startBlockingDeposits();

		await expect(brokenStaker.doClaimReward(0, 0)).to.be.revertedWithCustomError(
			contractErrors,
			'FundTransferFailed'
		);
	});
	it('Changing charity address works', async function () {
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		await stakingWalletCST.setCharity(addr3.address);
		let charityAddr = await stakingWalletCST.charity();
		expect(charityAddr).to.equal(addr3.address);
		await expect(stakingWalletCST.connect(addr1).setCharity(addr2.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	});
	it('Internal staker state variables for checking uniquness are correctly set', async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');
		
		// * THIS TEST IS BROKEN for unknown reasons (hardhat trace hangs, no way to know, pending for deep debugging)
		const NewStakingWalletCST = await ethers.getContractFactory('TestStakingWalletCST');
		let newStakingWalletCST = await NewStakingWalletCST.deploy(
			await cosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await charityWallet.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		let actTimeStamp = (await ethers.provider.getBlock('latest')).timestamp;
		await cosmicGameProxy.setActivationTime(actTimeStamp);
		await cosmicGameProxy.setRuntimeMode();

		let sampleTokenId = 33;
		let tokenStaked = await newStakingWalletCST.isTokenStaked(sampleTokenId);
		expect(tokenStaked).to.equal(false);
		await newStakingWalletCST.insertToken(sampleTokenId, 0);
		let tokenIndexCheck = await newStakingWalletCST.tokenIndices(sampleTokenId);
		expect(tokenIndexCheck).to.equal(1);
		let tokenIdCheck = await newStakingWalletCST.stakedTokens(Number(tokenIndexCheck) - 1);
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

		let bidPrice = await cosmicGameProxy.getBidPrice();
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		await ethers.provider.send('evm_mine');
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await cosmicGameProxy.claimPrize();
		
		await cosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);

		await expect(newStakingWalletCST.insertToken(0, 0)).to.be.revertedWithCustomError(
			contractErrors,
			'TokenAlreadyInserted'
		);
		numTokens = await newStakingWalletCST.numTokensStaked();
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

		let tokenList = [];
		let totSup = await cosmicSignature.totalSupply();
		for (let i = 0; i < Number(totSup); i++) {
			tokenList.push(i);
		}

		let contractBalance = await ethers.provider.getBalance(await stakingWalletCST.getAddress());
		let m = await stakingWalletCST.modulo();
		expect(m).to.equal(contractBalance);
	});
	it('User stakes his 10 CosmicSignature tokens and gets all 10 tokens back after claim', async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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

		let CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await charityWallet.getAddress()
		);
		await cosmicGameProxy.setStakingWalletCST(await newStakingWalletCST.getAddress());
		await cosmicGameProxy.setRuntimeMode();

		for (let i = 0; i < 10; i++) {
			await newCosmicSignature.mint(owner.address, 0);
		}
		for (let i = 0; i < 10; i++) {
			await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);
			let tx = await newStakingWalletCST.stake(i);
			let receipt = await tx.wait();
			let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
			let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
			let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		}

		let bidPrice = await cosmicGameProxy.getBidPrice();
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		await cosmicGameProxy.claimPrize();

		// forward timestamp se we can unstake
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');

		for (let i = 4; i < 10; i++) {
			await newStakingWalletCST.unstake(i);
			let o = await newCosmicSignature.ownerOf(i);
			expect(o).to.equal(owner.address);
		}
		await newStakingWalletCST.unstakeClaim(0,0);
		await newStakingWalletCST.unstakeClaimMany([1],[1],[0]);
		await newStakingWalletCST.unstakeMany([2,3]);
	});
	it('StakingWallet is properly distributing prize amount() (modulo check)', async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
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
		} = await loadFixture(deployCosmic);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr1).claimPrize();

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: '', rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr2).claimPrize();
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: '', rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr3).claimPrize();

		await cosmicSignature.connect(addr1).setApprovalForAll(await stakingWalletCST.getAddress(), true);
		await cosmicSignature.connect(addr2).setApprovalForAll(await stakingWalletCST.getAddress(), true);
		await cosmicSignature.connect(addr3).setApprovalForAll(await stakingWalletCST.getAddress(), true);

		// make all winners to stake their tokens
		let CSTtotalSupply = await cosmicSignature.totalSupply();
		for (let i = 0; i < Number(CSTtotalSupply); i++) {
			let o = await cosmicSignature.ownerOf(i);
			let ownerSigner = await ethers.getSigner(o);
			await stakingWalletCST.connect(ownerSigner).stake(i);
		}

		// at this point we have initial data with 3 token holders (holding 1 or more
		// CS tokens) with stake operation executed. Now we are ready to test staking

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: '', rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);

		let previousModulo = await stakingWalletCST.modulo();
		let previousStakingAmount = await cosmicGameProxy.stakingAmount();
		let csTotalSupply = await cosmicSignature.totalSupply();
		let roundNum = await cosmicGameProxy.roundNum();
		let tx = await cosmicGameProxy.connect(addr3).claimPrize();
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('EthDepositEvent').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = stakingWalletCST.interface.parseLog(log);
		let depositRecord = await stakingWalletCST.ETHDeposits(parsed_log.args.depositNum);
		let amountInRound = depositRecord.depositAmount/depositRecord.numStaked;
		let moduloInRound = depositRecord.depositAmount % depositRecord.numStaked;
		expect(parsed_log.args.amount).to.equal(previousStakingAmount);
		expect(parsed_log.args.modulo).to.equal(moduloInRound);

		await stakingWalletCST.moduloToCharity();
	});
	it('The random picking of winner from StakingWallet is really random', async function () {
		let signers = await ethers.getSigners();
		let owner = signers[0];
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
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.waitForDeployment();

		const NewStakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await NewStakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await charityWallet.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();

		const NewStakingWalletRWalk = await ethers.getContractFactory('StakingWalletRWalk');
		let newStakingWalletRWalk = await NewStakingWalletRWalk.deploy(await randomWalkNFT.getAddress());
		await newStakingWalletRWalk.waitForDeployment();

		let numSigners = 20;
		let numLoops = 20;
		let randomSeed = 11235813; // fib
		for (let i = 0; i < numSigners; i++) {
			let signer = signers[i];
			await newCosmicSignature.connect(signer).setApprovalForAll(await newStakingWalletCST.getAddress(), true);
			await randomWalkNFT.connect(signer).setApprovalForAll(await newStakingWalletRWalk.getAddress(), true);
		}
		for (let i = 0; i < numSigners; i++) {
			let signer = signers[i];
			for (let j = 0; j < numLoops; j++) {
				await newCosmicSignature.connect(owner).mint(signer.address, 0);
				let tokenId = i * numLoops + j;
				await newStakingWalletCST.connect(signer).stake(tokenId);
			}
		}
		for (let i = 0; i < numSigners; i++) {
			let signer = signers[i];
			for (let j = 0; j < numLoops; j++) {
				let mintPrice = await randomWalkNFT.getMintPrice();
				await randomWalkNFT.connect(signer).mint({ value: mintPrice });
				let tokenId = i * numLoops + j;
				await newStakingWalletRWalk.connect(signer).stake(tokenId);
			}
		}
		// verification algorithm is simple: if from 400 staked tokens at least
		// 1 staker is chosen (i.e. all stakers win at least 1 token)
		// then we consider randomness works. Sample size is 100 (25% of the population)
		{
			let luckyStakers = {};
			let numSamples = 1000;
			for (let i = 0; i < numSamples; i++) {
				let r = Math.floor(Math.random() * 0xffffff).toString(16).padEnd(6, "0")
				let luckyAddr = await newStakingWalletRWalk.pickRandomStaker(ethers.hashMessage('0x'+r));
				let numToks = luckyStakers[luckyAddr];
				if (numToks === undefined) {
					numToks = 0;
				}
				numToks = numToks + 1;
				luckyStakers[luckyAddr] = numToks;
			}
			for (let i = 0; i < numSigners; i++) {
				let signer = signers[i];
				let numToks = luckyStakers[signer.address];
				let msg = 'The raffle algorithm for holders is not random, staker ' + signer.address;
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const CosmicSignature = await ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.mint(owner.address, 0);

		const StakingWalletCST = await ethers.getContractFactory('StakingWalletCST');
		let newStakingWalletCST = await StakingWalletCST.deploy(
			await newCosmicSignature.getAddress(),
			await cosmicGameProxy.getAddress(),
			await cBidder.getAddress()
		);
		await newStakingWalletCST.waitForDeployment();
		await newCosmicSignature.setApprovalForAll(await newStakingWalletCST.getAddress(), true);

		let tx = await newStakingWalletCST.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCST.interface.parseLog(receipt_logs[0]);
		await ethers.provider.send('evm_increaseTime', [6000]);
		await ethers.provider.send('evm_mine');
		await newStakingWalletCST.unstake(0);

		await expect(newStakingWalletCST.stake(0)).to.be.revertedWithCustomError(contractErrors, 'OneTimeStaking');
	});
});
