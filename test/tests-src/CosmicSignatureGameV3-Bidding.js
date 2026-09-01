"use strict";

// Tests V3-specific bidding behavior shared by ETH and CST bid entry points.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
	activateCurrentRound,
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
	it("allows only 1 bid per block for all ETH and CST bid combinations", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;

		// Make two bidders rich enough in CST that either transaction in every pair can succeed if
		// it happens to execute first.
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(
				6_000n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER
			)
		);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 100n);

		// This bid is needed to mint bid CST reward to the previous bidder.
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 100n);

		expect(await token_.balanceOf(bidder1_.address)).greaterThan(0n);
		expect(await token_.balanceOf(bidder2_.address)).greaterThan(0n);

		// [Comment-202609061]
		// Transactions submitted by different accounts do not inherently have a deterministic execution
		// order. The local Hardhat configuration currently uses FIFO ordering, but this test does not rely
		// on which transaction succeeds. The ETH+ETH and CST+CST pairs guarantee coverage of each bid
		// method's same-second reversal regardless of ordering; the mixed pairs exercise both queued orders.
		// [/Comment-202609061]
		const bidTypePairs_ = [
			["ETH", "ETH"],
			["ETH", "CST"],
			["CST", "ETH"],
			["CST", "CST"],
		];

		for (const bidTypePair_ of bidTypePairs_) {
			const timeStamp_ = (await getLatestBlockTimestamp()) + 100n;
			const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(100n);
			const submitBid_ = (bidType_, bidder_, ethBidValue_) =>
				(bidType_ === "ETH") ?
					game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: ethBidValue_, }) :
					game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "", 0n);

			let transactionResponses_;
			try {
				await hre.ethers.provider.send("evm_setAutomine", [false,]);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);

				// Comment-202609061 applies to this pair.
				transactionResponses_ = [
					await submitBid_(bidTypePair_[0], bidder1_, ethBidPrice_ * 2n),
					await submitBid_(bidTypePair_[1], bidder2_, ethBidPrice_ * 3n),
				];

				await hre.ethers.provider.send("evm_mine");
			} finally {
				await hre.ethers.provider.send("evm_setAutomine", [true,]);
			}

			const receipts_ = await Promise.all(
				transactionResponses_.map(transactionResponse_ =>
					hre.ethers.provider.getTransactionReceipt(transactionResponse_.hash)
				)
			);
			const pairDescription_ = bidTypePair_.join("+");
			expect(receipts_[0].blockNumber, pairDescription_).equal(receipts_[1].blockNumber);
			expect(receipts_.map(receipt_ => receipt_.status).sort(), pairDescription_).deep.equal([0, 1]);

			// Both methods must report the same reason when called against the completed pair's block.
			await expect(
				game_.connect(bidder1_).bidWithEth.staticCall(
					-1n,
					"",
					0n,
					{ value: ethBidPrice_ * 2n, blockTag: receipts_[0].blockNumber, }
				)
			).revertedWithCustomError(game_, "BidPlacedWithinCurrentSecond");
			await expect(
				game_.connect(bidder2_).bidWithCst.staticCall(
					hre.ethers.MaxUint256,
					"",
					0n,
					{ blockTag: receipts_[0].blockNumber, }
				)
			).revertedWithCustomError(game_, "BidPlacedWithinCurrentSecond");
		}
	});

	it("applies the same-second throttle to the receive() ETH-bid entrypoint", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const timeStamp_ = (await getLatestBlockTimestamp()) + 100n;
		const bidPrice_ = await game_.getNextEthBidPriceAdvanced(100n);
		let transactionResponses_;
		try {
			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
			transactionResponses_ = [
				await bidder1_.sendTransaction({ to: await game_.getAddress(), value: bidPrice_ * 2n }),
				await bidder2_.sendTransaction({ to: await game_.getAddress(), value: bidPrice_ * 3n }),
			];
			await hre.ethers.provider.send("evm_mine");
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
		}

		const receipts_ = await Promise.all(
			transactionResponses_.map(transactionResponse_ =>
				hre.ethers.provider.getTransactionReceipt(transactionResponse_.hash)
			)
		);
		expect(receipts_[0].blockNumber).equal(receipts_[1].blockNumber);
		expect(receipts_.map(receipt_ => receipt_.status).sort()).deep.equal([0, 1]);

		// A receipt exposes only success or reversal. Replay the call against the resulting state
		// to verify the reversal reason from the raw-receive entrypoint.
		await expect(
			hre.ethers.provider.call({
				from: bidder2_.address,
				to: await game_.getAddress(),
				value: bidPrice_ * 3n,
			})
		).revertedWithCustomError(game_, "BidPlacedWithinCurrentSecond");
	});
});
