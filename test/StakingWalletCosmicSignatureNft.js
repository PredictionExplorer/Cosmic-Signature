// todo-1 Add this to all ".js" files".
"use strict";

// const { toUtf8Bytes } = require("@ethersproject/strings");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("StakingWalletCosmicSignatureNft", function () {
	// ToDo-202410075-0 applies.
	async function deployCosmicSignature(/*deployerAcct*/) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicSignatureGame,
		} = await basicDeployment(contractDeployerAcct, '', 1, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicSignatureGame,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	it("Shouldn't be possible to deposit to StakingWalletCosmicSignatureNft from arbitrary address", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmicSignature);
		// const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		await expect(stakingWalletCosmicSignatureNft.depositIfPossible(0, { value: hre.ethers.parseEther('2') })).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"CallDenied"
		);
	});

	// // Comment-202409209 applies.
	// it("Shouldn't be possible to deposit to StakingWalletCosmicSignatureNft if the transfer to CharityWallet fails", async function () {
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await loadFixture(deployCosmicSignature);
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	const BidderContract = await hre.ethers.getContractFactory('BidderContract');
	// 	const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
	// 	await cBidder.waitForDeployment();
	// 	await cBidder.startBlockingDeposits();
	//
	// 	const BrokenCharity = await hre.ethers.getContractFactory('BrokenCharity');
	// 	const newCharity = await BrokenCharity.deploy();
	// 	await newCharity.waitForDeployment();
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	// todo-9 The 3rd parameter no longer exists.
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(await cBidder.getAddress(), owner.address, await newCharity.getAddress());
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	//
	// 	await expect(
	// 		// todo-9 This function has been replaced with `depositIfPossible`.
	// 		newStakingWalletCosmicSignatureNft.deposit({ value: hre.ethers.parseEther('2') })
	// 	).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");
	// });

	it("Shouldn't be possible to unstake() twice", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
		const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		await newCosmicSignatureNft.mint(owner.address, 0);
		await newCosmicSignatureNft.mint(owner.address, 0);

		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			await owner.address
			// await cBidder.getAddress()
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);

		const tx = await newStakingWalletCosmicSignatureNft.stakeMany([0,1]);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);

		// expect(await newStakingWalletCosmicSignatureNft.lastActionIdByTokenId(0)).to.equal(0);
		// expect(await newStakingWalletCosmicSignatureNft.stakerByTokenId(0)).to.equal(owner.address);
		// expect(await newStakingWalletCosmicSignatureNft.stakerByTokenId(99n)).to.equal(hre.ethers.ZeroAddress);
		await hre.ethers.provider.send('evm_increaseTime', [6000]);
		await hre.ethers.provider.send('evm_mine');
		// todo-1 Everywhere, it's unnecessary to check for the `not.to.be.reverted`, right? It's better to just not call `expect`.
		await expect(newStakingWalletCosmicSignatureNft.unstake(1)).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.unstake(1)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"NftAlreadyUnstaked"
		);
		// expect(await newStakingWalletCosmicSignatureNft.wasNftUsed(0)).to.equal(true);
		expect(await newStakingWalletCosmicSignatureNft.wasNftUsed(0)).to.equal(1n);

		await expect(newStakingWalletCosmicSignatureNft.depositIfPossible(0, { value: hre.ethers.parseEther('1') })).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.depositIfPossible(1, { value: hre.ethers.parseEther('2') })).not.to.be.reverted;
		expect(await newStakingWalletCosmicSignatureNft.numEthDeposits()).to.equal(1n);
		const d = await newStakingWalletCosmicSignatureNft.ethDeposits(1);
		expect(d.rewardAmountPerStakedNft).to.equal(hre.ethers.parseEther('3'));
	});
	it("Shouldn't be possible to unstake by a user different from the owner", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
		const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		await newCosmicSignatureNft.mint(owner.address, 0);

		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			await cosmicSignatureGameProxy.getAddress()
			// await cBidder.getAddress()
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);

		const tx = await newStakingWalletCosmicSignatureNft.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send('evm_increaseTime', [6000]);
		await hre.ethers.provider.send('evm_mine');

		await expect(newStakingWalletCosmicSignatureNft.connect(addr1).unstake(1)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"NftStakeActionAccessDenied"
		);
	});
	// it("Shouldn't be possible to claim reward without executing unstake()", async function () {
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicSignatureGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true
	// 	);
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
	// 	// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
	// 	// await cBidder.waitForDeployment();
	//
	// 	const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
	// 	const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
	// 	await newCosmicSignatureNft.mint(owner.address, 0);
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
	// 		await newCosmicSignatureNft.getAddress(),
	// 		await cosmicSignatureGameProxy.getAddress()
	// 		// await cBidder.getAddress()
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	//		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	//
	// 	const tx = await newStakingWalletCosmicSignatureNft.stake(0);
	// 	const receipt = await tx.wait();
	// 	const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
	// 	const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	const numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
	// 	expect(numStakedNfts).to.equal(1);
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]);
	// 	await hre.ethers.provider.send('evm_mine');
	// 	await expect(cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') })).not.to.be.reverted;
	//
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"NftNotUnstaked"
	// 	);
	// });
	// it("Shouldn't be possible to claim deposit more than once", async function () {
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicSignatureGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true
	// 	);
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
	// 	// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
	// 	// await cBidder.waitForDeployment();
	//
	// 	const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
	// 	const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
	// 	await newCosmicSignatureNft.mint(owner.address, 0);
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
	// 		await newCosmicSignatureNft.getAddress(),
	// 		await cosmicSignatureGameProxy.getAddress()
	// 		// await cBidder.getAddress()
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	//		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	//
	// 	const tx = await newStakingWalletCosmicSignatureNft.stake(0);
	// 	const receipt = await tx.wait();
	// 	const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
	// 	const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]);
	// 	await hre.ethers.provider.send('evm_mine');
	//
	// 	await expect(cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') })).not.to.be.reverted;
	// 	await expect(newStakingWalletCosmicSignatureNft.unstake(1)).not.to.be.reverted;
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1],[0,0])).to.be.revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"IncorrectArrayArguments"
	// 	);
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).not.to.be.reverted;
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"DepositAlreadyClaimed"
	// 	);
	// });
	// it("Shouldn't be possible to claim deposit by a user different from the owner", async function () {
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicSignatureGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true
	// 	);
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
	// 	// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
	// 	// await cBidder.waitForDeployment();
	//
	// 	const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
	// 	const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
	// 	await newCosmicSignatureNft.mint(owner.address, 0);
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
	// 		await newCosmicSignatureNft.getAddress(),
	// 		await cosmicSignatureGameProxy.getAddress()
	// 		// await cBidder.getAddress()
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	//		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	//
	// 	const tx = await newStakingWalletCosmicSignatureNft.stake(0);
	// 	const receipt = await tx.wait();
	// 	const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
	// 	const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]);
	// 	await hre.ethers.provider.send('evm_mine');
	//
	// 	await expect(cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') })).not.to.be.reverted;
	// 	await newStakingWalletCosmicSignatureNft.unstake(1);
	// 	await expect(newStakingWalletCosmicSignatureNft.connect(addr1).claimManyRewards([1], [0])).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"NftStakeActionAccessDenied"
	// 	);
	// });
	// it("Shouldn't be possible to claim deposits made earlier than stakeDate", async function () {
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicSignatureGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true
	// 	);
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
	// 	// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
	// 	// await cBidder.waitForDeployment();
	//
	// 	const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
	// 	const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
	// 	await newCosmicSignatureNft.mint(owner.address, 0);
	// 	await newCosmicSignatureNft.mint(addr1.address, 0);
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
	// 		await newCosmicSignatureNft.getAddress(),
	// 		await cosmicSignatureGameProxy.getAddress()
	// 		// await cBidder.getAddress()
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	//		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	// 	await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await newCosmicSignatureNft.connect(addr1).setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	//
	// 	await newStakingWalletCosmicSignatureNft.connect(addr1).stake(1);
	// 	await expect(cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') })).not.to.be.reverted;
	// 	await hre.ethers.provider.send('evm_mine');
	// 	const tx = await newStakingWalletCosmicSignatureNft.stake(0);
	// 	const receipt = await tx.wait();
	// 	const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
	// 	const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
	// 	const stakeTimestamp = block.timestamp;
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]);
	// 	await hre.ethers.provider.send('evm_mine');
	// 	const depositTimestamp = stakeTimestamp - 1;
	// 	await newStakingWalletCosmicSignatureNft.unstake(1);
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([3], [0])).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"DepositOutsideStakingWindow"
	// 	);
	// });
	// it("Shouldn't be possible to claim deposits after unstakeTime", async function () {
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicSignatureGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true
	// 	);
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
	// 	// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
	// 	// await cBidder.waitForDeployment();
	//
	// 	const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
	// 	const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
	// 	await newCosmicSignatureNft.mint(owner.address, 0);
	// 	await newCosmicSignatureNft.mint(addr1.address, 0);
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
	// 		await newCosmicSignatureNft.getAddress(),
	// 		await cosmicSignatureGameProxy.getAddress()
	// 		// addr1.address
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	//		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	// 	await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await newCosmicSignatureNft.connect(addr1).setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	//
	// 	let tx = await newStakingWalletCosmicSignatureNft.stake(0);
	// 	let receipt = await tx.wait();
	// 	let topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
	// 	let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	let log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	const stakeRecord = await newStakingWalletCosmicSignatureNft.stakeActions(1);
	// 	const numStakeActions = await newStakingWalletCosmicSignatureNft.numStakeActions();
	// 	const stakeTime = stakeRecord.stakeTime;
	// 	await newStakingWalletCosmicSignatureNft.connect(addr1).stake(1); // we need to stake, otherwise the deposit would be rejected
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]);
	// 	await newStakingWalletCosmicSignatureNft.unstake(1);
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]);
	// 	tx = await cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') });
	// 	await expect(tx).not.to.be.reverted;
	// 	receipt = await tx.wait();
	// 	topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent('EthDepositReceived').topicHash;
	// 	receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"DepositOutsideStakingWindow"
	// 	);
	// });
	// it("Shouldn't be possible to claim deposits with invalid stakeActionId or ethDepositId", async function () {
	it("Shouldn't be possible to unstake with invalid stakeActionId", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicSignatureGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true
		);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	
		// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		// await cBidder.waitForDeployment();
	
		const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
		const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		await newCosmicSignatureNft.mint(owner.address, 0);
		await newCosmicSignatureNft.mint(addr1.address, 0);
	
		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			await cosmicSignatureGameProxy.getAddress()
			// addr1.address
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
		// await cosmicSignatureGameProxy.setRuntimeMode();
		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
		await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
		await newCosmicSignatureNft.connect(addr1).setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	
		let tx = await newStakingWalletCosmicSignatureNft.stake(0);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// const unstakeTime = log.args.unstakeTime;
		const stakeRecord = await newStakingWalletCosmicSignatureNft.stakeActions(1);
		// let numStakeActions = await newStakingWalletCosmicSignatureNft.numStakeActions();
		// const stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCosmicSignatureNft.connect(addr1).stake(1); // we need to stake, otherwise the deposit would be rejected
		await hre.ethers.provider.send('evm_increaseTime', [6000]);
	
		await expect(newStakingWalletCosmicSignatureNft.unstake(1)).not.to.be.reverted;
		tx = await cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') });
		await expect(tx).not.to.be.reverted;
		receipt = await tx.wait();
		topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent('EthDepositReceived').topicHash;
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// numStakeActions = await newStakingWalletCosmicSignatureNft.numStakeActions();
		// const numDeposits = await newStakingWalletCosmicSignatureNft.numEthDeposits();
		// await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([/*numStakeActions*/ 3], [0])).to.be.revertedWithCustomError(
		// 	cosmicSignatureGameErrorsFactory_,
		// 	"NftStakeActionInvalidId"
		// );
		// await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [numDeposits])).to.be.revertedWithCustomError(
		// 	cosmicSignatureGameErrorsFactory_,
		// 	"EthDepositInvalidId"
		// );
		await expect(newStakingWalletCosmicSignatureNft.unstakeMany([0])).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"NftAlreadyUnstaked"
		);
		await expect(newStakingWalletCosmicSignatureNft.unstakeMany([3])).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"NftAlreadyUnstaked"
		);
		await expect(newStakingWalletCosmicSignatureNft.connect(addr1).unstakeMany([10])).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"NftAlreadyUnstaked"
		);
		await expect(newStakingWalletCosmicSignatureNft.connect(addr1).unstakeMany([2])).not.to.be.reverted;
	});
	// it("It is not possible to claim reward if transfer to sender address fails", async function () {
	it("It is not possible to unstake if transfer to sender address fails", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft
		} = await basicDeploymentAdvanced(
			'SpecialCosmicSignatureGame',
			owner,
			"",
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true
		);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
		const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		newCosmicSignatureNft.waitForDeployment();
		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			await cosmicSignatureGameProxy.getAddress()
			// addr1.address
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
		// await cosmicSignatureGameProxy.setRuntimeMode();
		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
		await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
		await newCosmicSignatureNft.connect(addr1).setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);

		const BrokenStakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("BrokenStakingWalletCosmicSignatureNft");
		const brokenStakingWalletCosmicSignatureNft = await BrokenStakingWalletCosmicSignatureNft.deploy();
		await brokenStakingWalletCosmicSignatureNft.waitForDeployment();
		await brokenStakingWalletCosmicSignatureNft.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
		await brokenStakingWalletCosmicSignatureNft.doSetApprovalForAll(await newCosmicSignatureNft.getAddress());
		await newCosmicSignatureNft.setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);

		await newCosmicSignatureNft.mint(await brokenStakingWalletCosmicSignatureNft.getAddress(), 0);
		await newCosmicSignatureNft.mint(addr1.address, 0);
		await newCosmicSignatureNft.mint(await brokenStakingWalletCosmicSignatureNft.getAddress(), 0);

		let tx = await brokenStakingWalletCosmicSignatureNft.doStake(0);
		await expect(tx).not.to.be.reverted;
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// const unstakeTime = log.args.unstakeTime;
		const stakeRecord = await newStakingWalletCosmicSignatureNft.stakeActions(1);
		// const stakeTime = stakeRecord.stakeTime;
		await expect(newStakingWalletCosmicSignatureNft.connect(addr1).stake(1)).not.to.be.reverted;
		tx = await brokenStakingWalletCosmicSignatureNft.doStake(2);
		await expect(tx).not.to.be.reverted;

		await hre.ethers.provider.send('evm_increaseTime', [6000]);

		tx = await cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') });
		await expect(tx).not.to.be.reverted;
		receipt = await tx.wait();
		topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent('EthDepositReceived').topicHash;
		receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);

		await expect(brokenStakingWalletCosmicSignatureNft.doUnstake(3)).not.to.be.reverted;
		await brokenStakingWalletCosmicSignatureNft.startBlockingDeposits();
		// await expect(brokenStakingWalletCosmicSignatureNft.doClaimReward(1, 0)).to.be.revertedWithCustomError(
		// 	cosmicSignatureGameErrorsFactory_,
		// 	"FundTransferFailed"
		// );
		await expect(brokenStakingWalletCosmicSignatureNft.doUnstake(1)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"FundTransferFailed"
		);
		await brokenStakingWalletCosmicSignatureNft.stopBlockingDeposits();
		await expect(brokenStakingWalletCosmicSignatureNft.doUnstake(1)).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.connect(addr1).unstake(2)).not.to.be.reverted;
		await expect(brokenStakingWalletCosmicSignatureNft.doUnstake(1)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"NftAlreadyUnstaked"
		);
	});

	// // [Comment-202409209]
	// // This test no longer makes sense due to refactorings described in Comment-202409208.
	// // todo-0 I have now removed that comment. It was about the elimination of `modulo` and `charityAddress`. So revisit this comment or (eventually) remove it.
	// // todo-0 Nick, you might want to develop similar tests (possibly uncomment and modify those I commented out)
	// // todo-0 for the cases listed in ToDo-202409226-0.
	// // [/Comment-202409209]
	// it("A failure to deposit to StakingWalletCosmicSignatureNft shouldn't abort the process of claiming main prize", async function () {
	// 	const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicSignatureGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true
	// 	);
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
	// 	const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
	// 	newCosmicSignatureNft.waitForDeployment();
	//
	// 	const BrokenStakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("BrokenStakingWalletCosmicSignatureNft");
	// 	const brokenStakingWalletCosmicSignatureNft = await BrokenStakingWalletCosmicSignatureNft.deploy();
	// 	await brokenStakingWalletCosmicSignatureNft.waitForDeployment();
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
	// 		await newCosmicSignatureNft.getAddress(),
	// 		await brokenStakingWalletCosmicSignatureNft.getAddress(),
	//			// todo-9 The 3rd parameter no longer exists.
	// 		addr1.address
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await brokenStakingWalletCosmicSignatureNft.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	await brokenStakingWalletCosmicSignatureNft.doSetApprovalForAll(await newCosmicSignatureNft.getAddress());
	// 	await brokenStakingWalletCosmicSignatureNft.startBlockingDeposits();
	//
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await newCosmicSignatureNft.connect(addr1).setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	//
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(brokenStakingWalletCosmicSignatureNft);
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	//		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	//
	// 	await newCosmicSignatureNft.setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await newCosmicSignatureNft.mint(await brokenStakingWalletCosmicSignatureNft.getAddress(), 0);
	// 	await newCosmicSignatureNft.mint(addr1.address, 0);
	//
	// 	await newStakingWalletCosmicSignatureNft.connect(addr1).stake(1); // we need to stake, otherwise the deposit would be rejected
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]); // prepare for unstake
	//
	// 	const bidPrice = await cosmicSignatureGameProxy.getBidPrice();
	// 	const bidParams = { message: "", randomWalkNftId: -1 };
	// 	const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicSignatureGameProxy.bid(params, { value: bidPrice });
	//
	// 	const prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
	// 	await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await hre.ethers.provider.send('evm_mine');
	//
	// 	await expect(cosmicSignatureGameProxy.claimPrize()).not.to.be.reverted;
	// });

	// // Comment-202409209 applies.
	// it("Changing charity address works", async function () {
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await loadFixture(deployCosmicSignature);
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	//
	// 	await stakingWalletCosmicSignatureNft.setCharityAddress(addr3.address);
	// 	const charityAddr = await stakingWalletCosmicSignatureNft.charityAddress();
	// 	expect(charityAddr).to.equal(addr3.address);
	// 	await expect(stakingWalletCosmicSignatureNft.connect(addr1).setCharityAddress(addr2.address))
	// 		.to.be.revertedWithCustomError(stakingWalletCosmicSignatureNft,"OwnableUnauthorizedAccount");
	// 	await expect(stakingWalletCosmicSignatureNft.setCharityAddress(hre.ethers.ZeroAddress))
	// 		.to.be.revertedWithCustomError(stakingWalletCosmicSignatureNft, "ZeroAddress");
	// 	await expect(stakingWalletCosmicSignatureNft.setCharityAddress(addr3.address))
	// 		.to.be.revertedWithCustomError(stakingWalletCosmicSignatureNft,"AddressAlreadySet");
	// });

	// it("Internal staker state variables for checking uniquness are correctly set", async function () {
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 	} = await basicDeployment(owner, "", 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//		
	// 	// todo-1 Is this still true, given that the test passes?
	// 	// * THIS TEST IS BROKEN for unknown reasons (hardhat trace hangs, no way to know, pending for deep debugging)
	// 	const NewStakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('TestStakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await NewStakingWalletCosmicSignatureNft.deploy(
	// 		await cosmicSignatureNft.getAddress(),
	// 		await cosmicSignatureGameProxy.getAddress()
	// 		// await charityWallet.getAddress()
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//
	// 	let sampleTokenId = 33n;
	// 	let tokenStaked = await newStakingWalletCosmicSignatureNft.isTokenStaked(sampleTokenId);
	// 	expect(tokenStaked).to.equal(false);
	// 	await newStakingWalletCosmicSignatureNft.doInsertToken(sampleTokenId, 0n);
	// 	let tokenIndexCheck = await newStakingWalletCosmicSignatureNft.tokenIndices(sampleTokenId);
	// 	expect(tokenIndexCheck).to.equal(1);
	// 	let tokenIdCheck = await newStakingWalletCosmicSignatureNft.stakedTokens(Number(tokenIndexCheck) - 1);
	// 	expect(tokenIdCheck).to.equal(sampleTokenId);
	// 	await expect(newStakingWalletCosmicSignatureNft.doInsertToken(sampleTokenId, 0n)).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"TokenAlreadyInserted"
	// 	);
	//
	// 	await newStakingWalletCosmicSignatureNft.doRemoveToken(sampleTokenId);
	// 	await expect(newStakingWalletCosmicSignatureNft.doRemoveToken(sampleTokenId)).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"TokenAlreadyDeleted"
	// 	);
	//
	// 	const bidPrice = await cosmicSignatureGameProxy.getBidPrice();
	// 	const bidParams = { message: "", randomWalkNftId: -1 };
	// 	const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicSignatureGameProxy.bid(params, { value: bidPrice });
	//
	// 	await hre.ethers.provider.send('evm_mine');
	// 	let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
	// 	await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await hre.ethers.provider.send('evm_mine');
	//
	// 	prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
	// 	await cosmicSignatureGameProxy.claimPrize();
	//
	// 	await cosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	const tx = await newStakingWalletCosmicSignatureNft.stake(0);
	// 	const receipt = await tx.wait();
	// 	const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
	// 	const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	//
	// 	await expect(newStakingWalletCosmicSignatureNft.doInsertToken(0, 0)).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"TokenAlreadyInserted"
	// 	);
	// 	let numTokens = await newStakingWalletCosmicSignatureNft.numStakedNfts();
	// 	expect(numTokens).to.equal(1);
	// 	await hre.ethers.provider.send('evm_increaseTime', [6000]);
	// 	await hre.ethers.provider.send('evm_mine');
	// 	await expect(newStakingWalletCosmicSignatureNft.unstake(1)).not.to.be.reverted;
	// 	numTokens = await newStakingWalletCosmicSignatureNft.numStakedNfts();
	// 	expect(numTokens).to.equal(0);
	// 	await expect(newStakingWalletCosmicSignatureNft.doRemoveToken(0)).to.be.revertedWithCustomError(
	// 		cosmicSignatureGameErrorsFactory_,
	// 		"TokenAlreadyDeleted"
	// 	);
	//
	// 	const tokenList = [];
	// 	const totSup = await cosmicSignatureNft.totalSupply();
	// 	for (let i = 0; i < Number(totSup); i++) {
	// 		tokenList.push(i);
	// 	}
	//
	// 	// // Comment-202409209 applies.
	// 	// const contractBalance = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());
	// 	// const m = await stakingWalletCosmicSignatureNft.modulo();
	// 	// expect(m).to.equal(contractBalance);
	// });
	// it("User stakes his 10 CosmicSignature NFTs and gets all of them back after claim", async function () {
	it("User stakes his 10 CosmicSignature NFTs and gets all of them back after unstake", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);

		const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
		const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			await cosmicSignatureGameProxy.getAddress()
			// await charityWallet.getAddress()
		);
		await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
		// await cosmicSignatureGameProxy.setRuntimeMode();
		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
		await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);

		for (let i = 0; i < 10; i++) {
			await newCosmicSignatureNft.mint(owner.address, 0);
		}

		let numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(0);

		for (let i = 0; i < 10; i++) {
			const nftId_ = ((i * 7) + 2) % 10;
			const tx = await newStakingWalletCosmicSignatureNft.stake(nftId_);
			await expect(tx).not.to.be.reverted;
			const receipt = await tx.wait();
			const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
			const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
			const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		}

		numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(10);

		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			const o = await newCosmicSignatureNft.ownerOf(nftId_);
			expect(o).to.equal(await newStakingWalletCosmicSignatureNft.getAddress());
		}

		const bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		const bidParams = { message: "", randomWalkNftId: -1 };
		const params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.bid(params, { value: bidPrice });

		const prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await hre.ethers.provider.send('evm_mine');
		await cosmicSignatureGameProxy.claimPrize();

		// forward timestamp se we can unstake
		// todo-1 The forwarding no longer needed, right?
		await hre.ethers.provider.send('evm_increaseTime', [6000]);
		await hre.ethers.provider.send('evm_mine');

		for ( let stakeActionId_ = 5; stakeActionId_ <= 10; ++ stakeActionId_ ) {
			await newStakingWalletCosmicSignatureNft.unstake(stakeActionId_);
		}
		await newStakingWalletCosmicSignatureNft.unstakeMany([3, 4, 2]);
		await newStakingWalletCosmicSignatureNft.unstake(1);

		numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(0);

		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			const o = await newCosmicSignatureNft.ownerOf(nftId_);
			expect(o).to.equal(owner.address);
		}
	});

	// // Comment-202409209 applies.
	// it("StakingWalletCosmicSignatureNft is properly distributing prize amount() (modulo check)", async function () {
	// 	const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await loadFixture(deployCosmicSignature);
	//
	// 	let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
	// 	let bidParams = { message: "", randomWalkNftId: -1 };
	// 	let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicSignatureGameProxy.connect(addr1).bid(params, { value: bidPrice });
	// 	let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
	// 	await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await cosmicSignatureGameProxy.connect(addr1).claimPrize();
	//
	// 	bidPrice = await cosmicSignatureGameProxy.getBidPrice();
	// 	bidParams = { message: "", randomWalkNftId: -1 };
	// 	params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicSignatureGameProxy.connect(addr2).bid(params, { value: bidPrice });
	// 	prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
	// 	await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await cosmicSignatureGameProxy.connect(addr2).claimPrize();
	// 	bidPrice = await cosmicSignatureGameProxy.getBidPrice();
	// 	bidParams = { message: "", randomWalkNftId: -1 };
	// 	params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicSignatureGameProxy.connect(addr3).bid(params, { value: bidPrice });
	// 	prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
	// 	await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	// 	await cosmicSignatureGameProxy.connect(addr3).claimPrize();
	//
	// 	await cosmicSignatureNft.connect(addr1).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await cosmicSignatureNft.connect(addr2).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await cosmicSignatureNft.connect(addr3).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
	//
	// 	// make all winners to stake their tokens
	// 	const CSTtotalSupply = await cosmicSignatureNft.totalSupply();
	// 	for (let i = 0; i < Number(CSTtotalSupply); i++) {
	// 		const o = await cosmicSignatureNft.ownerOf(i);
	// 		const ownerSigner = await hre.ethers.getSigner(o);
	// 		await stakingWalletCosmicSignatureNft.connect(ownerSigner).stake(i);
	// 	}
	//
	// 	// at this point we have initial data with 3 token holders (holding 1 or more
	// 	// CS tokens) with stake operation executed. Now we are ready to test staking
	//
	// 	bidPrice = await cosmicSignatureGameProxy.getBidPrice();
	// 	bidParams = { message: "", randomWalkNftId: -1 };
	// 	params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
	// 	await cosmicSignatureGameProxy.connect(addr3).bid(params, { value: bidPrice });
	// 	prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
	// 	await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
	//
	// 	const previousModulo = await stakingWalletCosmicSignatureNft.modulo();
	// 	const previousStakingAmount = await cosmicSignatureGameProxy.stakingAmount();
	// 	const csTotalSupply = await cosmicSignatureNft.totalSupply();
	// 	const roundNum = await cosmicSignatureGameProxy.roundNum();
	// 	const tx = await cosmicSignatureGameProxy.connect(addr3).claimPrize();
	// 	const receipt = await tx.wait();
	// 	const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('EthDepositReceived').topicHash;
	// 	const log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const parsed_log = stakingWalletCosmicSignatureNft.interface.parseLog(log);
	// 	const depositRecord = await stakingWalletCosmicSignatureNft.ethDeposits(parsed_log.args.depositNum);
	// 	const amountInRound = depositRecord.depositAmount / depositRecord.numStaked;
	// 	const moduloInRound = depositRecord.depositAmount % depositRecord.numStaked;
	// 	expect(parsed_log.args.amount).to.equal(previousStakingAmount);
	// 	expect(parsed_log.args.modulo).to.equal(moduloInRound);
	//
	// 	const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
	// 	let brokenCharity = await BrokenCharity.deploy();
	// 	await brokenCharity.waitForDeployment();
	//
	// 	await stakingWalletCosmicSignatureNft.setCharityAddress(await brokenCharity.getAddress());
	// 	await expect(stakingWalletCosmicSignatureNft.moduloToCharity()).to.be.revertedWithCustomError(stakingWalletCosmicSignatureNft, "FundTransferFailed");
	// 	await stakingWalletCosmicSignatureNft.setCharityAddress(addr3.address);
	// 	await expect(stakingWalletCosmicSignatureNft.moduloToCharity()).not.to.be.reverted;
	// 	await expect(stakingWalletCosmicSignatureNft.connect(addr1).moduloToCharity()).to.be.revertedWithCustomError(stakingWalletCosmicSignatureNft,"OwnableUnauthorizedAccount");
	// 	await expect(stakingWalletCosmicSignatureNft.moduloToCharity()).to.be.revertedWithCustomError(stakingWalletCosmicSignatureNft,"ModuloIsZero");
	// });

	// todo-1 This test no longer makes sense for `StakingWalletCosmicSignatureNft`, right?
	it("The random picking of winner from StakingWalletCosmicSignatureNft is really random", async function () {
		const signers = await hre.ethers.getSigners();
		const owner = signers[0];
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false);

		const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		await newCosmicSignatureNft.waitForDeployment();

		const NewStakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		const newStakingWalletCosmicSignatureNft = await NewStakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			await cosmicSignatureGameProxy.getAddress()
			// await charityWallet.getAddress()
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();

		const NewStakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		const newStakingWalletRandomWalkNft = await NewStakingWalletRandomWalkNft.deploy(
			await randomWalkNft.getAddress()
		);
		await newStakingWalletRandomWalkNft.waitForDeployment();

		const numSigners = 20;
		const numLoops = 20;
		// const randomSeed = 11235813; // fib
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			await newCosmicSignatureNft.connect(signer).setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
			await randomWalkNft.connect(signer).setApprovalForAll(await newStakingWalletRandomWalkNft.getAddress(), true);
		}
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			for (let j = 0; j < numLoops; j++) {
				await newCosmicSignatureNft.connect(owner).mint(signer.address, 0);
				const nftId = i * numLoops + j;
				await newStakingWalletCosmicSignatureNft.connect(signer).stake(nftId);
			}
		}
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			for (let j = 0; j < numLoops; j++) {
				const mintPrice = await randomWalkNft.getMintPrice();
				await randomWalkNft.connect(signer).mint({ value: mintPrice });
				const nftId = i * numLoops + j;
				await newStakingWalletRandomWalkNft.connect(signer).stake(nftId);
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
				const luckyAddr = await newStakingWalletRandomWalkNft.pickRandomStakerAddressIfPossible(hre.ethers.hashMessage('0x'+r));
				expect(luckyAddr).to.not.equal(hre.ethers.ZeroAddress);
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
				const msg = "The raffle algorithm for holders is not random, staker " + signer.address;
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
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
		const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		await newCosmicSignatureNft.mint(owner.address, 0);
		await newCosmicSignatureNft.mint(owner.address, 0);

		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('TestStakingWalletCosmicSignatureNft');
		let newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			await cosmicSignatureGameProxy.getAddress()
			// await cBidder.getAddress()
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);

		const tx = await newStakingWalletCosmicSignatureNft.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send('evm_increaseTime', [6000]);
		await hre.ethers.provider.send('evm_mine');
		await expect(newStakingWalletCosmicSignatureNft.unstake(1)).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.stake(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NftOneTimeStaking");

		// await newStakingWalletCosmicSignatureNft.doInsertToken(1n,1n);
		// await expect(newStakingWalletCosmicSignatureNft.doInsertToken(1n,1n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenAlreadyInserted");
		// await expect(newStakingWalletCosmicSignatureNft.doRemoveToken(0n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenAlreadyDeleted");
	});
	it("Deposits with value=0 do not create irregularities in StakingWalletCosmicSignatureNft", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicSignatureGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true
		);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
		let newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		await newCosmicSignatureNft.mint(owner.address, 0);
		await newCosmicSignatureNft.mint(owner.address, 0);
		await newCosmicSignatureNft.mint(owner.address, 0);

		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		let newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignatureNft.getAddress(),
			owner.address
			// owner.address
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
		await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
		// await cosmicSignatureGameProxy.setRuntimeMode();
		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);

		let tx = await newStakingWalletCosmicSignatureNft.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// let unstakeTime = log.args.unstakeTime;
		let numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(1);
		await hre.ethers.provider.send('evm_increaseTime', [6000]);
		await hre.ethers.provider.send('evm_mine');
		await expect(newStakingWalletCosmicSignatureNft.depositIfPossible(0)).not.to.be.reverted; // msg.value = 0
		await newStakingWalletCosmicSignatureNft.unstake(1);
		await hre.ethers.provider.send('evm_increaseTime', [100]);
		await hre.ethers.provider.send('evm_mine');
		// await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).not.to.be.reverted;

		await newStakingWalletCosmicSignatureNft.stake(1);
		await newStakingWalletCosmicSignatureNft.stake(2);
		await hre.ethers.provider.send('evm_increaseTime', [6000]);
		await hre.ethers.provider.send('evm_mine');
		await expect(newStakingWalletCosmicSignatureNft.depositIfPossible(1)).not.to.be.reverted; // msg.value = 0
		// await expect(newStakingWalletCosmicSignatureNft.unstakeClaim(3, 1)).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.unstakeMany([4, 3])).not.to.be.reverted;
	});
	// it("User can't claim rewards on his second deposit", async function () {
	// 	const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		bidLogic
	// 	} = await basicDeploymentAdvanced(
	// 		'SpecialCosmicSignatureGame',
	// 		owner,
	// 		'',
	// 		0,
	// 		'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
	// 		true
	// 	);
	// 	// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	const CosmicSignatureNft = await hre.ethers.getContractFactory('CosmicSignatureNft');
	// 	const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
	// 	await newCosmicSignatureNft.mint(owner.address, 0);
	// 	await newCosmicSignatureNft.mint(owner.address, 0);
	//
	// 	const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
	// 	const newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
	// 		await newCosmicSignatureNft.getAddress(),
	// 		await cosmicSignatureGameProxy.getAddress()
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newCosmicSignatureNft.setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
	// 	await cosmicSignatureGameProxy.setStakingWalletCosmicSignatureNft(await newStakingWalletCosmicSignatureNft.getAddress());
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	//		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	//		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	//
	// 	await newStakingWalletCosmicSignatureNft.stake(0);
	//
	// 	await hre.ethers.provider.send('evm_increaseTime', [600]);
	// 	await hre.ethers.provider.send('evm_mine');
	//
	// 	await cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('2') });
	// 	await newStakingWalletCosmicSignatureNft.unstake(1);
	// 	await newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0]);
	//
	// 	await newStakingWalletCosmicSignatureNft.stake(1);
	//
	// 	await hre.ethers.provider.send('evm_increaseTime', [600]);
	// 	await hre.ethers.provider.send('evm_mine');
	//
	// 	await cosmicSignatureGameProxy.depositToStakingWalletCosmicSignatureNftIfPossible({ value: hre.ethers.parseEther('3') });
	//
	// 	await newStakingWalletCosmicSignatureNft.unstake(3);
	// 	let depositId = 1n;		// 1 because it is a new deposit, User want's to claim rewards on its second deposit
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([3], [depositId])).not.to.be.reverted;
	// });
});