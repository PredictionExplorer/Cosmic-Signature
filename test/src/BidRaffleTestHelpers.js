"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256FromSeedWrapper } = require("../../src/Helpers.js");
const { generateRandomUInt256Seed } = require("../../src/ContractTestingHelpers.js");

/** @return Comment-202609094 applies. */
function findBidIndexReference(cumulativeWeights_, targetCumulativeWeight_) {
	for ( let bidIndex_ = 0; bidIndex_ < cumulativeWeights_.length; ++ bidIndex_ ) {
		if (cumulativeWeights_[bidIndex_] > targetCumulativeWeight_) {
			return BigInt(bidIndex_);
		}
	}
	throw new Error("targetCumulativeWeight_ is not less than the total weight.");
}

/** @returns {bigint[]} The cumulative sums of `weights_`. */
function calculateCumulativeWeights(weights_) {
	const cumulativeWeights_ = [];
	let sum_ = 0n;
	for (const weight_ of weights_) {
		sum_ += weight_;
		cumulativeWeights_.push(sum_);
	}
	return cumulativeWeights_;
}

/** Reads a round's bidder addresses and cumulative raffle weights. */
async function readBidRaffleData(game_, roundNum_) {
	const numBids_ = await game_.getTotalNumBids(roundNum_);
	const bidderAddresses_ = [];
	const cumulativeWeights_ = [];
	for ( let bidIndex_ = 0n; bidIndex_ < numBids_; ++ bidIndex_ ) {
		const bidInfo_ = await game_.getBidInfoAt(roundNum_, bidIndex_);
		bidderAddresses_.push(bidInfo_.bidderAddress);
		cumulativeWeights_.push(bidInfo_.raffleCumulativeWeight);
	}
	return {
		bidderAddresses: bidderAddresses_,
		cumulativeWeights: cumulativeWeights_,
		totalWeight: cumulativeWeights_.at(-1) ?? 0n,
	};
}

/** Replays the V3 bidder raffle draws and checks the emitted winners. */
async function verifyBidRaffleClaimDraws(game_, roundNum_, claimTransactionReceipt_) {
	const blockBeforeTransaction_ = await hre.ethers.provider.getBlock(claimTransactionReceipt_.blockNumber - 1);
	const transactionBlock_ = await claimTransactionReceipt_.getBlock();
	const randomNumberSeedWrapper_ = {
		value: generateRandomUInt256Seed(blockBeforeTransaction_, transactionBlock_),
	};
	const {
		bidderAddresses: bidderAddresses_,
		cumulativeWeights: cumulativeWeights_,
		totalWeight: totalWeight_,
	} = await readBidRaffleData(game_, roundNum_);
	expect(totalWeight_, "the round total raffle weight").greaterThan(0n);

	const drawOneWinnerAddress_ = () => {
		const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
		const bidIndex_ = findBidIndexReference(cumulativeWeights_, randomNumber_ % totalWeight_);
		return bidderAddresses_[Number(bidIndex_)];
	};
	const parseGameLogs_ = (eventName_) =>
		claimTransactionReceipt_.logs
			.map((log_) => { try { return game_.interface.parseLog(log_); } catch { return null; } })
			.filter((parsedLog_) => parsedLog_?.name === eventName_);

	const numRaffleEthPrizesForBidders_ = await game_.numRaffleEthPrizesForBidders();
	const raffleEthLogs_ = parseGameLogs_("RaffleWinnerBidderEthPrizeAllocated");
	expect(BigInt(raffleEthLogs_.length), "raffle ETH event count").equal(numRaffleEthPrizesForBidders_);
	for ( let drawCounter_ = 0n; drawCounter_ < numRaffleEthPrizesForBidders_; ++ drawCounter_ ) {
		const log_ = raffleEthLogs_[Number(drawCounter_)];
		expect(log_.args.winnerIndex, `raffle ETH draw ${drawCounter_} winnerIndex`)
			.equal(numRaffleEthPrizesForBidders_ - 1n - drawCounter_);
		expect(log_.args.winnerAddress, `raffle ETH draw ${drawCounter_} winner`).equal(drawOneWinnerAddress_());
	}

	const numRaffleCosmicSignatureNftsForBidders_ = await game_.numRaffleCosmicSignatureNftsForBidders();
	const raffleNftLogs_ = parseGameLogs_("RaffleWinnerPrizePaid")
		.filter((parsedLog_) => ! parsedLog_.args.winnerIsRandomWalkNftStaker);
	expect(BigInt(raffleNftLogs_.length), "raffle CST + CS NFT event count")
		.equal(numRaffleCosmicSignatureNftsForBidders_);
	for ( let drawCounter_ = 0n; drawCounter_ < numRaffleCosmicSignatureNftsForBidders_; ++ drawCounter_ ) {
		const log_ = raffleNftLogs_[Number(drawCounter_)];
		expect(log_.args.winnerIndex, `raffle CST + CS NFT draw ${drawCounter_} winnerIndex`)
			.equal(numRaffleCosmicSignatureNftsForBidders_ - 1n - drawCounter_);
		expect(log_.args.winnerAddress, `raffle CST + CS NFT draw ${drawCounter_} winner`).equal(drawOneWinnerAddress_());
	}
}

module.exports = {
	findBidIndexReference,
	calculateCumulativeWeights,
	readBidRaffleData,
	verifyBidRaffleClaimDraws,
};
