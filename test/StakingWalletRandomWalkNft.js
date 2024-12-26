"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt256 } = require("../src/Helpers.js");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("StakingWalletRandomWalkNft", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("Shouldn't be possible to unstake() twice", async function () {
		const {signers, randomWalkNft, stakingWalletRandomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		// const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		// const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		// await newCosmicSignatureNft.waitForDeployment();

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.mint({ value: tokenPrice });

		const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		let newStakingWalletRandomWalkNft = await StakingWalletRandomWalkNft.deploy(await randomWalkNft.getAddress());
		await newStakingWalletRandomWalkNft.waitForDeployment();
		await randomWalkNft.setApprovalForAll(await newStakingWalletRandomWalkNft.getAddress(), true);

		let tx = await newStakingWalletRandomWalkNft.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletRandomWalkNft.interface.parseLog(receipt_logs[0]);

		// expect(await newStakingWalletRandomWalkNft.wasNftUsed(0)).to.equal(true);
		expect(await newStakingWalletRandomWalkNft.wasNftUsed(0)).to.equal(1n);
		// expect(await newStakingWalletRandomWalkNft.stakerByTokenId(0)).to.equal(owner.address);
		// expect(await newStakingWalletRandomWalkNft.stakerByTokenId(99)).to.equal(hre.ethers.ZeroAddress);
		// expect(await newStakingWalletRandomWalkNft.lastActionIdByTokenId(0)).to.equal(0);
		// expect(await newStakingWalletRandomWalkNft.lastActionIdByTokenId(99)).to.equal(-2);

		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		await hre.ethers.provider.send("evm_mine");
		await newStakingWalletRandomWalkNft.unstake(0);

		await expect(newStakingWalletRandomWalkNft.unstake(0)).to.be.revertedWithCustomError(newStakingWalletRandomWalkNft, "NftStakeActionInvalidId");
	});
	it("Shouldn't be possible to unstake by a user different from the owner", async function () {
		const {signers, randomWalkNft, stakingWalletRandomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		// const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		// const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		// await newCosmicSignatureNft.waitForDeployment();

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.mint({ value: tokenPrice });

		const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		const newStakingWalletRandomWalkNft = await StakingWalletRandomWalkNft.deploy(await randomWalkNft.getAddress());
		await newStakingWalletRandomWalkNft.waitForDeployment();
		await randomWalkNft.setApprovalForAll(await newStakingWalletRandomWalkNft.getAddress(), true);

		const tx = await newStakingWalletRandomWalkNft.stake(0);
		const receipt = await tx.wait();
		const topic_sig = stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		const receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const log = stakingWalletRandomWalkNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		await hre.ethers.provider.send("evm_mine");

		await expect(newStakingWalletRandomWalkNft.connect(addr1).unstake(1)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NftStakeActionAccessDenied");
	});
	// it("Internal staker state variables for checking uniquness are correctly set", async function () {
	// 	const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
	// 	const [owner,] = signers;
	// 	const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	//
	// 	await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);
	//
	// 	const NewStakingWalletRandomWalkNft = await hre.ethers.getContractFactory("TestStakingWalletRandomWalkNft");
	// 	let newStakingWalletRandomWalkNft = await NewStakingWalletRandomWalkNft.deploy(await randomWalkNft.getAddress());
	// 	await newStakingWalletRandomWalkNft.waitForDeployment();
	// 	await cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(await newStakingWalletRandomWalkNft.getAddress());
	// 	// await cosmicSignatureGameProxy.setRuntimeMode();
	// 	let latestBlock_ = await hre.ethers.provider.getBlock("latest");
	// 	await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
	// 	let sampleTokenId = 33;
	// 	let tokenStaked = await newStakingWalletRandomWalkNft.isTokenStaked(sampleTokenId);
	// 	expect(tokenStaked).to.equal(false);
	// 	await newStakingWalletRandomWalkNft.doInsertToken(sampleTokenId,0);
	// 	let tokenIndexCheck = await newStakingWalletRandomWalkNft.tokenIndices(sampleTokenId);
	// 	expect(tokenIndexCheck).to.equal(1);
	// 	let tokenIdCheck = await newStakingWalletRandomWalkNft.stakedTokens(Number(tokenIndexCheck)-1);
	// 	expect(tokenIdCheck).to.equal(sampleTokenId);
	// 	await expect(newStakingWalletRandomWalkNft.doInsertToken(sampleTokenId,0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenAlreadyInserted");
	//
	// 	await newStakingWalletRandomWalkNft.doRemoveToken(sampleTokenId);
	// 	await expect(newStakingWalletRandomWalkNft.doRemoveToken(owner.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenAlreadyDeleted");
	// 	await randomWalkNft.setApprovalForAll(await newStakingWalletRandomWalkNft.getAddress(), true);
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
	// 	let r1 = await mint_rwalk(owner);
	// 	let r2 = await mint_rwalk(owner);
	// 	let r3 = await mint_rwalk(owner);
	// 	let tx = await newStakingWalletRandomWalkNft.stakeMany([r1, r2, r3]);
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
	// 	await hre.ethers.provider.send("evm_increaseTime", [600+1]);
	// 	await newStakingWalletRandomWalkNft.unstakeMany([r1, r2, r3]);
	// 	numStakedNfts_ = await newStakingWalletRandomWalkNft.numStakedNfts();
	// 	expect(numStakedNfts_).to.equal(0);
	// });
	it("User stakes his 10 RandomWalk NFTs and gets all of them back after unstake", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft, stakingWalletRandomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			let tokenPrice = await randomWalkNft.getMintPrice();
			await randomWalkNft.mint({ value: tokenPrice });
		}
		await randomWalkNft.setApprovalForAll(await stakingWalletRandomWalkNft.getAddress(), true);
		for ( let nftId_ = 0; nftId_ < 10; ++ nftId_ ) {
			let tx = await stakingWalletRandomWalkNft.stake(nftId_);
		}

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.bid(/*params*/ (-1), "", { value: bidPrice });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send("evm_mine");
		await cosmicSignatureGameProxy.claimMainPrize();

		// forward timestamp se we can unstake
		// todo-1 The forwarding no longer needed, right?
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 60*3600*24]);
		await hre.ethers.provider.send("evm_mine");

		for ( let stakeActionId_ = 1; stakeActionId_ <= 10; ++ stakeActionId_ ) {
			await stakingWalletRandomWalkNft.unstake(stakeActionId_);
			const nftId_ = stakeActionId_ - 1;
			let o = await randomWalkNft.ownerOf(nftId_);
			expect(o).to.equal(owner.address);
		}
	});
	it("The random picking of winner from StakingWalletRandomWalkNft is really random", async function () {
		const {signers, randomWalkNft,} = await loadFixture(deployContractsForTesting);

		// const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		// const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		// await newCosmicSignatureNft.waitForDeployment();

		const NewStakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		const newStakingWalletRandomWalkNft = await NewStakingWalletRandomWalkNft.deploy(
			await randomWalkNft.getAddress()
		);
		await newStakingWalletRandomWalkNft.waitForDeployment();

		// await expect(newStakingWalletRandomWalkNft.pickRandomStakerAddress(hre.ethers.hashMessage("0xffff"))).to.be.revertedWithCustomError(newStakingWalletRandomWalkNft, "NoStakedNfts");
		{
			const luckyAddr = await newStakingWalletRandomWalkNft.pickRandomStakerAddressIfPossible(/*hre.ethers.hashMessage("0xffff")*/ 101n);
			expect(luckyAddr).to.equal(hre.ethers.ZeroAddress);
		}

		// todo-1 Make sure this logic doesn't result in marketing wallet bidding with CST.
		// todo-1 Reference Comment-202412251.
		const numSigners = 20;
		const numLoops = 50;
		// const randomSeed = 11235813; // fib
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			await randomWalkNft.connect(signer).setApprovalForAll(await newStakingWalletRandomWalkNft.getAddress(), true);
		}
		for (let i = 0; i < numSigners; i++) {
			const signer = signers[i];
			for (let j = 0; j < numLoops; j++) {
				let mintPrice = await randomWalkNft.getMintPrice();
				await randomWalkNft.connect(signer).mint({ value: mintPrice });
				const nftId_ = i * numLoops + j;
				await newStakingWalletRandomWalkNft.connect(signer).stake(nftId_);
			}
		}
		// verification algorithm is simple: if from 1000 staked tokens at least
		// 1 staker is chosen (i.e. all stakers win at least 1 token)
		// then we consider randomness works. Sample size is 300 (30% of the population)
		// Now the same process for RandomWalk verification
		{
			const luckyStakers = {};
			const numSamples = 300;
			for (let i = 0; i < numSamples; i++) {
				// const r = Math.floor(Math.random() * 0xffffffff).toString(16).padEnd(8, "0")
				const luckyAddr = await newStakingWalletRandomWalkNft.pickRandomStakerAddressIfPossible(/*hre.ethers.hashMessage("0x" + r)*/ generateRandomUInt256());
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
		const {randomWalkNft, stakingWalletRandomWalkNft,} = await loadFixture(deployContractsForTesting);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		// const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		// const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		// const newCosmicSignatureNft = await CosmicSignatureNft.deploy(owner.address);
		// await newCosmicSignatureNft.waitForDeployment();
		
		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.mint({ value: tokenPrice });

		const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		let newStakingWalletRandomWalkNft = await StakingWalletRandomWalkNft.deploy(await randomWalkNft.getAddress());
		await newStakingWalletRandomWalkNft.waitForDeployment();
		await randomWalkNft.setApprovalForAll(await newStakingWalletRandomWalkNft.getAddress(), true);

		let tx = await newStakingWalletRandomWalkNft.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletRandomWalkNft.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		await hre.ethers.provider.send("evm_mine");
		await newStakingWalletRandomWalkNft.unstake(1);

		await expect(newStakingWalletRandomWalkNft.stake(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NftOneTimeStaking");
	});
});
