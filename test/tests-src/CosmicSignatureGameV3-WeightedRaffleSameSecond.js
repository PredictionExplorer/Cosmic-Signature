"use strict";

// Proves that the weighted bidder raffle (Comment-202608261) does not depend on the one-bid-per-second
// restriction: the mechanism reads no timestamps, so if the restriction were ever removed, everything
// would keep working unchanged. Production forbids same-second bids (`BidPlacedWithinCurrentSecond`),
// so these tests upgrade the proxy to `SpecialCosmicSignatureGameV3` (Comment-202608265), whose only
// difference is a disabled throttle, then place multi-bid same-second (same-block) bursts, verify the
// recorded raffle weights against a JS mirror of the ETH price ladder, and verify the claim's raffle
// draws with an exact off-chain replay.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	activateCurrentRound,
} = require("../src/V2UpgradeTestHelpers.js");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("../src/V3UpgradeTestHelpers.js");
const { verifyWeightedRaffleClaimDraws } = require("../src/WeightedRaffleTestHelpers.js");

// #region Local helpers.

const gasPrice_ = 2n * 10n ** 9n;
const gasLimit_ = 2_000_000n;

/** JS mirror of the next-ETH-bid-price ladder step: `tryIncreaseValueExponentially(price, divisor) + 1`. */
function increaseEthBidPrice_(ethBidPrice_, ethBidPriceIncreaseDivisor_) {
	return ethBidPrice_ + ethBidPrice_ / ethBidPriceIncreaseDivisor_ + 1n;
}

/** Places the first (opening) ETH bid of the current bidding round. */
async function placeOpeningEthBid_(game_, bidder_) {
	const postedEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number((await getLatestBlockTimestamp()) + 1n),]);
	await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: postedEthBidPrice_,}));
}

/**
Chooses the burst block timestamp: past the end of the CST Dutch auction (so the CST bid price is zero
and any bidder can place a free CST bid), and asserts it is far outside the late bid premium window,
so the JS price ladder mirror needs no premium term.
*/
async function chooseBurstTimeStamp_(game_) {
	const cstDutchAuctionEndTimeStamp_ =
		(await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
	let burstTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
	if (burstTimeStamp_ <= cstDutchAuctionEndTimeStamp_) {
		burstTimeStamp_ = cstDutchAuctionEndTimeStamp_ + 1n;
	}
	expect(
		burstTimeStamp_ + (await game_.getRoundLateBidDuration()) + 60n,
		"the burst must land far outside the late bid premium window"
	).lessThan(await game_.mainPrizeTime());
	return burstTimeStamp_;
}

/** Mines the given already-submitted transactions in one block at the given timestamp and returns their receipts. */
async function mineBurstBlock_(transactionResponses_, burstTimeStamp_) {
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(burstTimeStamp_),]);
	await hre.ethers.provider.send("evm_setAutomine", [true,]);
	await hre.ethers.provider.send("evm_mine");
	const transactionReceipts_ = [];
	for (const transactionResponse_ of transactionResponses_) {
		transactionReceipts_.push(await hre.ethers.provider.getTransactionReceipt(transactionResponse_.hash));
	}
	return transactionReceipts_;
}

// #endregion
// #region The tests.

