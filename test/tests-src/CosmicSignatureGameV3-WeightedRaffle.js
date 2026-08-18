"use strict";

// Tests the V3 weighted bidder raffle (Comment-202608261): every bid's raffle weight equals
// the premium-free ETH bid price base posted at the moment of the bid (Comment-202608262) -- the full
// undiscounted base for a Random Walk NFT bid, the concurrent premium-free ETH base for a CST bid,
// never including a swallowed ETH overpayment nor the late bid price premium (the in-window weight
// cases live in CosmicSignatureGameV3-LateBidPremium.js) -- and the raffle winners are drawn by
// picking random weis, which an exact off-chain replay of the on-chain draws verifies winner by winner.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	activateCurrentRound,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	findTimeStampWithAffordableCstBidPrice,
} = require("../src/V3UpgradeTestHelpers.js");
const {
	readBidRaffleData,
	verifyWeightedRaffleClaimDraws,
} = require("../src/WeightedRaffleTestHelpers.js");

// #region Helpers.

/** Quotes the posted ETH bid price 1 second from now and pins the next block to that timestamp. */
async function quoteAndPinNextBid_(game_) {
	const nextBlockTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
	const postedEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(nextBlockTimeStamp_),]);
	return postedEthBidPrice_;
}

/** Parses the single `BidPlaced` event out of a bid transaction receipt. */
function parseBidPlacedLog_(game_, transactionReceipt_) {
	for (const log_ of transactionReceipt_.logs) {
		let parsedLog_;
		try { parsedLog_ = game_.interface.parseLog(log_); } catch { continue; }
		if (parsedLog_?.name === "BidPlaced") {
			return parsedLog_;
		}
	}
	throw new Error("No BidPlaced event found.");
}

// #endregion
// #region The tests.

