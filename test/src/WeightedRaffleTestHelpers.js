"use strict";

// Shared helpers for testing the V3+ weighted bidder raffle (Comment-202608261):
// JS reference implementations of `RaffleWeightHelpers`, per-round raffle data readers,
// and an exact replay of the `MainPrizeV3._distributePrizes` bidder raffle draws,
// which reproduces the on-chain random number seed from block data (like the V1 simulator does)
// and asserts that every emitted raffle winner is exactly the bidder the weighted selection dictates.

const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256FromSeedWrapper } = require("../../src/Helpers.js");
const { generateRandomUInt256Seed } = require("../../src/ContractTestingHelpers.js");

// #region Reference implementations.

/** The linear-scan reference of `RaffleWeightHelpers.pickBidIndex`: the first bid whose cumulative weight sum exceeds `randomWei_`. */
function pickBidIndexReference(cumulativeWeights_, randomWei_) {
	for ( let bidIndex_ = 0; bidIndex_ < cumulativeWeights_.length; ++ bidIndex_ ) {
		if (cumulativeWeights_[bidIndex_] > randomWei_) {
			return BigInt(bidIndex_);
		}
	}
	throw new Error("randomWei_ is not less than the total weight.");
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

// #endregion
// #region `readBidRaffleData`

/**
Reads the given bidding round's bidder addresses and raffle cumulative weight sums from the chain.
@returns {Promise<{bidderAddresses: string[], cumulativeWeights: bigint[], totalWeight: bigint}>}
*/
async function readBidRaffleData(game_, roundNum_) {
	const numBids_ = await game_.getTotalNumBids(roundNum_);
	const bidderAddresses_ = [];
	const cumulativeWeights_ = [];
	for ( let bidIndex_ = 0n; bidIndex_ < numBids_; ++ bidIndex_ ) {
		bidderAddresses_.push(await game_.getBidderAddressAt(roundNum_, bidIndex_));
		cumulativeWeights_.push(await game_.bidRaffleCumulativeWeights(roundNum_, bidIndex_));
	}
	return {
		bidderAddresses: bidderAddresses_,
		cumulativeWeights: cumulativeWeights_,
		totalWeight: cumulativeWeights_.at(-1) ?? 0n,
	};
}

// #endregion
// #region `verifyWeightedRaffleClaimDraws`

/**
Replays the `MainPrizeV3._distributePrizes` bidder raffle draws off-chain and asserts that
every emitted winner matches exactly.

The on-chain random number seed is reproduced from the claim block data (the tests plant
deterministic `FakeArbSys`/`FakeArbGasInfo` precompiles, so `generateRandomUInt256Seed` mirrors
`RandomNumberHelpers.generateRandomNumberSeed` exactly). The contract then draws, in order:
the ETH raffle winners (`numRaffleEthPrizesForBidders` draws), and the CST + CS NFT raffle winners
(`numRaffleCosmicSignatureNftsForBidders` draws). The lucky Random Walk NFT staker selection between
them consumes nothing from the shared seed wrapper (it receives a value derived by xor, by value),
so this replay is exact whether or not any Random Walk NFTs are staked.

@param {import("ethers").TransactionReceipt} claimTransactionReceipt_
*/
async function verifyWeightedRaffleClaimDraws(game_, roundNum_, claimTransactionReceipt_) {
	// #region The seed and the raffle data.

	const blockBeforeTransaction_ = await hre.ethers.provider.getBlock(claimTransactionReceipt_.blockNumber - 1);
	const transactionBlock_ = await claimTransactionReceipt_.getBlock();
	const randomNumberSeedWrapper_ = {value: generateRandomUInt256Seed(blockBeforeTransaction_, transactionBlock_),};

	const { bidderAddresses: bidderAddresses_, cumulativeWeights: cumulativeWeights_, totalWeight: totalWeight_ } =
		await readBidRaffleData(game_, roundNum_);
	expect(totalWeight_, "the round total raffle weight").greaterThan(0n);

	const drawOneWinnerAddress_ = () => {
		const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
		return bidderAddresses_[Number(pickBidIndexReference(cumulativeWeights_, randomNumber_ % totalWeight_))];
	};

	// #endregion
	// #region The ETH raffle draws.

	const parseGameLogs_ = (eventName_) =>
		(claimTransactionReceipt_.logs
			.map((log_) => { try { return game_.interface.parseLog(log_); } catch { return null; } })
			.filter((parsedLog_) => (parsedLog_?.name === eventName_)));

	const numRaffleEthPrizesForBidders_ = await game_.numRaffleEthPrizesForBidders();
	const raffleEthLogs_ = parseGameLogs_("RaffleWinnerBidderEthPrizeAllocated");
	expect(BigInt(raffleEthLogs_.length), "raffle ETH event count").equal(numRaffleEthPrizesForBidders_);
	for ( let drawCounter_ = 0n; drawCounter_ < numRaffleEthPrizesForBidders_; ++ drawCounter_ ) {
		const log_ = raffleEthLogs_[Number(drawCounter_)];

		// The contract's draw loop counts `winnerIndex` down.
		expect(log_.args.winnerIndex, `raffle ETH draw ${drawCounter_} winnerIndex`)
			.equal(numRaffleEthPrizesForBidders_ - 1n - drawCounter_);

		expect(log_.args.winnerAddress, `raffle ETH draw ${drawCounter_} winner`).equal(drawOneWinnerAddress_());
	}

	// #endregion
	// #region The CST + CS NFT raffle draws.

	const numRaffleCosmicSignatureNftsForBidders_ = await game_.numRaffleCosmicSignatureNftsForBidders();
	const raffleNftLogs_ =
		parseGameLogs_("RaffleWinnerPrizePaid").filter((parsedLog_) => ( ! parsedLog_.args.winnerIsRandomWalkNftStaker ));
	expect(BigInt(raffleNftLogs_.length), "raffle CST + CS NFT event count").equal(numRaffleCosmicSignatureNftsForBidders_);
	for ( let drawCounter_ = 0n; drawCounter_ < numRaffleCosmicSignatureNftsForBidders_; ++ drawCounter_ ) {
		const log_ = raffleNftLogs_[Number(drawCounter_)];
		expect(log_.args.winnerIndex, `raffle CST + CS NFT draw ${drawCounter_} winnerIndex`)
			.equal(numRaffleCosmicSignatureNftsForBidders_ - 1n - drawCounter_);
		expect(log_.args.winnerAddress, `raffle CST + CS NFT draw ${drawCounter_} winner`).equal(drawOneWinnerAddress_());
	}

	// #endregion
}

// #endregion

module.exports = {
	pickBidIndexReference,
	calculateCumulativeWeights,
	readBidRaffleData,
	verifyWeightedRaffleClaimDraws,
};
