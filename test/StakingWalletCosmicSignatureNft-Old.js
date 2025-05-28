"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt256 } = require("../src/Helpers.js");
const { deployContractsForUnitTesting, deployContractsForUnitTestingAdvanced } = require("../src/ContractUnitTestingHelpers.js");

describe("StakingWalletCosmicSignatureNft-Old", function () {
	it("Shouldn't be possible to deposit to StakingWalletCosmicSignatureNft from arbitrary address", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, stakingWalletCosmicSignatureNft,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		await expect(stakingWalletCosmicSignatureNft.connect(signer0).deposit(0, {value: hre.ethers.parseEther("2")})).revertedWithCustomError(
			stakingWalletCosmicSignatureNft,
			"UnauthorizedCaller"
		);
	});

	// // [Comment-202409209]
	// // This test no longer makes sense due to refactorings described in Comment-202409208.
	// // todo-1 I have now removed that comment. It was about the elimination of `modulo` and `charityAddress`.
	// // todo-1 So revisit this comment or (eventually) remove it.
	// // [/Comment-202409209]
	// it("Shouldn't be possible to deposit to StakingWalletCosmicSignatureNft if the transfer to CharityWallet fails", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, stakingWalletCosmicSignatureNftFactory,} =
	// 		await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0,] = signers;
	//	
	// 	// const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
	// 	// const bidderContract_ = await bidderContractFactory_.deploy(cosmicSignatureGameProxyAddr);
	// 	// await bidderContract_.waitForDeployment();
	// 	// await bidderContract_.startBlockingDeposits();
	//
	// 	// todo-0 This contract no longer exists.
	// 	const brokenCharityFactory = await hre.ethers.getContractFactory("BrokenCharity", deployerAcct);
	// 	const brokenCharity = await brokenCharityFactory.deploy();
	// 	await brokenCharity.waitForDeployment();
	//
	// 	// todo-9 The 3rd parameter no longer exists.
	// 	const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(bidderContractAddr_, signer0.address, brokenCharityAddr);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	//
	// 	await expect(
	// 		// todo-9 This method now has parameters.
	// 		newStakingWalletCosmicSignatureNft.>>>connect>>>.deposit({ value: hre.ethers.parseEther("2") })
	// 	).revertedWithCustomError(newStakingWalletCosmicSignatureNft, "FundTransferFailed");
	// });

	it("It's impossible to unstake an NFT twice", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		const newCosmicSignatureNftAddr = await newCosmicSignatureNft.getAddress();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await newCosmicSignatureNft.connect(signer0).mintMany(0n, [signer0.address, signer0.address,], 0x7ee83ce15e27a463d2d6678d149a06ab2d686878642899e9c47e7c0f0c382432n);

		const newStakingWalletCosmicSignatureNft =
			await stakingWalletCosmicSignatureNftFactory.deploy(newCosmicSignatureNftAddr, signer0.address);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr = await newStakingWalletCosmicSignatureNft.getAddress();
		await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);

		const transactionResponse_ = await newStakingWalletCosmicSignatureNft.connect(signer0).stakeMany([0, 1]);
		const transactionReceipt_ = await transactionResponse_.wait();
		// const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		// const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);

		// expect(await newStakingWalletCosmicSignatureNft.lastActionIdByTokenId(0)).to.equal(0);
		// expect(await newStakingWalletCosmicSignatureNft.stakerByTokenId(0)).to.equal(signer0.address);
		// expect(await newStakingWalletCosmicSignatureNft.stakerByTokenId(99n)).to.equal(hre.ethers.ZeroAddress);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");
		// todo-1 Everywhere, it's unnecessary to check for the `.not.reverted`, right?
		// todo-1 ---It's better to just not call `expect`.
		// todo-1 Wrong! Call it! Otherwise there is a small chance of a race.
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).unstake(1)).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).unstake(1)).revertedWithCustomError(
			newStakingWalletCosmicSignatureNft,
			"NftStakeActionInvalidId"
		);
		expect(await newStakingWalletCosmicSignatureNft.usedNfts(0)).to.equal(1n);

		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).deposit(0, { value: hre.ethers.parseEther("1") })).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).deposit(1, { value: hre.ethers.parseEther("2") })).not.to.be.reverted;
		// expect(await newStakingWalletCosmicSignatureNft.numEthDeposits()).to.equal(1n);
		// const d = await newStakingWalletCosmicSignatureNft.ethDeposits(1);
		// expect(d.rewardAmountPerStakedNft).to.equal(hre.ethers.parseEther("3"));
	});

	it("Shouldn't be possible to unstake by a user different from the owner", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxyAddr, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		const newCosmicSignatureNftAddr = await newCosmicSignatureNft.getAddress();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);

		await newCosmicSignatureNft.connect(signer0).mint(0n, signer0.address, 0x6f593b6c214febb9f712fba692ae33a2f420bd71ab95845fd00b4a13ce1d7bcen);

		const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
			newCosmicSignatureNftAddr,
			cosmicSignatureGameProxyAddr
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr = await newStakingWalletCosmicSignatureNft.getAddress();
		await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);

		const transactionResponse_ = await newStakingWalletCosmicSignatureNft.connect(signer0).stake(0);
		const transactionReceipt_ = await transactionResponse_.wait();
		// const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		// const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");

		await expect(newStakingWalletCosmicSignatureNft.connect(signer1).unstake(1)).revertedWithCustomError(
			newStakingWalletCosmicSignatureNft,
			"NftStakeActionAccessDenied"
		);
	});

	// it("Shouldn't be possible to claim staking reward without executing unstake()", async function () {
	// 	const [signer0, signer1,] = await hre.ethers.getSigners();
	// 	// todo-9 Instead of this, call `loadFixture` or at least `deployContractsForUnitTesting` or `deployContractsForUnitTestingAdvanced`.
	// 	const {ownerAcct, cosmicSignatureGameProxy, stakingWalletCosmicSignatureNftFactory,} =
	// 		await deployContractsAdvanced(
	// 			signer0,
	// 			"SpecialCosmicSignatureGame",
	// 			"",
	// 			signer1.address,
	// 			false,
	// 			-1_000_000_000n // todo-9 <<< Is this the correct value?
	// 		);
	//
	// 	const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
	// 	await newCosmicSignatureNft.waitForDeployment();
	// 	await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await newCosmicSignatureNft.connect(signer0).mint(0n, signer0.address, 0x4d56c808b5ca6013f23cdffdc2d83e34f84f7ad06f20f93f0caef94f3691311cn);
	//
	// 	const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
	// 		newCosmicSignatureNftAddr,
	// 		cosmicSignatureGameProxyAddr
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await newCosmicSignatureNft.>>>connect>>>.setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
	// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	//
	// 	const transactionResponse_ = await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(0);
	// 	const transactionReceipt_ = await transactionResponse_.wait();
	// 	const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
	// 	const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	// 	// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	const numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
	// 	expect(numStakedNfts).to.equal(1);
	// 	await hre.ethers.provider.send("evm_increaseTime", [6000]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await expect(cosmicSignatureGameProxy.>>>connect>>>.depositToStakingWalletCosmicSignatureNft({value: hre.ethers.parseEther("2")})).not.to.be.reverted;
	//
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"NftNotUnstaked"
	// 	);
	// });

	// it("Shouldn't be possible to claim deposit more than once", async function () {
	// 	const [signer0, signer1,] = await hre.ethers.getSigners();
	// 	// todo-9 Instead of this, call `loadFixture` or at least `deployContractsForUnitTesting` or `deployContractsForUnitTestingAdvanced`.
	// 	const {cosmicSignatureGameProxy, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
	// 		await deployContractsAdvanced(
	// 			signer0,
	// 			"SpecialCosmicSignatureGame",
	// 			"",
	// 			signer1.address,
	// 			false,
	// 			-1_000_000_000n // todo-9 <<< Is this the correct value?
	// 		);
	//
	// 	const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
	// 	await newCosmicSignatureNft.waitForDeployment();
	// 	await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await newCosmicSignatureNft.connect(signer0).mint(0n, signer0.address, 0x092628092eb505fafe152b916fc5859a2d4d307db171e887be8a9b872eeb287fn);
	//
	// 	const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
	// 		newCosmicSignatureNftAddr,
	// 		cosmicSignatureGameProxyAddr
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await newCosmicSignatureNft.>>>connect>>>.setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
	// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	//
	// 	const transactionResponse_ = await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(0);
	// 	const transactionReceipt_ = await transactionResponse_.wait();
	// 	const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
	// 	const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	// 	// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	await hre.ethers.provider.send("evm_increaseTime", [6000]);
	// 	// await hre.ethers.provider.send("evm_mine");
	//
	// 	await expect(cosmicSignatureGameProxy.>>>connect>>>.depositToStakingWalletCosmicSignatureNft({ value: hre.ethers.parseEther("2") })).not.to.be.reverted;
	// 	await expect(newStakingWalletCosmicSignatureNft.>>>connect>>>.unstake(1)).not.to.be.reverted;
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1],[0, 0])).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"IncorrectArrayArguments"
	// 	);
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).not.to.be.reverted;
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"DepositAlreadyClaimed"
	// 	);
	// });

	// it("Shouldn't be possible to claim deposit by a user different from the owner", async function () {
	// 	const [signer0, signer1,] = await hre.ethers.getSigners();
	// 	// todo-9 Instead of this, call `loadFixture` or at least `deployContractsForUnitTesting` or `deployContractsForUnitTestingAdvanced`.
	// 	const {cosmicSignatureGameProxy, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
	// 		await deployContractsAdvanced(
	// 			signer0,
	// 			"SpecialCosmicSignatureGame",
	// 			"",
	// 			signer1.address,
	// 			false,
	// 			-1_000_000_000n // todo-9 <<< Is this the correct value?
	// 		);
	//
	// 	const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
	// 	await newCosmicSignatureNft.waitForDeployment();
	// 	await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await newCosmicSignatureNft.>>>connect>>>.mint(0n, signer0.address, 0x6fff68608d244427fb5f06865e9a452aab971ad433031ef29b0604cd0a2b8fe3n);
	//
	// 	const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
	// 		newCosmicSignatureNftAddr,
	// 		cosmicSignatureGameProxyAddr
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await newCosmicSignatureNft.>>>connect>>>.setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
	// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	//
	// 	const transactionResponse_ = await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(0);
	// 	const transactionReceipt_ = await transactionResponse_.wait();
	// 	const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
	// 	const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	// 	// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	await hre.ethers.provider.send("evm_increaseTime", [6000]);
	// 	// await hre.ethers.provider.send("evm_mine");
	//
	// 	await expect(cosmicSignatureGameProxy.>>>connect>>>.depositToStakingWalletCosmicSignatureNft({ value: hre.ethers.parseEther("2") })).not.to.be.reverted;
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.unstake(1);
	// 	await expect(newStakingWalletCosmicSignatureNft.connect(signer1).claimManyRewards([1], [0])).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"NftStakeActionAccessDenied"
	// 	);
	// });

	// it("Shouldn't be possible to claim deposits made earlier than stakeDate", async function () {
	// 	const [signer0, signer1,] = await hre.ethers.getSigners();
	// 	// todo-9 Instead of this, call `loadFixture` or at least `deployContractsForUnitTesting` or `deployContractsForUnitTestingAdvanced`.
	// 	const {cosmicSignatureGameProxy, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
	// 		await deployContractsAdvanced(
	// 			signer0,
	// 			"SpecialCosmicSignatureGame",
	// 			"",
	// 			signer1.address,
	// 			false,
	// 			-1_000_000_000n // todo-9 <<< Is this the correct value?
	// 		);
	//
	// 	const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
	// 	// todo-1 Call `await waitForDeployment`.
	// 	await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	// todo-1 Mint multiple at once.
	// 	await newCosmicSignatureNft.>>>connect>>>.mint(0n, signer0.address, 0x4aa1e442efd9309d8c17e38f5d2f8619380619e1f653c80386cf9528f245df78n);
	// 	await newCosmicSignatureNft.>>>connect>>>.mint(0n, signer1.address, 0x27994d887fbb9fd4b65f40e328c176f780b50bc2f7f47f3b089e40086d2cb892n);
	//
	// 	const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
	// 		newCosmicSignatureNftAddr,
	// 		cosmicSignatureGameProxyAddr
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
	// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	// 	await newCosmicSignatureNft.>>>connect>>>.setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	// 	await newCosmicSignatureNft.connect(signer1).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	//
	// 	await newStakingWalletCosmicSignatureNft.connect(signer1).stake(1);
	// 	await expect(cosmicSignatureGameProxy.>>>connect>>>.depositToStakingWalletCosmicSignatureNft({ value: hre.ethers.parseEther("2") })).not.to.be.reverted;
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	const transactionResponse_ = await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(0);
	// 	const transactionReceipt_ = await transactionResponse_.wait();
	// 	const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
	// 	const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	// 	// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	const block = await hre.ethers.provider.getBlock(transactionReceipt_.blockNumber);
	// 	const stakeTimestamp = block.timestamp;
	// 	await hre.ethers.provider.send("evm_increaseTime", [6000]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	const depositTimestamp = stakeTimestamp - 1;
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.unstake(1);
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([3], [0])).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"DepositOutsideStakingWindow"
	// 	);
	// });

	// it("Shouldn't be possible to claim deposits after unstakeTime", async function () {
	// 	const [signer0, signer1,] = await hre.ethers.getSigners();
	// 	// todo-9 Instead of this, call `loadFixture` or at least `deployContractsForUnitTesting` or `deployContractsForUnitTestingAdvanced`.
	// 	const {cosmicSignatureGameProxy, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
	// 		await deployContractsAdvanced(
	// 			signer0,
	// 			"SpecialCosmicSignatureGame",
	// 			"",
	// 			signer1.address,
	// 			false,
	// 			-1_000_000_000n // todo-9 <<< Is this the correct value?
	// 		);
	//
	// 	const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
	// 	// todo-1 Call `await waitForDeployment`.
	// 	await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	// todo-1 Mint multiple at once.
	// 	await newCosmicSignatureNft.>>>connect>>>.mint(0n, signer0.address, 0x91ec791a796381074c375be15d9b4ee46c4f95905d8c7eeec8ec6166a67c00f1n);
	// 	await newCosmicSignatureNft.>>>connect>>>.mint(0n, signer1.address, 0x4c884940f9c056c7b72e2808797fe971f56a3550de0af0890d72988cedc6ba86n);
	//
	// 	const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
	// 		newCosmicSignatureNftAddr,
	// 		cosmicSignatureGameProxyAddr
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
	// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	// 	await newCosmicSignatureNft.>>>connect>>>.setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	// 	await newCosmicSignatureNft.connect(signer1).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	//
	// 	let transactionResponse_ = await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(0);
	// 	let transactionReceipt_ = await transactionResponse_.wait();
	// 	let topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
	// 	let receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	// 	// let log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	// const unstakeTime = log.args.unstakeTime;
	// 	const stakeRecord = await newStakingWalletCosmicSignatureNft.stakeActions(1);
	// 	const numStakeActions = await newStakingWalletCosmicSignatureNft.numStakeActions();
	// 	const stakeTime = stakeRecord.stakeTime;
	// 	await newStakingWalletCosmicSignatureNft.connect(signer1).stake(1); // we need to stake, otherwise the deposit would be rejected
	// 	await hre.ethers.provider.send("evm_increaseTime", [6000]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.unstake(1);
	// 	await hre.ethers.provider.send("evm_increaseTime", [6000]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	transactionResponse_ = await cosmicSignatureGameProxy.>>>connect>>>.depositToStakingWalletCosmicSignatureNft({ value: hre.ethers.parseEther("2") });
	// 	transactionReceipt_ = await transactionResponse_.wait();
	// 	topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("EthDepositReceived").topicHash;
	// 	receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	// 	// log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0])).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"DepositOutsideStakingWindow"
	// 	);
	// });

	// it("Shouldn't be possible to claim deposits with invalid stakeActionId or ethDepositId", async function () {
	it("Shouldn't be possible to unstake with invalid stakeActionId", async function () {
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
			await deployContractsForUnitTestingAdvanced("SpecialCosmicSignatureGame");
		const [signer0, signer1,] = signers;
	
		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		const newCosmicSignatureNftAddr = await newCosmicSignatureNft.getAddress();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);

		await newCosmicSignatureNft.connect(signer0).mintMany(0n, [signer0.address, signer1.address,], 0xf7b8fd327591b2ee09c216dbdc1b8f36c7bbdf8febafde7fe80bf8ea829898b8n);

		const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
			newCosmicSignatureNftAddr,
			cosmicSignatureGameProxyAddr
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr = await newStakingWalletCosmicSignatureNft.getAddress();
		await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);

		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
		await newCosmicSignatureNft.connect(signer1).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	
		let transactionResponse_ = await newStakingWalletCosmicSignatureNft.connect(signer0).stake(0);
		let transactionReceipt_ = await transactionResponse_.wait();
		// let topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		// let receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// let log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// const unstakeTime = log.args.unstakeTime;
		// const stakeRecord = await newStakingWalletCosmicSignatureNft.stakeActions(1);
		// let numStakeActions = await newStakingWalletCosmicSignatureNft.numStakeActions();
		// const stakeTime = stakeRecord.stakeTime;
		await newStakingWalletCosmicSignatureNft.connect(signer1).stake(1); // we need to stake, otherwise the deposit would be rejected
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");
	
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).unstake(1)).not.to.be.reverted;
		transactionResponse_ = await cosmicSignatureGameProxy.connect(signer0).depositToStakingWalletCosmicSignatureNft({value: hre.ethers.parseEther("2")});
		transactionReceipt_ = await transactionResponse_.wait();
		// topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("EthDepositReceived").topicHash;
		// receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// numStakeActions = await newStakingWalletCosmicSignatureNft.numStakeActions();
		// const numDeposits = await newStakingWalletCosmicSignatureNft.numEthDeposits();
		// await expect(newStakingWalletCosmicSignatureNft.connect(signer0).claimManyRewards([/*numStakeActions*/ 3], [0])).revertedWithCustomError(
		// 	newStakingWalletCosmicSignatureNft,
		// 	"NftStakeActionInvalidId"
		// );
		// await expect(newStakingWalletCosmicSignatureNft.connect(signer0).claimManyRewards([1], [numDeposits])).revertedWithCustomError(
		// 	newStakingWalletCosmicSignatureNft,
		// 	"EthDepositInvalidId"
		// );
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).unstakeMany([0])).revertedWithCustomError(
			newStakingWalletCosmicSignatureNft,
			"NftStakeActionInvalidId"
		);
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).unstakeMany([3])).revertedWithCustomError(
			newStakingWalletCosmicSignatureNft,
			"NftStakeActionInvalidId"
		);
		await expect(newStakingWalletCosmicSignatureNft.connect(signer1).unstakeMany([10])).revertedWithCustomError(
			newStakingWalletCosmicSignatureNft,
			"NftStakeActionInvalidId"
		);
		await expect(newStakingWalletCosmicSignatureNft.connect(signer1).unstakeMany([2])).not.to.be.reverted;
	});

	it("It is not possible to unstake if transfer to sender address fails", async function () {
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory, stakingWalletCosmicSignatureNftAddr,} =
			await deployContractsForUnitTestingAdvanced("SpecialCosmicSignatureGame");
		const [signer0, signer1,] = signers;

		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		const newCosmicSignatureNftAddr = await newCosmicSignatureNft.getAddress();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
		const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
			newCosmicSignatureNftAddr,
			cosmicSignatureGameProxyAddr
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr = await newStakingWalletCosmicSignatureNft.getAddress();
		await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);

		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
		await newCosmicSignatureNft.connect(signer1).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);

		const brokenStakingWalletCosmicSignatureNftFactory = await hre.ethers.getContractFactory("BrokenStakingWalletCosmicSignatureNft", deployerAcct);
		const brokenStakingWalletCosmicSignatureNft = await brokenStakingWalletCosmicSignatureNftFactory.deploy();
		await brokenStakingWalletCosmicSignatureNft.waitForDeployment();
		const brokenStakingWalletCosmicSignatureNftAddr = await brokenStakingWalletCosmicSignatureNft.getAddress();
		// await brokenStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await brokenStakingWalletCosmicSignatureNft.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
		await brokenStakingWalletCosmicSignatureNft.connect(signer0).doSetApprovalForAll(newCosmicSignatureNftAddr);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(stakingWalletCosmicSignatureNftAddr, true);

		await newCosmicSignatureNft.connect(signer0).mintMany(
			0n,
			[brokenStakingWalletCosmicSignatureNftAddr, signer1.address, brokenStakingWalletCosmicSignatureNftAddr,],
			0x0e3eb0a11c365148c92dc645de784ead95d7653d3c930768ccd9a49df05bbc6cn
		);

		let transactionResponse_ = await brokenStakingWalletCosmicSignatureNft.connect(signer0).doStake(0);
		let transactionReceipt_ = await transactionResponse_.wait();
		// let topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		// let receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// let log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// const unstakeTime = log.args.unstakeTime;
		// const stakeRecord = await newStakingWalletCosmicSignatureNft.stakeActions(1);
		// const stakeTime = stakeRecord.stakeTime;
		await expect(newStakingWalletCosmicSignatureNft.connect(signer1).stake(1)).not.to.be.reverted;
		await expect(brokenStakingWalletCosmicSignatureNft.connect(signer0).doStake(2n)).not.reverted;

		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");

		transactionResponse_ = await cosmicSignatureGameProxy.connect(signer0).depositToStakingWalletCosmicSignatureNft({value: hre.ethers.parseEther("2")});
		transactionReceipt_ = await transactionResponse_.wait();
		// topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("EthDepositReceived").topicHash;
		// receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);

		await expect(brokenStakingWalletCosmicSignatureNft.connect(signer0).doUnstake(3)).not.to.be.reverted;
		await brokenStakingWalletCosmicSignatureNft.connect(signer0).startBlockingDeposits();
		// await expect(brokenStakingWalletCosmicSignatureNft.connect(signer0).doClaimReward(1, 0)).revertedWithCustomError(
		// 	brokenStakingWalletCosmicSignatureNft,
		// 	"FundTransferFailed"
		// );
		await expect(brokenStakingWalletCosmicSignatureNft.connect(signer0).doUnstake(1)).revertedWithCustomError(
			newStakingWalletCosmicSignatureNft,
			"FundTransferFailed"
		);
		await brokenStakingWalletCosmicSignatureNft.connect(signer0).stopBlockingDeposits();
		await expect(brokenStakingWalletCosmicSignatureNft.connect(signer0).doUnstake(1)).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.connect(signer1).unstake(2)).not.to.be.reverted;
		await expect(brokenStakingWalletCosmicSignatureNft.connect(signer0).doUnstake(1)).revertedWithCustomError(
			newStakingWalletCosmicSignatureNft,
			"NftStakeActionInvalidId"
		);
	});

	// // Comment-202409209 applies.
	// it("Changing charity address works", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {signers, stakingWalletCosmicSignatureNft,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0, signer1, signer2, signer3,] = signers;
	//
	// 	await stakingWalletCosmicSignatureNft.>>>connect>>>.setCharityAddress(signer3.address);
	// 	const charityAddr = await stakingWalletCosmicSignatureNft.charityAddress();
	// 	expect(charityAddr).to.equal(signer3.address);
	// 	await expect(stakingWalletCosmicSignatureNft.connect(signer1).setCharityAddress(signer2.address))
	// 		.revertedWithCustomError(stakingWalletCosmicSignatureNft, "OwnableUnauthorizedAccount");
	// 	await expect(stakingWalletCosmicSignatureNft.>>>connect>>>.setCharityAddress(hre.ethers.ZeroAddress))
	// 		.revertedWithCustomError(stakingWalletCosmicSignatureNft, "ZeroAddress");
	// 	// await expect(stakingWalletCosmicSignatureNft.>>>connect>>>.setCharityAddress(signer3.address))
	// 	// 	.revertedWithCustomError(stakingWalletCosmicSignatureNft, "AddressAlreadySet");
	// });

	// it("Internal staker state variables for checking uniquness are correctly set", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {deployerAcct, ownerAcct, cosmicSignatureGameProxy, cosmicSignatureNft,} =
	// 		await loadFixture(deployContractsForUnitTesting);
	//
	// 	// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);
	//
	// 	// todo-1 Is this still true, given that the test passes?
	// 	// * THIS TEST IS BROKEN for unknown reasons (hardhat trace hangs, no way to know, pending for deep debugging)
	// 	// todo-9 This contract no longer exists.
	// 	const testStakingWalletCosmicSignatureNftFactory = await hre.ethers.getContractFactory("TestStakingWalletCosmicSignatureNft", deployerAcct);
	// 	const newStakingWalletCosmicSignatureNft = await testStakingWalletCosmicSignatureNftFactory.deploy(cosmicSignatureNftAddr, cosmicSignatureGameProxyAddr);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
	//
	// 	let latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	//
	// 	let sampleTokenId = 33n;
	// 	let tokenStaked = await newStakingWalletCosmicSignatureNft.isTokenStaked(sampleTokenId);
	// 	expect(tokenStaked).to.equal(false);
	// 	await newStakingWalletCosmicSignatureNft.doInsertToken(sampleTokenId, 0n);
	// 	let tokenIndexCheck = await newStakingWalletCosmicSignatureNft.tokenIndices(sampleTokenId);
	// 	expect(tokenIndexCheck).to.equal(1);
	// 	let tokenIdCheck = await newStakingWalletCosmicSignatureNft.stakedTokens(Number(tokenIndexCheck) - 1);
	// 	expect(tokenIdCheck).to.equal(sampleTokenId);
	// 	await expect(newStakingWalletCosmicSignatureNft.doInsertToken(sampleTokenId, 0n)).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"TokenAlreadyInserted"
	// 	);
	//
	// 	await newStakingWalletCosmicSignatureNft.doRemoveToken(sampleTokenId);
	// 	await expect(newStakingWalletCosmicSignatureNft.doRemoveToken(sampleTokenId)).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"TokenAlreadyDeleted"
	// 	);
	//
	// 	const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.>>>connect>>>.bidWithEth((-1), "", {value: nextEthBidPrice_,});
	//
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
	// 	await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	// durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
	// 	await cosmicSignatureGameProxy.>>>connect>>>.claimMainPrize();
	//
	// 	await cosmicSignatureNft.>>>connect>>>.setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	// 	const transactionResponse_ = await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(0);
	// 	const transactionReceipt_ = await transactionResponse_.wait();
	// 	const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
	// 	const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	// 	// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
	//
	// 	await expect(newStakingWalletCosmicSignatureNft.doInsertToken(0, 0)).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
	// 		"TokenAlreadyInserted"
	// 	);
	// 	let numStakedNfts_ = await newStakingWalletCosmicSignatureNft.numStakedNfts();
	// 	expect(numStakedNfts_).to.equal(1);
	// 	await hre.ethers.provider.send("evm_increaseTime", [6000]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.unstake(1);
	// 	numStakedNfts_ = await newStakingWalletCosmicSignatureNft.numStakedNfts();
	// 	expect(numStakedNfts_).to.equal(0);
	// 	await expect(newStakingWalletCosmicSignatureNft.doRemoveToken(0)).revertedWithCustomError(
	// 		newStakingWalletCosmicSignatureNft,
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
	// 	// const contractBalance = await hre.ethers.provider.getBalance(stakingWalletCosmicSignatureNftAddr);
	// 	// const m = await newStakingWalletCosmicSignatureNft.modulo();
	// 	// expect(m).to.equal(contractBalance);
	// });

	it("User stakes his 10 Cosmic Signature NFTs and gets all of them back after unstake", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		const newCosmicSignatureNftAddr = await newCosmicSignatureNft.getAddress();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
		const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
			newCosmicSignatureNftAddr,
			cosmicSignatureGameProxyAddr
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr = await newStakingWalletCosmicSignatureNft.getAddress();
		await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);

		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			// It's possible to call `....mintMany` instead, but keeping it simple.
			await newCosmicSignatureNft.connect(signer0).mint(0n, signer0.address, generateRandomUInt256());
		}

		let numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(0);

		for (let i = 0; i < 10; i++) {
			const nftId_ = ((i * 7) + 2) % 10;
			const transactionResponse_ = await newStakingWalletCosmicSignatureNft.connect(signer0).stake(nftId_);
			const transactionReceipt_ = await transactionResponse_.wait();
			// const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
			// const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
			// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		}

		numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(10);

		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			const o = await newCosmicSignatureNft.ownerOf(nftId_);
			expect(o).to.equal(newStakingWalletCosmicSignatureNftAddr);
		}

		const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer0).bidWithEth((-1), "", {value: nextEthBidPrice_,});

		const durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await cosmicSignatureGameProxy.connect(signer0).claimMainPrize();

		// forward timestamp se we can unstake
		// todo-1 The forwarding no longer needed, right?
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");

		for ( let stakeActionId_ = 5; stakeActionId_ <= 10; ++ stakeActionId_ ) {
			await newStakingWalletCosmicSignatureNft.connect(signer0).unstake(stakeActionId_);
		}
		await newStakingWalletCosmicSignatureNft.connect(signer0).unstakeMany([3, 4, 2]);
		await newStakingWalletCosmicSignatureNft.connect(signer0).unstake(1);

		numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(0);

		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			const o = await newCosmicSignatureNft.ownerOf(nftId_);
			expect(o).to.equal(signer0.address);
		}
	});

	// // Comment-202409209 applies.
	// it("StakingWalletCosmicSignatureNft is properly distributing prize amount() (modulo check)", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, stakingWalletCosmicSignatureNft,} =
	// 		await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0, signer1, signer2, signer3,] = signers;
	//
	// 	let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", {value: nextEthBidPrice_,});
	// 	let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
	// 	await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();
	//
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", {value: nextEthBidPrice_,});
	// 	durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
	// 	await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await cosmicSignatureGameProxy.connect(signer2).claimMainPrize();
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", {value: nextEthBidPrice_,});
	// 	durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
	// 	await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await cosmicSignatureGameProxy.connect(signer3).claimMainPrize();
	//
	// 	await cosmicSignatureNft.connect(signer1).setApprovalForAll(stakingWalletCosmicSignatureNftAddr, true);
	// 	await cosmicSignatureNft.connect(signer2).setApprovalForAll(stakingWalletCosmicSignatureNftAddr, true);
	// 	await cosmicSignatureNft.connect(signer3).setApprovalForAll(stakingWalletCosmicSignatureNftAddr, true);
	//
	// 	// make all winners to stake their NFTs
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
	// 	nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
	// 	await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", {value: nextEthBidPrice_,});
	// 	durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
	// 	await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
	// 	// await hre.ethers.provider.send("evm_mine");
	//
	// 	const previousModulo = await stakingWalletCosmicSignatureNft.modulo();
	// 	const prevCosmicSignatureNftStakingTotalEthRewardAmount_ = await cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
	// 	const csTotalSupply = await cosmicSignatureNft.totalSupply();
	// 	const roundNum = await cosmicSignatureGameProxy.roundNum();
	// 	const transactionResponse_ = await cosmicSignatureGameProxy.connect(signer3).claimMainPrize();
	// 	const transactionReceipt_ = await transactionResponse_.wait();
	// 	const topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent("EthDepositReceived").topicHash;
	// 	const log = transactionReceipt_.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 	const parsed_log = stakingWalletCosmicSignatureNft.interface.parseLog(log);
	// 	const depositRecord = await stakingWalletCosmicSignatureNft.ethDeposits(parsed_log.args.depositNum);
	// 	const amountInRound = depositRecord.depositAmount / depositRecord.numStaked;
	// 	const moduloInRound = depositRecord.depositAmount % depositRecord.numStaked;
	// 	expect(parsed_log.args.amount).to.equal(prevCosmicSignatureNftStakingTotalEthRewardAmount_);
	// 	expect(parsed_log.args.modulo).to.equal(moduloInRound);
	//
	// 	// todo-0 This contract no longer exists.
	// 	const brokenCharityFactory = await hre.ethers.getContractFactory("BrokenCharity", deployerAcct);
	// 	const brokenCharity = await brokenCharityFactory.deploy();
	// 	await brokenCharity.waitForDeployment();
	//
	// 	await stakingWalletCosmicSignatureNft.>>>connect>>>.setCharityAddress(brokenCharityAddr);
	// 	await expect(stakingWalletCosmicSignatureNft.moduloToCharity()).revertedWithCustomError(stakingWalletCosmicSignatureNft, "FundTransferFailed");
	// 	await stakingWalletCosmicSignatureNft.>>>connect>>>.setCharityAddress(signer3.address);
	// 	await expect(stakingWalletCosmicSignatureNft.moduloToCharity()).not.to.be.reverted;
	// 	await expect(stakingWalletCosmicSignatureNft.connect(signer1).moduloToCharity()).revertedWithCustomError(stakingWalletCosmicSignatureNft, "OwnableUnauthorizedAccount");
	// 	await expect(stakingWalletCosmicSignatureNft.moduloToCharity()).revertedWithCustomError(stakingWalletCosmicSignatureNft, "ModuloIsZero");
	// });

	it("Shouldn't be possible to use an NFT twice for stake/unstake", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxyAddr, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		const newCosmicSignatureNftAddr = await newCosmicSignatureNft.getAddress();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);

		await newCosmicSignatureNft.connect(signer0).mintMany(0n, [signer0.address, signer0.address,], 0xd589c6e3858d6f65cf949aff0013c30c2a926438b28bba72665a0485b9e02d5fn);

		let newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
			newCosmicSignatureNftAddr,
			cosmicSignatureGameProxyAddr
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr = await newStakingWalletCosmicSignatureNft.getAddress();
		await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);

		const transactionResponse_ = await newStakingWalletCosmicSignatureNft.connect(signer0).stake(0);
		const transactionReceipt_ = await transactionResponse_.wait();
		// const topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		// const receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// const log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).unstake(1)).not.to.be.reverted;
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).stake(0)).revertedWithCustomError(newStakingWalletCosmicSignatureNft, "NftHasAlreadyBeenStaked");

		// await newStakingWalletCosmicSignatureNft.connect(signer0).doInsertToken(1n, 1n);
		// await expect(newStakingWalletCosmicSignatureNft.connect(signer0).doInsertToken(1n, 1n)).revertedWithCustomError(newStakingWalletCosmicSignatureNft, "TokenAlreadyInserted");
		// await expect(newStakingWalletCosmicSignatureNft.connect(signer0).doRemoveToken(0n)).revertedWithCustomError(newStakingWalletCosmicSignatureNft, "TokenAlreadyDeleted");
	});

	it("Deposits with value=0 do not create irregularities in StakingWalletCosmicSignatureNft", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
		await newCosmicSignatureNft.waitForDeployment();
		const newCosmicSignatureNftAddr = await newCosmicSignatureNft.getAddress();
		await newCosmicSignatureNft.transferOwnership(ownerAcct.address);

		await newCosmicSignatureNft.connect(signer0).mintMany(0n, [signer0.address, signer0.address, signer0.address,], 0x2591cfa4282892204fe9978a44fd2eb34bad51ec1721cef543989de6f0742ed7n);

		let newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
			newCosmicSignatureNftAddr,
			signer0.address
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr = await newStakingWalletCosmicSignatureNft.getAddress();
		await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
		await newCosmicSignatureNft.connect(signer0).setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
		await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);

		let transactionResponse_ = await newStakingWalletCosmicSignatureNft.connect(signer0).stake(0);
		let transactionReceipt_ = await transactionResponse_.wait();
		// let topic_sig = newStakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		// let receipt_logs = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
		// let log = newStakingWalletCosmicSignatureNft.interface.parseLog(receipt_logs[0]);
		// let unstakeTime = log.args.unstakeTime;
		let numStakedNfts = await newStakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts).to.equal(1);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(newStakingWalletCosmicSignatureNft.connect(signer0).deposit(0)).not.to.be.reverted; // msg.value = 0
		await newStakingWalletCosmicSignatureNft.connect(signer0).unstake(1);
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		// await hre.ethers.provider.send("evm_mine");
		// await expect(newStakingWalletCosmicSignatureNft.connect(signer0).claimManyRewards([1], [0])).not.to.be.reverted;

		await newStakingWalletCosmicSignatureNft.connect(signer0).stake(1);
		await newStakingWalletCosmicSignatureNft.connect(signer0).stake(2);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");
		await newStakingWalletCosmicSignatureNft.connect(signer0).deposit(1); // msg.value = 0
		// await expect(newStakingWalletCosmicSignatureNft.connect(signer0).unstakeClaim(3, 1)).not.to.be.reverted;
		await newStakingWalletCosmicSignatureNft.connect(signer0).unstakeMany([5, 4]);
	});
	
	// it("A staker can't claim staking reward on their second deposit", async function () {
	// 	const [signer0, signer1,] = await hre.ethers.getSigners();
	// 	// todo-9 Instead of this, call `loadFixture` or at least `deployContractsForUnitTesting` or `deployContractsForUnitTestingAdvanced`.
	// 	const {ownerAcct, cosmicSignatureGameProxy, cosmicSignatureNftFactory, stakingWalletCosmicSignatureNftFactory,} =
	// 		await deployContractsAdvanced(
	// 			signer0,
	// 			"SpecialCosmicSignatureGame",
	// 			"",
	// 			signer1.address,
	// 			false,
	// 			-1_000_000_000n // todo-9 <<< Is this the correct value?
	// 		);
	//
	// 	const newCosmicSignatureNft = await cosmicSignatureNftFactory.deploy(signer0.address);
	// 	// todo-1 Call `await waitForDeployment`.
	// 	await newCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	// todo-1 Mint multiple at once.
	// 	await newCosmicSignatureNft.>>>connect>>>.mint(0n, signer0.address, 0x6635be94e447b02fa0b9169d7aaff0e6da09775b6b70837285f1600efd5f200en);
	// 	await newCosmicSignatureNft.>>>connect>>>.mint(0n, signer0.address, 0xf156dbb407ecec7d95b02144ffa583dbd66f17fe599c87783f28dad2cff7f9dfn);
	//
	// 	const newStakingWalletCosmicSignatureNft = await stakingWalletCosmicSignatureNftFactory.deploy(
	// 		newCosmicSignatureNftAddr,
	// 		cosmicSignatureGameProxyAddr
	// 	);
	// 	await newStakingWalletCosmicSignatureNft.waitForDeployment();
	// 	await newStakingWalletCosmicSignatureNft.transferOwnership(ownerAcct.address);
	// 	await newCosmicSignatureNft.>>>connect>>>.setApprovalForAll(newStakingWalletCosmicSignatureNftAddr, true);
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr);
	// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	//
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(0);
	//
	// 	await hre.ethers.provider.send("evm_increaseTime", [600]);
	// 	// await hre.ethers.provider.send("evm_mine");
	//
	// 	await cosmicSignatureGameProxy.>>>connect>>>.depositToStakingWalletCosmicSignatureNft({ value: hre.ethers.parseEther("2") });
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.unstake(1);
	// 	await newStakingWalletCosmicSignatureNft.claimManyRewards([1], [0]);
	//
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.stake(1);
	//
	// 	await hre.ethers.provider.send("evm_increaseTime", [600]);
	// 	// await hre.ethers.provider.send("evm_mine");
	//
	// 	await cosmicSignatureGameProxy.>>>connect>>>.depositToStakingWalletCosmicSignatureNft({ value: hre.ethers.parseEther("3") });
	//
	// 	await newStakingWalletCosmicSignatureNft.>>>connect>>>.unstake(3);
	// 	let depositId = 1n;		// 1 because it is a new deposit, The staker wants to claim staking reward on their second deposit.
	// 	await expect(newStakingWalletCosmicSignatureNft.claimManyRewards([3], [depositId])).not.to.be.reverted;
	// });

	it("Shouldn't be possible to deploy StakingWalletCosmicSignatureNft with zero-address-ed parameters", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, stakingWalletCosmicSignatureNftFactory,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		await expect(stakingWalletCosmicSignatureNftFactory.deploy(hre.ethers.ZeroAddress, signer0.address /* , {gasLimit: 3000000} */)).revertedWithCustomError(stakingWalletCosmicSignatureNftFactory, "ZeroAddress");
		await expect(stakingWalletCosmicSignatureNftFactory.deploy(signer0.address, hre.ethers.ZeroAddress /* , {gasLimit: 3000000} */)).revertedWithCustomError(stakingWalletCosmicSignatureNftFactory, "ZeroAddress");
	});
});