describe("CosmicSignatureGameV3-WeightedRaffle", function () {
	it("records the posted ETH bid price as the raffle weight of every bid type", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();
		const [bidder1_, bidder2_, bidder3_,] = contracts_.signers.slice(1, 4);

		// #region Bid 0: a plain ETH bid at the exact posted price.

		const postedEthBidPrice0_ = await quoteAndPinNextBid_(game_);
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: postedEthBidPrice0_,}));
		expect(await game_.bidRaffleCumulativeWeights(roundNum_, 0n)).equal(postedEthBidPrice0_);

		// #endregion
		// #region Bid 1: an ETH + Random Walk NFT bid weighs the full undiscounted price.

		await waitForTransactionReceipt(
			contracts_.randomWalkNft.connect(bidder2_).mint({value: await contracts_.randomWalkNft.getMintPrice(),})
		);
		const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
		const postedEthBidPrice1_ = await quoteAndPinNextBid_(game_);
		const discountedEthBidPrice1_ = await game_.getEthPlusRandomWalkNftBidPrice(postedEthBidPrice1_);
		expect(discountedEthBidPrice1_).lessThan(postedEthBidPrice1_);
		{
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithEth(randomWalkNftId_, "", 0n, {value: discountedEthBidPrice1_,})
			);

			// The bidder paid the discounted price, but the raffle weight is the full price.
			expect(parseBidPlacedLog_(game_, transactionReceipt_).args.paidEthPrice).equal(discountedEthBidPrice1_);
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, 1n)) - (await game_.bidRaffleCumulativeWeights(roundNum_, 0n))
			).equal(postedEthBidPrice1_);
		}

		// #endregion
		// #region Bid 2: a swallowed ETH overpayment does not increase the weight.

		const postedEthBidPrice2_ = await quoteAndPinNextBid_(game_);
		{
			const overpaidAmount_ = 1n;
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(bidder3_).bidWithEth(-1n, "", 0n, {value: postedEthBidPrice2_ + overpaidAmount_, gasPrice: 2n * 10n ** 9n,})
			);

			// The overpayment was small enough to be swallowed into the recorded paid price...
			expect(parseBidPlacedLog_(game_, transactionReceipt_).args.paidEthPrice).equal(postedEthBidPrice2_ + overpaidAmount_);

			// ...but the raffle weight is the posted price.
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, 2n)) - (await game_.bidRaffleCumulativeWeights(roundNum_, 1n))
			).equal(postedEthBidPrice2_);
		}

		// #endregion
		// #region Bids 3 and 4: earning `bidder1_` some CST (minted to the bidder being outbid).

		const postedEthBidPrice3_ = await quoteAndPinNextBid_(game_);
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: postedEthBidPrice3_,}));
		{
			const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 3_600n;
			const postedEthBidPrice4_ = await game_.getNextEthBidPriceAdvanced(3_600n);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			await waitForTransactionReceipt(game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: postedEthBidPrice4_,}));
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, 4n)) - (await game_.bidRaffleCumulativeWeights(roundNum_, 3n))
			).equal(postedEthBidPrice4_);
		}

		// #endregion
		// #region Bid 5: a CST bid weighs the concurrent ETH bid price.

		{
			const bidder1CstBalance_ = await contracts_.cosmicSignatureToken.balanceOf(bidder1_.address);
			expect(bidder1CstBalance_).greaterThan(0n);
			const affordableCstBid_ =
				await findTimeStampWithAffordableCstBidPrice(game_, bidder1CstBalance_, (await getLatestBlockTimestamp()) + 1n);
			const currentTimeOffset_ = affordableCstBid_.timeStamp - (await getLatestBlockTimestamp());
			const concurrentEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(currentTimeOffset_);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(affordableCstBid_.timeStamp),]);
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(bidder1_).bidWithCst((1n << 255n), "", 0n)
			);
			expect(parseBidPlacedLog_(game_, transactionReceipt_).args.paidCstPrice).equal(affordableCstBid_.price);
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, 5n)) - (await game_.bidRaffleCumulativeWeights(roundNum_, 4n))
			).equal(concurrentEthBidPrice_);
		}

		// #endregion
		// #region The whole round's raffle data is consistent.

		expect(await game_.getTotalNumBids(roundNum_)).equal(6n);
		const { cumulativeWeights: cumulativeWeights_ } = await readBidRaffleData(game_, roundNum_);
		for ( let bidIndex_ = 1; bidIndex_ < cumulativeWeights_.length; ++ bidIndex_ ) {
			expect(cumulativeWeights_[bidIndex_], `cumulative weights must strictly increase at ${bidIndex_}`)
				.greaterThan(cumulativeWeights_[bidIndex_ - 1]);
		}

		// Out of range reads return zero.
		expect(await game_.bidRaffleCumulativeWeights(roundNum_, 6n)).equal(0n);
		expect(await game_.bidRaffleCumulativeWeights(roundNum_ + 1n, 0n)).equal(0n);

		// #endregion
	});

	it("draws every raffle winner exactly as the weighted selection dictates (off-chain replay)", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();

		// Several bidders with unequal weights (the price ladder grows on each bid; the last bid lands
		// deep inside the late bid premium window, pays the premium, and still weighs only the
		// premium-free base, Comment-202608262).
		const bidders_ = [1, 2, 3, 4, 2,].map((signerIndex_) => (contracts_.signers[signerIndex_]));
		for ( let bidIndex_ = 0; bidIndex_ < bidders_.length; ++ bidIndex_ ) {
			const isLastBid_ = bidIndex_ === bidders_.length - 1;
			let postedEthBidPrice_;
			let expectedBidRaffleWeight_;
			if (isLastBid_) {
				// Bid 10 seconds before `mainPrizeTime`, deep inside the late bid premium window.
				const bidTimeStamp_ = (await game_.mainPrizeTime()) - 10n;
				postedEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(bidTimeStamp_ - (await getLatestBlockTimestamp()));

				// A non-first bid's premium-free base is the stored next-bid ladder value,
				// and the premium this bid pays on top of it buys no raffle weight.
				expectedBidRaffleWeight_ = await game_.nextEthBidPrice();
				expect(postedEthBidPrice_).greaterThan(expectedBidRaffleWeight_);

				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			} else {
				postedEthBidPrice_ = await quoteAndPinNextBid_(game_);
				expectedBidRaffleWeight_ = postedEthBidPrice_;
			}
			await waitForTransactionReceipt(
				game_.connect(bidders_[bidIndex_]).bidWithEth(-1n, "", 0n, {value: postedEthBidPrice_,})
			);
			expect(
				(await game_.bidRaffleCumulativeWeights(roundNum_, BigInt(bidIndex_))) -
				((bidIndex_ > 0) ? await game_.bidRaffleCumulativeWeights(roundNum_, BigInt(bidIndex_ - 1)) : 0n)
			).equal(expectedBidRaffleWeight_);
		}

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		const claimTransactionReceipt_ = await waitForTransactionReceipt(game_.connect(bidders_.at(-1)).claimMainPrize());
		await verifyWeightedRaffleClaimDraws(game_, roundNum_, claimTransactionReceipt_);
	});

	it("a single bidder wins every bidder raffle prize", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();
		const bidder_ = contracts_.signers[1];

		const postedEthBidPrice_ = await quoteAndPinNextBid_(game_);
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: postedEthBidPrice_,}));

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		const claimTransactionReceipt_ = await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());

		let numRaffleWinnerLogs_ = 0n;
		for (const log_ of claimTransactionReceipt_.logs) {
			let parsedLog_;
			try { parsedLog_ = game_.interface.parseLog(log_); } catch { continue; }
			if (parsedLog_?.name === "RaffleWinnerBidderEthPrizeAllocated" ||
				(parsedLog_?.name === "RaffleWinnerPrizePaid" && ! parsedLog_.args.winnerIsRandomWalkNftStaker)
			) {
				expect(parsedLog_.args.winnerAddress).equal(bidder_.address);
				++ numRaffleWinnerLogs_;
			}
		}
		expect(numRaffleWinnerLogs_)
			.equal((await game_.numRaffleEthPrizesForBidders()) + (await game_.numRaffleCosmicSignatureNftsForBidders()));

		await verifyWeightedRaffleClaimDraws(game_, roundNum_, claimTransactionReceipt_);
	});
});

// #endregion
