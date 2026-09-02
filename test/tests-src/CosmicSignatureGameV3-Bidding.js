"use strict";

// Tests V3-specific bidding behavior shared by ETH and CST bid entry points.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
	activateCurrentRound,
	findParsedEvent,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
} = require("../src/V3UpgradeTestHelpers.js");

/** Executes an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function bidWithEthAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", 0n, { value: ethBidPrice_, })
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
}

describe("CosmicSignatureGameV3-Bidding", function () {
	it("allows random combinations of ETH, receive(), and CST bids within one block", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;

		// Make all three bidders rich enough in CST for even the worst-case random sequence of 30 CST bids,
		// whose auction beginning price can double after each bid.
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(
				600_000_000_000n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER
			)
		);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const bidder3_ = contracts_.signers[3];
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 100n);
		await bidWithEthAt(game_, bidder3_, (await getLatestBlockTimestamp()) + 100n);
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 100n);

		expect(await token_.balanceOf(bidder1_.address)).greaterThan(0n);
		expect(await token_.balanceOf(bidder2_.address)).greaterThan(0n);
		expect(await token_.balanceOf(bidder3_.address)).greaterThan(0n);
		const ethDutchAuctionBeginningBidPrice_ = await game_.ethDutchAuctionBeginningBidPrice();
		const gameAddress_ = await game_.getAddress();
		const bidders_ = [bidder1_, bidder2_, bidder3_];
		const bidTypes_ = ["ETH", "receive", "CST"];

		// [Comment-202609061]
		// Transactions submitted by different accounts do not inherently have a deterministic execution
		// order. Each transaction is therefore funded for any execution order, and the assertions below
		// do not depend on which randomly selected bid executes first.
		// [/Comment-202609061]
		for (let iterationIndex_ = 0; iterationIndex_ < 10; ++ iterationIndex_) {
			const bidTypeCombination_ = bidders_.map(() => bidTypes_[generateRandomUInt32() % bidTypes_.length]);
			const timeStamp_ = (await getLatestBlockTimestamp()) + 100n;
			const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(100n);
			const ethBidValue_ = ethBidPrice_ * 10n;
			const submitBid_ = (bidType_, bidder_) => {
				switch (bidType_) {
					case "ETH":
						return game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: ethBidValue_, });
					case "receive":
						return bidder_.sendTransaction({ to: gameAddress_, value: ethBidValue_, });
					case "CST":
						return game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "", 0n);
					default:
						throw new Error(`Unexpected bid type: ${bidType_}`);
				}
			};

			let transactionResponses_;
			try {
				await hre.ethers.provider.send("evm_setAutomine", [false,]);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);

				// Comment-202609061 applies to this combination.
				transactionResponses_ = [];
				for (let bidderIndex_ = 0; bidderIndex_ < bidders_.length; ++ bidderIndex_) {
					transactionResponses_.push(await submitBid_(bidTypeCombination_[bidderIndex_], bidders_[bidderIndex_]));
				}

				await hre.ethers.provider.send("evm_mine");
			} finally {
				await hre.ethers.provider.send("evm_setAutomine", [true,]);
			}

			const receipts_ = await Promise.all(
				transactionResponses_.map(transactionResponse_ =>
					hre.ethers.provider.getTransactionReceipt(transactionResponse_.hash)
				)
			);
			const combinationDescription_ = bidTypeCombination_.join("+");
			expect(new Set(receipts_.map(receipt_ => receipt_.blockNumber)).size, combinationDescription_).equal(1);
			expect(receipts_.map(receipt_ => receipt_.status), combinationDescription_).deep.equal([1, 1, 1]);
			const bidCstRewardAmounts_ =
				receipts_.map(receipt_ => findParsedEvent(receipt_, game_, "BidPlaced").args.bidCstRewardAmount);
			expect(bidCstRewardAmounts_.filter(value_ => value_ === 0n).length, combinationDescription_).equal(2);
			expect(bidCstRewardAmounts_.filter(value_ => value_ > 0n).length, combinationDescription_).equal(1);
			expect(await game_.ethDutchAuctionBeginningBidPrice(), combinationDescription_).equal(ethDutchAuctionBeginningBidPrice_);
		}
	});
});
