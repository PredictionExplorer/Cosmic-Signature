"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("StakingWalletCosmicSignatureNft", function () {
	it("Bidding and Cosmic Signature NFT staking", async function () {
		let durationUntilRoundActivation_;
		let nextEthBidPrice_;
		let durationUntilMainPrize_;
		let transactionResponse_;
		let transactionReceipt_;
		let log_;
		let parsedLog_;

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);

		const cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedTopicHash_ = contracts_.cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerCosmicSignatureNftAwarded").topicHash;
		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddr, true)).not.reverted;
		await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[2]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddr, true)).not.reverted;
		await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[3]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddr, true)).not.reverted;
		await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[4]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddr, true)).not.reverted;

		for ( let counter_ = 0; counter_ < 10; ++ counter_ ) {
			durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
			await hre.ethers.provider.send("evm_mine");
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
			nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
			durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).not.reverted;
		}

		const nftIdsByStakerAddress_ = {};
		const stakeActionIds_ = [];
		let cosmicSignatureNftTotalSupply_ = await contracts_.cosmicSignatureNft.totalSupply();
		for ( let nftId_ = 0n; nftId_ < cosmicSignatureNftTotalSupply_; ++ nftId_ ) {
			const nftStakerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
			let nftStakerNftIds_ = nftIdsByStakerAddress_[nftStakerAddress_];
			if (nftStakerNftIds_ == undefined) {
				nftStakerNftIds_ = [];
				nftIdsByStakerAddress_[nftStakerAddress_] = nftStakerNftIds_;
			}
			nftStakerNftIds_.push(nftId_);
			const nftStakerSigner_ = await hre.ethers.getSigner(nftStakerAddress_);

			// [Comment-202506052/]
			transactionResponse_ = await contracts_.stakingWalletCosmicSignatureNft.connect(nftStakerSigner_).stake(nftId_);

			transactionReceipt_ = await transactionResponse_.wait();
			log_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));

			// [Comment-202506051]
			// Issue. It looks like we can get by without parsing the log.
			// [/Comment-202506051]
			// parsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(log_);
			// console.info(log_.args.stakeActionId.toString());
			stakeActionIds_.push(log_.args.stakeActionId);
		}

		let cosmicSignatureNftTotalSupplyBefore_ = cosmicSignatureNftTotalSupply_;

		durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();

		// We need an extra time increase to claim as signer 5. It placed no bids; won't get raffle NFTs.
		let durationUntilTimeoutTimeToClaimMainPrize_ = durationUntilMainPrize_ + await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();

		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilTimeoutTimeToClaimMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		transactionResponse_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[5]).claimMainPrize();
		transactionReceipt_ = await transactionResponse_.wait();

		// Issue. These are really not all events that show newly minted and awarded CS NFTs.
		let cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedTopicHash_) >= 0));

		// Asserting that the the new NFTs have not been staked.
		for ( let raffleNftIndex_ = 0; raffleNftIndex_ < cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedLogs_.length; ++ raffleNftIndex_ ) {
			parsedLog_ = contracts_.cosmicSignatureGameProxy.interface.parseLog(cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedLogs_[raffleNftIndex_]);
			const nftWasUsed_ = await contracts_.stakingWalletCosmicSignatureNft.usedNfts(parsedLog_.args.prizeCosmicSignatureNftId);
			expect(nftWasUsed_).equal(0n);
		}

		cosmicSignatureNftTotalSupply_ = await contracts_.cosmicSignatureNft.totalSupply();
		for ( let nftId_ = 0n; nftId_ < cosmicSignatureNftTotalSupply_; ++ nftId_ ) {
			const nftWasUsed_ = await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_);
			if (nftWasUsed_ != 0n) {
				expect(nftId_ < cosmicSignatureNftTotalSupplyBefore_).equal(true);
			} else {
				expect(nftId_ >= cosmicSignatureNftTotalSupplyBefore_).equal(true);
				const nftStakerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
				let nftStakerNftIds_ = nftIdsByStakerAddress_[nftStakerAddress_];
				if (nftStakerNftIds_ == undefined) {
					nftStakerNftIds_ = [];
					nftIdsByStakerAddress_[nftStakerAddress_] = nftStakerNftIds_;
				}
				nftStakerNftIds_.push(nftId_);

				// Unlike near Comment-202506052, not staking the NFT here.
			}
		}

		let numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(Number(numStakedNfts_)).equal(stakeActionIds_.length);

		for ( let stakeActionIndex_ = 0; stakeActionIndex_ < stakeActionIds_.length; ++ stakeActionIndex_ ) {
			const stakeAction_ = await contracts_.stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[stakeActionIndex_]);
			const nftStakerAddress_ = stakeAction_.nftOwnerAddress;
			const nftStakerSigner_ = await hre.ethers.getSigner(nftStakerAddress_);
			await expect(contracts_.stakingWalletCosmicSignatureNft.connect(nftStakerSigner_).unstake(stakeActionIds_[stakeActionIndex_])).not.reverted;
		}

		// Asserting that all NFTs have been unstaked.
		numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);

		// Asserting that every staker got their NFTs back.
		for (const nftStakerAddress_ in nftIdsByStakerAddress_) {
			const nftStakerNftIds_ = nftIdsByStakerAddress_[nftStakerAddress_];
			for ( let nftIndex_ = 0; nftIndex_ < nftStakerNftIds_.length; ++ nftIndex_ ) {
				const nftOwnerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftStakerNftIds_[nftIndex_]);
				expect(nftOwnerAddress_).equal(nftStakerAddress_);
			}
		}
	});
});
