"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt256 } = require("../src/Helpers.js");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = false;

describe("StakingWalletRandomWalkNft", function () {
	async function deployCosmicSignature(deployerAcct) {
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
			// cosmicSignatureGame,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false);
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
			// cosmicSignatureGame,
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
	it("Shouldn't be possible to unstake() twice", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
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
		expect(await newStakingWalletRandomWalkNft.stakerByTokenId(0)).to.equal(owner.address);
		expect(await newStakingWalletRandomWalkNft.stakerByTokenId(99)).to.equal(hre.ethers.ZeroAddress);
		expect(await newStakingWalletRandomWalkNft.lastActionIdByTokenId(0)).to.equal(0);
		expect(await newStakingWalletRandomWalkNft.lastActionIdByTokenId(99)).to.equal(-2);

		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		await hre.ethers.provider.send("evm_mine");
		await newStakingWalletRandomWalkNft.unstake(0);

		await expect(newStakingWalletRandomWalkNft.unstake(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NftAlreadyUnstaked");
	});
	it("Shouldn't be possible to unstake by a user different from the owner", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
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
	it("Internal staker state variables for checking uniquness are correctly set", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, addr1.address, false);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const NewStakingWalletRandomWalkNft = await hre.ethers.getContractFactory("TestStakingWalletRandomWalkNft");
		let newStakingWalletRandomWalkNft = await NewStakingWalletRandomWalkNft.deploy(await randomWalkNft.getAddress());
		await newStakingWalletRandomWalkNft.waitForDeployment();
		await cosmicSignatureGameProxy.setStakingWalletRandomWalkNft(await newStakingWalletRandomWalkNft.getAddress());
		// await cosmicSignatureGameProxy.setRuntimeMode();
		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);
		let sampleTokenId = 33;
		let tokenStaked = await newStakingWalletRandomWalkNft.isTokenStaked(sampleTokenId);
		expect(tokenStaked).to.equal(false);
		await newStakingWalletRandomWalkNft.doInsertToken(sampleTokenId,0);
		let tokenIndexCheck = await newStakingWalletRandomWalkNft.tokenIndices(sampleTokenId);
		expect(tokenIndexCheck).to.equal(1);
		let tokenIdCheck = await newStakingWalletRandomWalkNft.stakedTokens(Number(tokenIndexCheck)-1);
		expect(tokenIdCheck).to.equal(sampleTokenId);
		await expect(newStakingWalletRandomWalkNft.doInsertToken(sampleTokenId,0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenAlreadyInserted");

		await newStakingWalletRandomWalkNft.doRemoveToken(sampleTokenId);
		await expect(newStakingWalletRandomWalkNft.doRemoveToken(owner.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "TokenAlreadyDeleted");
		await randomWalkNft.setApprovalForAll(await newStakingWalletRandomWalkNft.getAddress(), true);
		async function mint_rwalk(a) {
			let tokenPrice = await randomWalkNft.getMintPrice();
			let tx = await randomWalkNft.connect(a).mint({ value: tokenPrice });
			let receipt = await tx.wait();
			let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNft.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}
		let r1 = await mint_rwalk(owner);
		let r2 = await mint_rwalk(owner);
		let r3 = await mint_rwalk(owner);
		let tx = await newStakingWalletRandomWalkNft.stakeMany([r1,r2,r3]);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		for (let i=0; i<receipt_logs.length; i++) {
			let evt = newStakingWalletRandomWalkNft.interface.parseLog(receipt_logs[i]);
		}

		let numStakedNfts_ = await newStakingWalletRandomWalkNft.numStakedNfts();
		expect(numStakedNfts_).to.equal(3);
		let isStaked = await newStakingWalletRandomWalkNft.isTokenStaked(r1);
		expect(isStaked).to.equal(true);
		isStaked = await newStakingWalletRandomWalkNft.isTokenStaked(r2);
		expect(isStaked).to.equal(true);
		isStaked = await newStakingWalletRandomWalkNft.isTokenStaked(r3);
		expect(isStaked).to.equal(true);

		await hre.ethers.provider.send("evm_increaseTime", [600+1]);
		await newStakingWalletRandomWalkNft.unstakeMany([r1,r2,r3]);
		numStakedNfts_ = await newStakingWalletRandomWalkNft.numStakedNfts();
		expect(numStakedNfts_).to.equal(0);
	});
	it("User stakes his 10 RandomWalk tokens and gets all 10 tokens back after claim", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, addr1.address, false);

		for(let i=0; i < 10 ;i++) {
			let tokenPrice = await randomWalkNft.getMintPrice();
			await randomWalkNft.mint({ value: tokenPrice });
		}
		for (let i=0; i < 10; i++) {
			await randomWalkNft.setApprovalForAll(await stakingWalletRandomWalkNft.getAddress(), true);
			let tx = await stakingWalletRandomWalkNft.stake(i);
		}

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.bid(params, { value: bidPrice });

		let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await hre.ethers.provider.send("evm_mine");
		await cosmicSignatureGameProxy.claimPrize();

		// forward timestamp se we can unstake
		// todo-1 The forwarding no longer needed, right?
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime) + 60*3600*24]);
		await hre.ethers.provider.send("evm_mine");

		for (let i=0; i < 10; i++) {
			await stakingWalletRandomWalkNft.unstake(i);
			let o = await randomWalkNft.ownerOf(i);
			expect(o).to.equal(owner.address);
		}
	});
	it("The random picking of winner from StakingWalletRandomWalkNft is really random", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, addr1.address, false);

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
				const nftId = i * numLoops + j;
				await newStakingWalletRandomWalkNft.connect(signer).stake(nftId);
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
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
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
		await newStakingWalletRandomWalkNft.unstake(0);

		await expect(newStakingWalletRandomWalkNft.stake(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NftOneTimeStaking");
	});
});
