"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt256 } = require("../src/Helpers.js");
const { deployContractsForUnitTesting, assertAddressIsValid } = require("../src/ContractUnitTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("StakingWalletRandomWalkNft", function () {
	it("It's impossible to unstake an NFT twice", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, randomWalkNft, randomWalkNftAddr, stakingWalletRandomWalkNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer0).mint({ value: tokenPrice });

		const newStakingWalletRandomWalkNft = await stakingWalletRandomWalkNftFactory.deploy(randomWalkNftAddr);
		await newStakingWalletRandomWalkNft.waitForDeployment();
		const newStakingWalletRandomWalkNftAddr = await newStakingWalletRandomWalkNft.getAddress();
		await randomWalkNft.connect(signer0).setApprovalForAll(newStakingWalletRandomWalkNftAddr, true);

		let tx = await newStakingWalletRandomWalkNft.connect(signer0).stake(0);
		let receipt = await tx.wait();
		// let topic_sig = newStakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		// let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// let log = newStakingWalletRandomWalkNft.interface.parseLog(receipt_logs[0]);

		expect(await newStakingWalletRandomWalkNft.usedNfts(0)).to.equal(1n);
		// expect(await newStakingWalletRandomWalkNft.stakerByTokenId(0)).to.equal(signer0.address);
		// expect(await newStakingWalletRandomWalkNft.stakerByTokenId(99)).to.equal(hre.ethers.ZeroAddress);
		// expect(await newStakingWalletRandomWalkNft.lastActionIdByTokenId(0)).to.equal(0);
		// expect(await newStakingWalletRandomWalkNft.lastActionIdByTokenId(99)).to.equal(-2);

		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");
		await newStakingWalletRandomWalkNft.connect(signer0).unstake(1);

		await expect(newStakingWalletRandomWalkNft.connect(signer0).unstake(1)).to.be.revertedWithCustomError(newStakingWalletRandomWalkNft, "NftStakeActionInvalidId");
	});
	
	it("Shouldn't be possible to unstake by a user different from the owner", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, randomWalkNft, randomWalkNftAddr, stakingWalletRandomWalkNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer0).mint({ value: tokenPrice });

		const newStakingWalletRandomWalkNft = await stakingWalletRandomWalkNftFactory.deploy(randomWalkNftAddr);
		await newStakingWalletRandomWalkNft.waitForDeployment();
		const newStakingWalletRandomWalkNftAddr = await newStakingWalletRandomWalkNft.getAddress();
		await randomWalkNft.connect(signer0).setApprovalForAll(newStakingWalletRandomWalkNftAddr, true);

		const tx = await newStakingWalletRandomWalkNft.connect(signer0).stake(0);
		const receipt = await tx.wait();
		// const topic_sig = newStakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		// const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// const log = newStakingWalletRandomWalkNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");

		await expect(newStakingWalletRandomWalkNft.connect(signer1).unstake(1)).to.be.revertedWithCustomError(newStakingWalletRandomWalkNft, "NftStakeActionAccessDenied");
	});
	
	// it("Internal staker state variables for checking uniquness are correctly set", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, randomWalkNft, randomWalkNftAddr,} =
	// 		await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0,] = signers;
	//
	// 	// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);
	//
	// 	// todo-9 This contract no longer exists.
	// 	const testStakingWalletRandomWalkNftFactory = await hre.ethers.getContractFactory("TestStakingWalletRandomWalkNft", deployerAcct);
	// 	const newStakingWalletRandomWalkNft = await testStakingWalletRandomWalkNftFactory.deploy(randomWalkNftAddr);
	// 	await newStakingWalletRandomWalkNft.waitForDeployment();
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setStakingWalletRandomWalkNft(newStakingWalletRandomWalkNftAddr);
	//
	// 	let latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);
	//
	// 	let sampleTokenId = 33;
	// 	let tokenStaked = await newStakingWalletRandomWalkNft.isTokenStaked(sampleTokenId);
	// 	expect(tokenStaked).to.equal(false);
	// 	await newStakingWalletRandomWalkNft.connect(signer0).doInsertToken(sampleTokenId, 0);
	// 	let tokenIndexCheck = await newStakingWalletRandomWalkNft.tokenIndices(sampleTokenId);
	// 	expect(tokenIndexCheck).to.equal(1);
	// 	let tokenIdCheck = await newStakingWalletRandomWalkNft.stakedTokens(Number(tokenIndexCheck)-1);
	// 	expect(tokenIdCheck).to.equal(sampleTokenId);
	// 	await expect(newStakingWalletRandomWalkNft.connect(signer0).doInsertToken(sampleTokenId, 0)).to.be.revertedWithCustomError(newStakingWalletRandomWalkNft, "TokenAlreadyInserted");
	//
	// 	await newStakingWalletRandomWalkNft.connect(signer0).doRemoveToken(sampleTokenId);
	// 	await expect(newStakingWalletRandomWalkNft.connect(signer0).doRemoveToken(signer0.address)).to.be.revertedWithCustomError(newStakingWalletRandomWalkNft, "TokenAlreadyDeleted");
	// 	await randomWalkNft.connect(signer0).setApprovalForAll(newStakingWalletRandomWalkNftAddr, true);
	// 	async function mint_rwalk(a) {
	// 		let tokenPrice = await randomWalkNft.getMintPrice();
	// 		let tx = await randomWalkNft.connect(a).mint({ value: tokenPrice });
	// 		let receipt = await tx.wait();
	// 		let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
	// 		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
	// 		let parsed_log = randomWalkNft.interface.parseLog(log);
	// 		let token_id = parsed_log.args[0];
	// 		return token_id;
	// 	}
	// 	let r1 = await mint_rwalk(signer0);
	// 	let r2 = await mint_rwalk(signer0);
	// 	let r3 = await mint_rwalk(signer0);
	// 	let tx = await newStakingWalletRandomWalkNft.connect(signer0).stakeMany([r1, r2, r3]);
	// 	let receipt = await tx.wait();
	// 	let topic_sig = newStakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
	// 	let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	// 	for (let i=0; i<receipt_logs.length; i++) {
	// 		let evt = newStakingWalletRandomWalkNft.interface.parseLog(receipt_logs[i]);
	// 	}
	//
	// 	let numStakedNfts_ = await newStakingWalletRandomWalkNft.numStakedNfts();
	// 	expect(numStakedNfts_).to.equal(3);
	// 	let isStaked = await newStakingWalletRandomWalkNft.isTokenStaked(r1);
	// 	expect(isStaked).to.equal(true);
	// 	isStaked = await newStakingWalletRandomWalkNft.isTokenStaked(r2);
	// 	expect(isStaked).to.equal(true);
	// 	isStaked = await newStakingWalletRandomWalkNft.isTokenStaked(r3);
	// 	expect(isStaked).to.equal(true);
	//
	// 	await hre.ethers.provider.send("evm_increaseTime", [600 + 1]);
	// 	// await hre.ethers.provider.send("evm_mine");
	// 	await newStakingWalletRandomWalkNft.connect(signer0).unstakeMany([r1, r2, r3]);
	// 	numStakedNfts_ = await newStakingWalletRandomWalkNft.numStakedNfts();
	// 	expect(numStakedNfts_).to.equal(0);
	// });
	
	it("User stakes his 10 Random Walk NFTs and gets all of them back after unstake", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, cosmicSignatureGameProxy, randomWalkNft, stakingWalletRandomWalkNft, stakingWalletRandomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			let tokenPrice = await randomWalkNft.getMintPrice();
			await randomWalkNft.connect(signer0).mint({ value: tokenPrice });
		}
		await randomWalkNft.connect(signer0).setApprovalForAll(stakingWalletRandomWalkNftAddr, true);
		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			let tx = await stakingWalletRandomWalkNft.connect(signer0).stake(nftId_);
		}

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer0).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await cosmicSignatureGameProxy.connect(signer0).claimMainPrize();

		// forward timestamp se we can unstake
		// todo-1 The forwarding no longer needed, right?
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 60 * 24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		for ( let stakeActionId_ = 1; stakeActionId_ <= 10; ++ stakeActionId_ ) {
			await stakingWalletRandomWalkNft.connect(signer0).unstake(stakeActionId_);
			const nftId_ = stakeActionId_ - 1;
			let o = await randomWalkNft.ownerOf(nftId_);
			expect(o).to.equal(signer0.address);
		}
	});

	it("The random picking of a staker is really random", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, randomWalkNft, stakingWalletRandomWalkNft, stakingWalletRandomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);

		{
			const luckyStakerAddresses = await stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(12n, /*hre.ethers.hashMessage("0xffff")*/ 0xe1027c1afb832e7bd4ac3301523cf66aed14912422b036d444e0c2d4adc0afa2n);
			expect(luckyStakerAddresses.length).equal(0);
		}

		const numSigners = 20;
		const numLoops = 50;

		{
			let nftId = 0n;
			const nftIds = [];
			for (let i = 0; i < numSigners; i++) {
				nftIds.length = 0;
				const signer = signers[i];
				for (let j = 0; j < numLoops; j++) {
					const mintPrice = await randomWalkNft.getMintPrice();
					await expect(randomWalkNft.connect(signer).mint({value: mintPrice})).not.reverted;
					nftIds.push(nftId);
					++ nftId;
				}
				await expect(randomWalkNft.connect(signer).setApprovalForAll(stakingWalletRandomWalkNftAddr, true)).not.reverted;
				await expect(stakingWalletRandomWalkNft.connect(signer).stakeMany(nftIds)).not.reverted;
			}
		}

		// verification algorithm is simple: if from 1000 staked NFTs at least
		// 1 staker is chosen (i.e. all stakers win at least 1 NFT)
		// then we consider randomness works.
		// Sample size is 300 (30% of the population)
		{
			const luckyStakers = {};
			const numSamples = 300;
			const luckyStakerAddresses_ = await stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(numSamples, generateRandomUInt256());
			expect(luckyStakerAddresses_.length).equal(numSamples);
			for (const luckyStakerAddress_ of luckyStakerAddresses_) {
				assertAddressIsValid(luckyStakerAddress_);
				let numToks = luckyStakers[luckyStakerAddress_];
				if (numToks == undefined) {
					numToks = 1;
				} else {
					++ numToks;
				}
				luckyStakers[luckyStakerAddress_] = numToks;
			}
			for (let i = 0; i < numSigners; i++) {
				const signer = signers[i];
				const numToks = luckyStakers[signer.address];
				if (numToks == undefined) {
					const msg = "The random picking of a staker is not random. Staker " + signer.address;
					throw msg;
				}
				expect(numToks).not.equal(0);
			}
		}
	});
	
	it("Shouldn't be possible to use an NFT twice for stake/unstake", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, randomWalkNft, randomWalkNftAddr, stakingWalletRandomWalkNftFactory,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(signer0).mint({ value: tokenPrice });

		const newStakingWalletRandomWalkNft = await stakingWalletRandomWalkNftFactory.deploy(randomWalkNftAddr);
		await newStakingWalletRandomWalkNft.waitForDeployment();
		const newStakingWalletRandomWalkNftAddr = await newStakingWalletRandomWalkNft.getAddress();
		await randomWalkNft.connect(signer0).setApprovalForAll(newStakingWalletRandomWalkNftAddr, true);

		let tx = await newStakingWalletRandomWalkNft.connect(signer0).stake(0);
		let receipt = await tx.wait();
		// let topic_sig = newStakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		// let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// let log = newStakingWalletRandomWalkNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		// await hre.ethers.provider.send("evm_mine");
		await newStakingWalletRandomWalkNft.connect(signer0).unstake(1);

		await expect(newStakingWalletRandomWalkNft.connect(signer0).stake(0)).to.be.revertedWithCustomError(newStakingWalletRandomWalkNft, "NftHasAlreadyBeenStaked");
	});
});
