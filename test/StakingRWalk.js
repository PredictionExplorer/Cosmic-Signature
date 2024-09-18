const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("Staking RandomWalk tests", function () {
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
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
			cosmicGameImplementation,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false);

		return {
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
			cosmicGameImplementation,
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
			bidLogic,
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		// const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		// let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice })

		const StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await StakingWalletRWalk.deploy(await randomWalkNFT.getAddress());
		await newStakingWalletRWalk.waitForDeployment();
		await randomWalkNFT.setApprovalForAll(await newStakingWalletRWalk.getAddress(), true);

		let tx = await newStakingWalletRWalk.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletRWalk.interface.getEvent("StakeActionEvent").topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletRWalk.interface.parseLog(receipt_logs[0]);

		expect(await newStakingWalletRWalk.wasTokenUsed(0)).to.equal(true);
		expect(await newStakingWalletRWalk.stakerByTokenId(0)).to.equal(owner.address);
		expect(await newStakingWalletRWalk.stakerByTokenId(99)).to.equal(hre.ethers.ZeroAddress);
		expect(await newStakingWalletRWalk.lastActionIdByTokenId(0)).to.equal(0);
		expect(await newStakingWalletRWalk.lastActionIdByTokenId(99)).to.equal(-2);

		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		await hre.ethers.provider.send("evm_mine");
		await newStakingWalletRWalk.unstake(0);

		await expect(newStakingWalletRWalk.unstake(0)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyUnstaked");
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
			bidLogic,
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		// const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		// let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice })

		const StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await StakingWalletRWalk.deploy(await randomWalkNFT.getAddress());
		await newStakingWalletRWalk.waitForDeployment();
		await randomWalkNFT.setApprovalForAll(await newStakingWalletRWalk.getAddress(), true);

		let tx = await newStakingWalletRWalk.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletRWalk.interface.getEvent("StakeActionEvent").topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletRWalk.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		await hre.ethers.provider.send("evm_mine");

		await expect(newStakingWalletRWalk.connect(addr1).unstake(0)).to.be.revertedWithCustomError(contractErrors,"AccessError");
	});
	it("Internal staker state variables for checking uniquness are correctly set", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
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
			cosmicGameImplementation,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		const NewStakingWalletRWalk = await hre.ethers.getContractFactory("TestStakingWalletRWalk");
		let newStakingWalletRWalk = await NewStakingWalletRWalk.deploy(await randomWalkNFT.getAddress());
		await newStakingWalletRWalk.waitForDeployment();
		await cosmicGameProxy.setStakingWalletRWalk(await newStakingWalletRWalk.getAddress());
		await cosmicGameProxy.setRuntimeMode();
		let sampleTokenId = 33;
		let tokenStaked = await newStakingWalletRWalk.isTokenStaked(sampleTokenId);
		expect(tokenStaked).to.equal(false);
		await newStakingWalletRWalk.insertToken(sampleTokenId,0);
		let tokenIndexCheck = await newStakingWalletRWalk.tokenIndices(sampleTokenId);
		expect(tokenIndexCheck).to.equal(1);
		let tokenIdCheck = await newStakingWalletRWalk.stakedTokens(Number(tokenIndexCheck)-1);
		expect(tokenIdCheck).to.equal(sampleTokenId);
		await expect(newStakingWalletRWalk.insertToken(sampleTokenId,0)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyInserted");

		await newStakingWalletRWalk.removeToken(sampleTokenId);
		await expect(newStakingWalletRWalk.removeToken(owner.address)).to.be.revertedWithCustomError(contractErrors,"TokenAlreadyDeleted");
		await randomWalkNFT.setApprovalForAll(await newStakingWalletRWalk.getAddress(), true);
		async function mint_rwalk(a) {
			let tokenPrice = await randomWalkNFT.getMintPrice();
			let tx = await randomWalkNFT.connect(a).mint({ value: tokenPrice });
			let receipt = await tx.wait();
			let topic_sig = randomWalkNFT.interface.getEvent("MintEvent").topicHash;
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNFT.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}
		let r1 = await mint_rwalk(owner);
		let r2 = await mint_rwalk(owner);
		let r3 = await mint_rwalk(owner);
		let tx = await newStakingWalletRWalk.stakeMany([r1,r2,r3]);
		let receipt = await tx.wait();
		let topic_sig = newStakingWalletRWalk.interface.getEvent("StakeActionEvent").topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		for (let i=0; i<receipt_logs.length; i++) {
			let evt = newStakingWalletRWalk.interface.parseLog(receipt_logs[i]);
		}

		numTokens = await newStakingWalletRWalk.numTokensStaked();
		expect(numTokens).to.equal(3);
		let isStaked = await newStakingWalletRWalk.isTokenStaked(r1);
		expect(isStaked).to.equal(true);
		isStaked = await newStakingWalletRWalk.isTokenStaked(r2);
		expect(isStaked).to.equal(true);
		isStaked = await newStakingWalletRWalk.isTokenStaked(r3);
		expect(isStaked).to.equal(true);

		await hre.ethers.provider.send("evm_increaseTime", [600+1]);
		await newStakingWalletRWalk.unstakeMany([r1,r2,r3]);
		numTokens = await newStakingWalletRWalk.numTokensStaked();
		expect(numTokens).to.equal(0);
	});
	it("User stakes his 10 RandomWalk tokens and gets all 10 tokens back after claim", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
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
			cosmicGameImplementation,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,true);

		for(let i=0; i < 10 ;i++) {
			let tokenPrice = await randomWalkNFT.getMintPrice();
			await randomWalkNFT.mint({ value: tokenPrice })
		}
		for (let i=0; i < 10; i++) {
			await randomWalkNFT.setApprovalForAll(await stakingWalletRWalk.getAddress(), true);
			let tx = await stakingWalletRWalk.stake(i);
		}

		let bidPrice = await cosmicGameProxy.getBidPrice();
		var bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await hre.ethers.provider.send("evm_mine");
		await cosmicGameProxy.claimPrize();

		// forward timestamp se we can unstake
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime) + 60*3600*24]);
		await hre.ethers.provider.send("evm_mine");

		for (let i=0; i < 10; i++) {
			await stakingWalletRWalk.unstake(i);
			let o = await randomWalkNFT.ownerOf(i);
			expect(o).to.equal(owner.address);
		}

	})
	it("The random picking of winner from StakingWalletRWalk is really random", async function () {
		let signers = await hre.ethers.getSigners();
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
			cosmicGameImplementation,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false,false);

		const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.waitForDeployment();

		const NewStakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await NewStakingWalletRWalk.deploy(await randomWalkNFT.getAddress());
		await newStakingWalletRWalk.waitForDeployment();

		let numSigners = 20;
		let numLoops = 50;
		let randomSeed = 11235813; // fib
		for (let i=0; i<numSigners; i++) {
			let signer = signers[i];
			await randomWalkNFT.connect(signer).setApprovalForAll(await newStakingWalletRWalk.getAddress(), true);
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
		// verification algorithm is simple: if from 1000 staked tokens at least
		// 1 staker is chosen (i.e. all stakers win at least 1 token)
		// then we consider randomness works. Sample size is 300 (30% of the population)
		// Now the same process for RandomWalk verification
		{
			let luckyStakers = {};
			let numSamples = 300;
			for (let i=0; i<numSamples; i++) {
				let r = Math.floor(Math.random() * 0xffffffff).toString(16).padEnd(8, "0")
				let luckyAddr = await newStakingWalletRWalk.pickRandomStaker(hre.ethers.hashMessage('0x'+r));
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
			bidLogic,
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		// const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		// let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		// await cBidder.waitForDeployment();

		const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice })

		const StakingWalletRWalk = await hre.ethers.getContractFactory("StakingWalletRWalk");
		let newStakingWalletRWalk = await StakingWalletRWalk.deploy(await randomWalkNFT.getAddress());
		await newStakingWalletRWalk.waitForDeployment();
		await randomWalkNFT.setApprovalForAll(await newStakingWalletRWalk.getAddress(), true);

		let tx = await newStakingWalletRWalk.stake(0);
		let receipt = await tx.wait();
		let topic_sig = stakingWalletRWalk.interface.getEvent("StakeActionEvent").topicHash;
		let receipt_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let log = stakingWalletRWalk.interface.parseLog(receipt_logs[0]);
		await hre.ethers.provider.send("evm_increaseTime", [6000]);
		await hre.ethers.provider.send("evm_mine");
		await newStakingWalletRWalk.unstake(0);

		await expect(newStakingWalletRWalk.stake(0)).to.be.revertedWithCustomError(contractErrors,"OneTimeStaking");
	});
});
