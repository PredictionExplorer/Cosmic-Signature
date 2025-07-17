"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const { NonceManager } = require("ethers");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { shuffleArray, generateRandomUInt32, generateRandomUInt256 } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting, assertAddressIsValid } = require("../src/ContractUnitTestingHelpers.js");

describe("StakingWalletRandomWalkNft", function () {
	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.stakingWalletRandomWalkNftFactory.deploy(hre.ethers.ZeroAddress))
			.revertedWithCustomError(contracts_.stakingWalletRandomWalkNftFactory, "ZeroAddress");
	});

	it("Minting, staking, and unstaking of 10 Random Walk NFTs", async function () {
		const numNfts_ = 10;

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const stakingWalletRandomWalkNftNftStakedTopicHash_ = contracts_.stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;

		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;

		const nftIds_ = [];

		for ( let counter_ = numNfts_; ( -- counter_ ) >= 0; ) {
			const transactionResponse_ = await contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: 10n ** 18n,});
			const transactionReceipt_ = await transactionResponse_.wait();
			const randomWalkNftMintEventLog_ = transactionReceipt_.logs[1];
			const randomWalkNftMintEventParsedLog_ = contracts_.randomWalkNft.interface.parseLog(randomWalkNftMintEventLog_);
			// console.log("202507237", randomWalkNftMintEventParsedLog_.args.tokenId.toString());
			nftIds_.push(randomWalkNftMintEventParsedLog_.args.tokenId);
		}

		let numStakedNfts_ = await contracts_.stakingWalletRandomWalkNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);

		const stakeActions_ = [];
		shuffleArray(nftIds_);

		for (let nftIndex_ = numNfts_; ( -- nftIndex_ ) >= 0; ) {
			const nftId_ = nftIds_[nftIndex_];
			const transactionResponsePromise_ =
				((nftId_ & 2n) == 0n) ?
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).stake(nftId_) :
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).stakeMany([nftId_]);
			const transactionResponse_ = await transactionResponsePromise_;
			const transactionReceipt_ = await transactionResponse_.wait();
			const stakingWalletRandomWalkNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletRandomWalkNftNftStakedTopicHash_) >= 0));
			const stakingWalletRandomWalkNftNftStakedParsedLog_ = contracts_.stakingWalletRandomWalkNft.interface.parseLog(stakingWalletRandomWalkNftNftStakedLog_);
			stakeActions_.push(
				{
					stakeActionId: stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId,
					nftId: nftId_,
				}
			);
		}

		expect(stakeActions_.length).equal(numNfts_);
		numStakedNfts_ = await contracts_.stakingWalletRandomWalkNft.numStakedNfts();
		expect(Number(numStakedNfts_)).equal(numNfts_);

		for (const nftId_ of nftIds_) {
			const nftOwnerAddress_ = await contracts_.randomWalkNft.ownerOf(nftId_);
			expect(nftOwnerAddress_).equal(contracts_.stakingWalletRandomWalkNftAddr);
		}

		shuffleArray(stakeActions_);

		for (let stakeActionIndex_ = numNfts_; ( -- stakeActionIndex_ ) >= 0; ) {
			const stakeAction_ = stakeActions_[stakeActionIndex_];
			const transactionResponsePromise_ =
				((stakeAction_.stakeActionId & 2n) == 0n) ?
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstake(stakeAction_.stakeActionId) :
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstakeMany([stakeAction_.stakeActionId]);
			await expect(transactionResponsePromise_)
				.emit(contracts_.stakingWalletRandomWalkNft, "NftUnstaked")
				.withArgs(anyUint, stakeAction_.stakeActionId, stakeAction_.nftId, contracts_.signers[0].address, BigInt(stakeActionIndex_));
		}

		numStakedNfts_ = await contracts_.stakingWalletRandomWalkNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);

		for (const nftId_ of nftIds_) {
			const nftOwnerAddress_ = await contracts_.randomWalkNft.ownerOf(nftId_);
			expect(nftOwnerAddress_).equal(contracts_.signers[0].address);
		}
	});

	it("The stakeMany and unstakeMany methods", async function () {
		const numNfts_ = 10;

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const stakingWalletRandomWalkNftNftStakedTopicHash_ = contracts_.stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;
		const stakingWalletRandomWalkNftNftUnstakedTopicHash_ = contracts_.stakingWalletRandomWalkNft.interface.getEvent("NftUnstaked").topicHash;

		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;

		const nftIds_ = [];

		for ( let counter_ = numNfts_; ( -- counter_ ) >= 0; ) {
			const transactionResponse_ = await contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: 10n ** 18n,});
			const transactionReceipt_ = await transactionResponse_.wait();
			const randomWalkNftMintEventLog_ = transactionReceipt_.logs[1];
			const randomWalkNftMintEventParsedLog_ = contracts_.randomWalkNft.interface.parseLog(randomWalkNftMintEventLog_);
			// console.log("202507242", randomWalkNftMintEventParsedLog_.args.tokenId.toString());
			nftIds_.push(randomWalkNftMintEventParsedLog_.args.tokenId);
		}

		expect(nftIds_.length).equals(numNfts_);
		const stakeActionIds_ = [];
		shuffleArray(nftIds_);

		{
			const transactionResponse_ = await contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).stakeMany(nftIds_);
			const transactionReceipt_ = await transactionResponse_.wait();
			expect(transactionReceipt_.logs.length).equals(numNfts_ * 2);
			const stakingWalletRandomWalkNftNftStakedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(stakingWalletRandomWalkNftNftStakedTopicHash_) >= 0));
			expect(stakingWalletRandomWalkNftNftStakedLogs_.length).equals(numNfts_);
			for (let stakingWalletRandomWalkNftNftStakedLogIndex_ = numNfts_; ( -- stakingWalletRandomWalkNftNftStakedLogIndex_ ) >= 0; ) {
				const stakingWalletRandomWalkNftNftStakedLog_ = stakingWalletRandomWalkNftNftStakedLogs_[stakingWalletRandomWalkNftNftStakedLogIndex_];
				const stakingWalletRandomWalkNftNftStakedParsedLog_ = contracts_.stakingWalletRandomWalkNft.interface.parseLog(stakingWalletRandomWalkNftNftStakedLog_);
				expect(stakingWalletRandomWalkNftNftStakedParsedLog_.args.nftId).equal(nftIds_.at((-1) - stakingWalletRandomWalkNftNftStakedLogIndex_));
				expect(stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakerAddress).equal(contracts_.signers[0].address);
				expect(stakingWalletRandomWalkNftNftStakedParsedLog_.args.numStakedNfts).equal(BigInt(stakingWalletRandomWalkNftNftStakedLogIndex_ + 1));
				const stakeActionRecord_ = await contracts_.stakingWalletRandomWalkNft.stakeActions(stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId);
				// console.info(`202507241 ${stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId} ${stakeActionRecord_}`)
				expect(stakeActionRecord_).deep.equal([stakingWalletRandomWalkNftNftStakedParsedLog_.args.nftId, stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakerAddress, BigInt(stakingWalletRandomWalkNftNftStakedLogIndex_),]);
				stakeActionIds_[stakingWalletRandomWalkNftNftStakedLogIndex_] = stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId;
			}
		}

		expect(stakeActionIds_.length).equals(numNfts_);
		let numStakedNfts_ = await contracts_.stakingWalletRandomWalkNft.numStakedNfts();
		expect(numStakedNfts_).equal(numNfts_);
		shuffleArray(stakeActionIds_);

		{
			const transactionResponse_ = await contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstakeMany(stakeActionIds_);
			const transactionReceipt_ = await transactionResponse_.wait();
			expect(transactionReceipt_.logs.length).equals(numNfts_ * 2);
			const stakingWalletRandomWalkNftNftUnstakedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(stakingWalletRandomWalkNftNftUnstakedTopicHash_) >= 0));
			expect(stakingWalletRandomWalkNftNftUnstakedLogs_.length).equals(numNfts_);
			for (let stakingWalletRandomWalkNftNftUnstakedLogIndex_ = numNfts_; ( -- stakingWalletRandomWalkNftNftUnstakedLogIndex_ ) >= 0; ) {
				const stakingWalletRandomWalkNftNftUnstakedLog_ = stakingWalletRandomWalkNftNftUnstakedLogs_[stakingWalletRandomWalkNftNftUnstakedLogIndex_];
				const stakingWalletRandomWalkNftNftUnstakedParsedLog_ = contracts_.stakingWalletRandomWalkNft.interface.parseLog(stakingWalletRandomWalkNftNftUnstakedLog_);
				expect(stakingWalletRandomWalkNftNftUnstakedParsedLog_.args.stakeActionId).equal(stakeActionIds_.at((-1) - stakingWalletRandomWalkNftNftUnstakedLogIndex_));
				expect(stakingWalletRandomWalkNftNftUnstakedParsedLog_.args.stakerAddress).equal(contracts_.signers[0].address);
				expect(stakingWalletRandomWalkNftNftUnstakedParsedLog_.args.numStakedNfts).equal(numNfts_ - 1 - stakingWalletRandomWalkNftNftUnstakedLogIndex_);
			}
		}

		numStakedNfts_ = await contracts_.stakingWalletRandomWalkNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);
	});

	it("The random picking of stakers is really random; algorithm 1", async function () {
		// Each out of 20 stakers stakes 50 NFTs, total 1000 NFTs.
		// Randomly pick 300 stakers.
		// Assert that each staker has been picked at least once.

		const numStakers_ = 20;
		const numNftsPerStaker_ = 50;
		const numStakersToPick_ = 300n;

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const concurrentSigners_ = contracts_.signers.map((signer_) => (new NonceManager(signer_)));

		{
			const luckyStakerAddresses_ = await contracts_.stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(numStakersToPick_, /*hre.ethers.hashMessage("0xffff")*/ 0xe1027c1afb832e7bd4ac3301523cf66aed14912422b036d444e0c2d4adc0afa2n);
			expect(luckyStakerAddresses_.length).equal(0);
		}

		await hre.ethers.provider.send("evm_setAutomine", [false]);
		try {
			const transactionResponsePromises_ = [];
			for ( let stakerIndex_ = 0; stakerIndex_ < numStakers_; ++ stakerIndex_ ) {
				const concurrentSigner_ = concurrentSigners_[stakerIndex_];
				transactionResponsePromises_.push(contracts_.randomWalkNft.connect(concurrentSigner_).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true));
				for ( let nftIndex_ = 0; nftIndex_ < numNftsPerStaker_; ++ nftIndex_ ) {
					transactionResponsePromises_.push(contracts_.randomWalkNft.connect(concurrentSigner_).mint({value: 10n ** 18n,}));
				}
			}
			let transactionResponses_ = await Promise.all(transactionResponsePromises_);

			// Comment-202507252 relates.
			await hre.ethers.provider.send("evm_mine");

			const allNftIds_ = [];
			let transactionResponseIndex_ = 0;
			// let prevNftId_ = -1n;
			for ( let stakerIndex_ = 0; stakerIndex_ < numStakers_; ++ stakerIndex_ ) {
				await transactionResponses_[transactionResponseIndex_].wait();
				++ transactionResponseIndex_;
				const nftIds_ = [];
				for ( let nftIndex_ = 0; nftIndex_ < numNftsPerStaker_; ++ nftIndex_ ) {
					const transactionReceipt_ = await transactionResponses_[transactionResponseIndex_].wait();
					const randomWalkNftMintEventLog_ = transactionReceipt_.logs[1];
					const randomWalkNftMintEventParsedLog_ = contracts_.randomWalkNft.interface.parseLog(randomWalkNftMintEventLog_);
					expect(randomWalkNftMintEventParsedLog_.name).equal("MintEvent");
					// if (randomWalkNftMintEventParsedLog_.args[0] - prevNftId_ != 1n) {
					// 	console.info(`202507267 ${prevNftId_} ${randomWalkNftMintEventParsedLog_.args[0]}`);
					// }
					// prevNftId_ = randomWalkNftMintEventParsedLog_.args[0];
					nftIds_.push(randomWalkNftMintEventParsedLog_.args[0]);
					++ transactionResponseIndex_;
				}
				allNftIds_.push(nftIds_);
			}
			expect(await contracts_.randomWalkNft.totalSupply()).equal(BigInt(numStakers_ * numNftsPerStaker_));
			transactionResponsePromises_.length = 0;
			for ( let stakerIndex_ = 0; stakerIndex_ < numStakers_; ++ stakerIndex_ ) {
				const concurrentSigner_ = concurrentSigners_[stakerIndex_];
				transactionResponsePromises_.push(contracts_.stakingWalletRandomWalkNft.connect(concurrentSigner_).stakeMany(allNftIds_[stakerIndex_]));
			}
			transactionResponses_ = await Promise.all(transactionResponsePromises_);

			// Comment-202507252 relates.
			const transactionResponseWaiters_ = [hre.ethers.provider.send("evm_mine")];

			transactionResponseWaiters_.push( ... transactionResponses_.map((transactionResponse_) => (transactionResponse_.wait())) );
			await Promise.all(transactionResponseWaiters_);
			expect(await contracts_.stakingWalletRandomWalkNft.numStakedNfts()).equal(BigInt(numStakers_ * numNftsPerStaker_));
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true]);
		}

		{
			const luckyStakerAddresses_ = await contracts_.stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(numStakersToPick_, generateRandomUInt256());
			expect(luckyStakerAddresses_.length).equal(Number(numStakersToPick_));
			const numLuckyStakerPicks_ = (new Array(numStakers_)).fill(0);
			for (const luckyStakerAddress_ of luckyStakerAddresses_) {
				assertAddressIsValid(luckyStakerAddress_);
				++ numLuckyStakerPicks_[contracts_.signerAddressToIndexMapping[luckyStakerAddress_]];
			}
			// const timeStamp1_ = performance.now();
			const minNumLuckyStakerPicks_ = Math.min( ... numLuckyStakerPicks_ );
			// const timeStamp2_ = performance.now();
			// console.info(`202507263 ${timeStamp2_ - timeStamp1_} ${minNumLuckyStakerPicks_} ${numLuckyStakerPicks_}`);
			if (minNumLuckyStakerPicks_ <= 0) {
				throw new Error(`The random picking of stakers is not necessarily random. At least 1 staker has not been picked. ${numLuckyStakerPicks_}`);
			}
		}
	});

	it("The random picking of stakers is really random; algorithm 2", async function () {
		// Each out of 20 stakers stakes 1 NFT.
		// Randomly pick 180 stakers.
		// Check that the number of picks of a staker that was picked least times divided by
		// the number of picks of a staker that was picked most times is at least 0.8.
		// Note that with the given conditions the best possible result will be 180 / 20 = 9 picks per each staker.
		// The 2nd best possible result will be min 8 and max 10 picks, and 8 / 10 = 0.8, which is our target.
		// If after the 1st iteration we haven't achieved the desired result, run further iterations, total up to 30 of them.
		// On each iteration, increase the number of picks in arithmetic progression by adding 180 each time,
		// accumulate each staker picks, and check if the result is at least the desired one.

		const numStakers_ = 20;
		const numStakersToPickIncrement_ = 180n;
		const minToMaxNumLuckyStakerPicksRatioMinLimit_ = 0.8;
		const numIterationsMaxLimit_ = 30;

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		for ( let stakerIndex_ = 0; stakerIndex_ < numStakers_; ++ stakerIndex_ ) {
			await expect(contracts_.randomWalkNft.connect(contracts_.signers[stakerIndex_]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;
			await expect(contracts_.randomWalkNft.connect(contracts_.signers[stakerIndex_]).mint({value: 10n ** 18n,})).not.reverted;
			const nftId_ = BigInt(stakerIndex_);
			await expect(contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[stakerIndex_]).stake(nftId_)).not.reverted;
		}

		let randomNumberSeed_ = generateRandomUInt256();
		let numStakersToPick_ = 0n;
		const numLuckyStakerPicks_ = (new Array(numStakers_)).fill(0);
		for ( let iterationCounter_ = 1; ; ) {
			numStakersToPick_ += numStakersToPickIncrement_;
			randomNumberSeed_ = BigInt.asUintN(256, randomNumberSeed_ + (1n << 64n));
			const luckyStakerAddresses_ = await contracts_.stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(numStakersToPick_, randomNumberSeed_);
			for (const luckyStakerAddress_ of luckyStakerAddresses_) {
				assertAddressIsValid(luckyStakerAddress_);
				++ numLuckyStakerPicks_[contracts_.signerAddressToIndexMapping[luckyStakerAddress_]];
			}
			const minNumLuckyStakerPicks_ = Math.min( ... numLuckyStakerPicks_ );
			const maxNumLuckyStakerPicks_ = Math.max( ... numLuckyStakerPicks_ );
			const minToMaxNumLuckyStakerPicksRatio_ = minNumLuckyStakerPicks_ / maxNumLuckyStakerPicks_;
			// console.info(`202507269 ${iterationCounter_} ${minNumLuckyStakerPicks_} ${maxNumLuckyStakerPicks_} ${minToMaxNumLuckyStakerPicksRatio_} ${numLuckyStakerPicks_}`);
			if (minToMaxNumLuckyStakerPicksRatio_ >= minToMaxNumLuckyStakerPicksRatioMinLimit_) {
				break;
			}
			if (( ++ iterationCounter_ ) > numIterationsMaxLimit_) {
				throw new Error(`The random picking of stakers is not necessarily random. Some stakers were picked significantly fewer or more times than the others. ${minNumLuckyStakerPicks_} ${maxNumLuckyStakerPicks_} ${minToMaxNumLuckyStakerPicksRatio_} ${numLuckyStakerPicks_}`);
			}
		}
	});

	it("Staking a used Random Walk NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const stakingWalletRandomWalkNftNftStakedTopicHash_ = contracts_.stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;

		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: 10n ** 18n,})).not.reverted;
		const nftId_ = 0n;

		for ( let counter_ = 0; ; ++ counter_ ) {
			const transactionResponsePromise_ = contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).stake(nftId_);
			if (counter_ <= 0) {
				const transactionResponse_ = await transactionResponsePromise_;
				const transactionReceipt_ = await transactionResponse_.wait();
				const stakingWalletRandomWalkNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletRandomWalkNftNftStakedTopicHash_) >= 0));
				const stakingWalletRandomWalkNftNftStakedParsedLog_ = contracts_.stakingWalletRandomWalkNft.interface.parseLog(stakingWalletRandomWalkNftNftStakedLog_);
				await expect(contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstake(stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId)).not.reverted;
				expect(await contracts_.stakingWalletRandomWalkNft.usedNfts(nftId_)).equal(1n);
			} else {
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.stakingWalletRandomWalkNft, "NftHasAlreadyBeenStaked")
					.withArgs("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_);
				break;
			}
		}
	});

	it("An unauthorized caller unstakes a Random Walk NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const stakingWalletRandomWalkNftNftStakedTopicHash_ = contracts_.stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;

		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: 10n ** 18n,})).not.reverted;
		const nftId_ = 0n;

		const transactionResponse_ = await contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).stake(nftId_);
		const transactionReceipt_ = await transactionResponse_.wait();
		const stakingWalletRandomWalkNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletRandomWalkNftNftStakedTopicHash_) >= 0));
		const stakingWalletRandomWalkNftNftStakedParsedLog_ = contracts_.stakingWalletRandomWalkNft.interface.parseLog(stakingWalletRandomWalkNftNftStakedLog_);
		// console.info(stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId.toString());

		for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
			const transactionResponsePromise_ =
				(counter_ <= 0) ?
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[1]).unstake(stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId) :
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[1]).unstakeMany([stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId]);
			await expect(transactionResponsePromise_)
				.revertedWithCustomError(contracts_.stakingWalletRandomWalkNft, "NftStakeActionAccessDenied")
				.withArgs("Only NFT owner is permitted to unstake it.", stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId, contracts_.signers[1].address);
		}
	});

	it("Unstaking an invalid stakeActionId", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const stakingWalletRandomWalkNftNftStakedTopicHash_ = contracts_.stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;

		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: 10n ** 18n,})).not.reverted;
		const nftId_ = 0n;
		const transactionResponse_ = await contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).stake(nftId_);
		const transactionReceipt_ = await transactionResponse_.wait();
		const stakingWalletRandomWalkNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletRandomWalkNftNftStakedTopicHash_) >= 0));
		const stakingWalletRandomWalkNftNftStakedParsedLog_ = contracts_.stakingWalletRandomWalkNft.interface.parseLog(stakingWalletRandomWalkNftNftStakedLog_);
		// console.info(stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId.toString());

		{
			const stakeActionId_ = stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId + BigInt(1 - (generateRandomUInt32() & 2));
			for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
				const transactionResponsePromise_ =
					(counter_ <= 0) ?
					contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstake(stakeActionId_) :
					contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstakeMany([stakeActionId_]);
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.stakingWalletRandomWalkNft, "NftStakeActionInvalidId")
					.withArgs("Invalid NFT stake action ID.", stakeActionId_);
			}
		}

		{
			const stakeActionId_ = stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId;
			const transactionResponsePromise_ =
				((generateRandomUInt32() & 1) == 0) ?
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstake(stakeActionId_) :
				contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstakeMany([stakeActionId_]);
			await expect(transactionResponsePromise_).not.reverted;
		}
	});

	it("Double-unstaking Random Walk NFTs", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const stakingWalletRandomWalkNftNftStakedTopicHash_ = contracts_.stakingWalletRandomWalkNft.interface.getEvent("NftStaked").topicHash;

		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;

		const nftIds_ = [];

		for ( let counter_ = 10; ( -- counter_ ) >= 0; ) {
			const transactionResponse_ = await contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: 10n ** 18n,});
			const transactionReceipt_ = await transactionResponse_.wait();
			const randomWalkNftMintEventLog_ = transactionReceipt_.logs[1];
			const randomWalkNftMintEventParsedLog_ = contracts_.randomWalkNft.interface.parseLog(randomWalkNftMintEventLog_);
			// console.log("202507276", randomWalkNftMintEventParsedLog_.args.tokenId.toString());
			nftIds_.push(randomWalkNftMintEventParsedLog_.args.tokenId);
		}

		const duplicatedStakeActionIds_ = [];
		shuffleArray(nftIds_);

		{
			const transactionResponse_ = await contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).stakeMany(nftIds_);
			const transactionReceipt_ = await transactionResponse_.wait();
			const stakingWalletRandomWalkNftNftStakedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(stakingWalletRandomWalkNftNftStakedTopicHash_) >= 0));
			for (const stakingWalletRandomWalkNftNftStakedLog_ of stakingWalletRandomWalkNftNftStakedLogs_) {
				const stakingWalletRandomWalkNftNftStakedParsedLog_ = contracts_.stakingWalletRandomWalkNft.interface.parseLog(stakingWalletRandomWalkNftNftStakedLog_);
				// console.info(`202507277 ${stakingWalletRandomWalkNftNftStakedParsedLog_.args.nftId} ${stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId}`)
				expect(await contracts_.stakingWalletRandomWalkNft.usedNfts(stakingWalletRandomWalkNftNftStakedParsedLog_.args.nftId)).equal(1n);
				for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
					duplicatedStakeActionIds_.push(stakingWalletRandomWalkNftNftStakedParsedLog_.args.stakeActionId);
				}
			}
		}

		shuffleArray(duplicatedStakeActionIds_);
		const unstakedStakeActionIds_ = {};

		for (const stakeActionId_ of duplicatedStakeActionIds_) {
			const transactionResponsePromise_ = contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[0]).unstake(stakeActionId_);
			const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
			if ( ! unstakedStakeActionIds_[stakeActionId_] ) {
				// console.info(`202507278 ${stakeActionId_}`)
				unstakedStakeActionIds_[stakeActionId_] = true;
				await transactionResponsePromiseAssertion_.emit(contracts_.stakingWalletRandomWalkNft, "NftUnstaked");
			} else {
				// console.info(`202507279 ${stakeActionId_}`)
				await transactionResponsePromiseAssertion_.revertedWithCustomError(contracts_.stakingWalletRandomWalkNft, "NftStakeActionInvalidId");
			}
		}
	});
});
