const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const SKIP_LONG_TESTS = "1";
const { basicDeployment } = require("../src//Deploy.js");

describe("Staking RandomWalk tests", function () {
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

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice })

		const StakingWalletRWalk = await ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await StakingWalletRWalk.deploy(randomWalkNFT.address,cosmicGame.address);
		await newStakingWalletRWalk.deployed();
		await randomWalkNFT.setApprovalForAll(newStakingWalletRWalk.address, true);

		let tx = await newStakingWalletRWalk.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletRWalk.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletRWalk.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await newStakingWalletRWalk.unstake(0);

		await expect(newStakingWalletRWalk.unstake(0)).to.be.revertedWith("Token has already been unstaked.");
	});
	/*
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

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice })

		const StakingWalletRWalk = await ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await StakingWalletRWalk.deploy(randomWalkNFT.address,cosmicGame.address);
		await newStakingWalletRWalk.deployed();
		await randomWalkNFT.setApprovalForAll(newStakingWalletRWalk.address, true);

		let tx = await newStakingWalletRWalk.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletRWalk.interface.getEventTopic("StakeActionEvent");
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletRWalk.interface.parseLog(receipt_logs[0]);
		let unstakeTime = log.args.unstakeTime;
		await ethers.provider.send("evm_increaseTime", [unstakeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		await expect(newStakingWalletRWalk.connect(addr1).unstake(0)).to.be.revertedWith("Only the owner can unstake.");
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice })

		const StakingWalletRWalk = await ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await StakingWalletRWalk.deploy(randomWalkNFT.address,cosmicGame.address);
		await newStakingWalletRWalk.deployed();
		await randomWalkNFT.setApprovalForAll(newStakingWalletRWalk.address, true);

		let tx = await newStakingWalletRWalk.stake(0);
		let receipt = await tx.wait();

		await expect(newStakingWalletRWalk.unstake(0)).to.be.revertedWith("Not allowed to unstake yet.");
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

		const NewStakingWalletRWalk = await ethers.getContractFactory("TestStakingWalletRWalk");
		let newStakingWalletRWalk = await NewStakingWalletRWalk.deploy(randomWalkNFT.address,cosmicGame.address);
        await newStakingWalletRWalk.deployed();
		await cosmicGame.setStakingWalletRWalk(newStakingWalletRWalk.address);
		await cosmicGame.setRuntimeMode();
		let sampleTokenId = 33;
		let tokenStaked = await newStakingWalletRWalk.isTokenStaked(sampleTokenId);
		expect(tokenStaked).to.equal(false);
		await newStakingWalletRWalk.insertToken(sampleTokenId,0);
		let tokenIndexCheck = await newStakingWalletRWalk.tokenIndices(sampleTokenId);
		expect(tokenIndexCheck).to.equal(1);
		let tokenIdCheck = await newStakingWalletRWalk.stakedTokens(tokenIndexCheck-1);
		expect(tokenIdCheck).to.equal(sampleTokenId);
		await expect(newStakingWalletRWalk.insertToken(sampleTokenId,0)).to.be.revertedWith("Token already in the list.");

		let numTokens = await newStakingWalletRWalk.numTokensStaked();
		expect(numTokens).to.equal(1);

		await newStakingWalletRWalk.removeToken(sampleTokenId);
		await expect(newStakingWalletRWalk.removeToken(owner.address)).to.be.revertedWith("Token is not in the list.");
		await randomWalkNFT.setApprovalForAll(newStakingWalletRWalk.address, true);
		async function mint_rwalk(a) {
			let tokenPrice = await randomWalkNFT.getMintPrice();
			let tx = await randomWalkNFT.connect(a).mint({ value: tokenPrice });
			let receipt = await tx.wait();
			let topic_sig = randomWalkNFT.interface.getEventTopic("MintEvent");
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNFT.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}
		let r1 = await mint_rwalk(owner);
		let r2 = await mint_rwalk(owner);
		let r3 = await mint_rwalk(owner);
		await newStakingWalletRWalk.stakeMany([r1,r2,r3]);
		numTokens = await newStakingWalletRWalk.numTokensStaked();
		expect(numTokens).to.equal(3);
		let isStaked = await newStakingWalletRWalk.isTokenStaked(r1);
		expect(isStaked).to.equal(true);
		isStaked = await newStakingWalletRWalk.isTokenStaked(r2);
		expect(isStaked).to.equal(true);
		isStaked = await newStakingWalletRWalk.isTokenStaked(r3);
		expect(isStaked).to.equal(true);
		let tIdx = await newStakingWalletRWalk.tokenByIndex(0);
		expect(tIdx).to.equal(r1);
		tIdx = await newStakingWalletRWalk.tokenByIndex(1);
		expect(tIdx).to.equal(r2);
		tIdx = await newStakingWalletRWalk.tokenByIndex(2);
		expect(tIdx).to.equal(r3);

		await ethers.provider.send("evm_increaseTime", [2]);
		await newStakingWalletRWalk.unstakeMany([r1,r2,r3]);
		numTokens = await newStakingWalletRWalk.numTokensStaked();
		expect(numTokens).to.equal(0);
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bLogic,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,true);

		for(let i=0; i < 10 ;i++) {
			let tokenPrice = await randomWalkNFT.getMintPrice();
			await randomWalkNFT.mint({ value: tokenPrice })
		}
		for (let i=0; i < 10; i++) {
			await randomWalkNFT.setApprovalForAll(stakingWalletRWalk.address, true);
			let tx = await stakingWalletRWalk.stake(i);
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
			await stakingWalletRWalk.unstake(i);
			let o = await randomWalkNFT.ownerOf(i);
			expect(o).to.equal(owner.address);
		}

	})
	it("The random picking of winner from StakingWalletRWalk is really random", async function () {
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

		const NewStakingWalletRWalk = await ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await NewStakingWalletRWalk.deploy(randomWalkNFT.address,cosmicGame.address);
        await newStakingWalletRWalk.deployed();

		let numSigners = 20;
		let numLoops = 20;
		let randomSeed = 11235813; // fib
		for (let i=0; i<numSigners; i++) {
			let signer = signers[i];
			await randomWalkNFT.connect(signer).setApprovalForAll(newStakingWalletRWalk.address, true);
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
		// Now the same process for RandomWalk verification
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
	})*/
});