describe("CosmicSignatureGameV3-WeightedRaffleSameSecond", function () {
	it("a same-second multi-bidder burst records exact weights and the claim draws verify", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n, "SpecialCosmicSignatureGameV3");
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();
		const [bidder1_, bidder2_, bidder3_, bidder4_,] = contracts_.signers.slice(1, 5);

		// Bid 0: the opening ETH bid.
		await placeOpeningEthBid_(game_, bidder1_);

		// #region Planning the burst and the expected weights.

		const burstTimeStamp_ = await chooseBurstTimeStamp_(game_);
		const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();

		// The CST bid price at the burst timestamp is zero: the burst includes a FREE CST bid,
		// which still earns the full concurrent-ETH-price raffle weight (Comment-202608262).
		expect(await game_.getNextCstBidPriceAdvanced(burstTimeStamp_ - (await getLatestBlockTimestamp()))).equal(0n);

		// With no late bid premium, the posted price of the first burst bid is the stored ladder value.
		const preBurstEthBidPrice_ = await game_.nextEthBidPrice();
		expect(await game_.getNextEthBidPriceAdvanced(burstTimeStamp_ - (await getLatestBlockTimestamp())))
			.equal(preBurstEthBidPrice_);

		// The burst, executed FIFO within one block:
		//    bid 1: `bidder3_` ETH. Weight = the ladder value; the bid advances the ladder.
		//    bid 2: `bidder4_` ETH. Weight = the advanced ladder value.
		//    bid 3: `bidder2_` CST (free). Weight = the concurrent ladder value; a CST bid does not advance it.
		//    bid 4: `bidder1_` ETH. Weight = the same ladder value as bid 3.
		const expectedWeights_ = [];
		expectedWeights_.push(preBurstEthBidPrice_);
		expectedWeights_.push(increaseEthBidPrice_(expectedWeights_.at(-1), ethBidPriceIncreaseDivisor_));
		expectedWeights_.push(increaseEthBidPrice_(expectedWeights_.at(-1), ethBidPriceIncreaseDivisor_));
		expectedWeights_.push(expectedWeights_.at(-1));

		// #endregion
		// #region Submitting and mining the burst.

		let transactionReceipts_;
		try {
			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			const transactionResponses_ = [
				await game_.connect(bidder3_).bidWithEth(-1n, "", 0n, {value: expectedWeights_[0] * 2n, gasLimit: gasLimit_, gasPrice: gasPrice_,}),
				await game_.connect(bidder4_).bidWithEth(-1n, "", 0n, {value: expectedWeights_[1] * 2n, gasLimit: gasLimit_, gasPrice: gasPrice_,}),
				await game_.connect(bidder2_).bidWithCst((1n << 255n), "", 0n, {gasLimit: gasLimit_, gasPrice: gasPrice_,}),
				await game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: expectedWeights_[3] * 2n, gasLimit: gasLimit_, gasPrice: gasPrice_,}),
			];
			transactionReceipts_ = await mineBurstBlock_(transactionResponses_, burstTimeStamp_);
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
		}

		// #endregion
		// #region Every burst bid succeeded, in one block, at one timestamp.

		for (const transactionReceipt_ of transactionReceipts_) {
			expect(transactionReceipt_.status, "every same-second bid must succeed on the special game").equal(1);
			expect(transactionReceipt_.blockNumber).equal(transactionReceipts_[0].blockNumber);
		}
		expect(BigInt((await transactionReceipts_[0].getBlock()).timestamp)).equal(burstTimeStamp_);
		expect(await game_.getTotalNumBids(roundNum_)).equal(5n);
		expect(await game_.lastBidderAddress()).equal(bidder1_.address);

		// All the burst bidders share one recorded `lastBidTimeStamp`.
		for (const burstBidder_ of [bidder1_, bidder2_, bidder3_, bidder4_,]) {
			expect((await game_.biddersInfo(roundNum_, burstBidder_.address)).lastBidTimeStamp).equal(burstTimeStamp_);
		}

		// #endregion
		// #region The recorded weights match the JS ladder mirror exactly.

		for ( let burstBidIndex_ = 0; burstBidIndex_ < expectedWeights_.length; ++ burstBidIndex_ ) {
			const bidIndex_ = BigInt(burstBidIndex_ + 1);
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, bidIndex_)) -
					(await game_.bidRaffleCumulativeWeights(roundNum_, bidIndex_ - 1n)),
				`weight of same-second bid ${bidIndex_}`
			).equal(expectedWeights_[burstBidIndex_]);
		}

		// The free CST bid paid zero and weighs the same as the ETH bid that followed it.
		expect(expectedWeights_[2]).equal(expectedWeights_[3]);

		// #endregion
		// #region The claim's raffle draws work and replay exactly over the same-second bids.

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		const claimTransactionReceipt_ = await waitForTransactionReceipt(game_.connect(bidder1_).claimMainPrize());
		await verifyWeightedRaffleClaimDraws(game_, roundNum_, claimTransactionReceipt_);

		// #endregion
	});

	it("a same-second self-outbidding burst by one bidder works and earns one weight per bid", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n, "SpecialCosmicSignatureGameV3");
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();
		const bidder_ = contracts_.signers[1];

		await placeOpeningEthBid_(game_, bidder_);
		const openingBidTimeStamp_ = await getLatestBlockTimestamp();
		const burstTimeStamp_ = await chooseBurstTimeStamp_(game_);
		const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();
		let expectedWeight_ = await game_.nextEthBidPrice();
		const cstBalanceBeforeBurst_ = await contracts_.cosmicSignatureToken.balanceOf(bidder_.address);

		// 3 self-outbids in one block. For the 2nd and the 3rd, zero seconds have elapsed since the last bid,
		// so the bid CST reward is zero, which the bid path must tolerate (nothing is minted).
		const numBurstBids_ = 3;
		let transactionReceipts_;
		try {
			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			const transactionResponses_ = [];
			for ( let burstBidIndex_ = 0; burstBidIndex_ < numBurstBids_; ++ burstBidIndex_ ) {
				transactionResponses_.push(
					await game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: expectedWeight_ * 3n, gasLimit: gasLimit_, gasPrice: gasPrice_,})
				);
			}
			transactionReceipts_ = await mineBurstBlock_(transactionResponses_, burstTimeStamp_);
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
		}

		for ( let burstBidIndex_ = 0; burstBidIndex_ < numBurstBids_; ++ burstBidIndex_ ) {
			expect(transactionReceipts_[burstBidIndex_].status).equal(1);
			const bidIndex_ = BigInt(burstBidIndex_ + 1);
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, bidIndex_)) -
					(await game_.bidRaffleCumulativeWeights(roundNum_, bidIndex_ - 1n)),
				`weight of same-second self-outbid ${bidIndex_}`
			).equal(expectedWeight_);
			expectedWeight_ = increaseEthBidPrice_(expectedWeight_, ethBidPriceIncreaseDivisor_);
		}
		expect(await game_.getTotalNumBids(roundNum_)).equal(BigInt(numBurstBids_) + 1n);

		// Only the burst's 1st bid minted a bid CST reward (to the bidder, who outbid themselves after
		// a real elapsed duration); the same-second 2nd and 3rd bids minted nothing.
		const expectedBidCstRewardAmount_ =
			(burstTimeStamp_ - openingBidTimeStamp_) *
			(await game_.bidCstRewardAmountMultiplier()) /
			(await game_.mainPrizeTimeIncrementInMicroSeconds());
		expect((await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)) - cstBalanceBeforeBurst_)
			.equal(expectedBidCstRewardAmount_);

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		const claimTransactionReceipt_ = await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
		await verifyWeightedRaffleClaimDraws(game_, roundNum_, claimTransactionReceipt_);
	});
});

// #endregion
