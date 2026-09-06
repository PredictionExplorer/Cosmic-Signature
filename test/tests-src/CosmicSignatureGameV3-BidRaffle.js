"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	activateCurrentRound,
	findParsedEvent,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	findTimeStampWithAffordableCstBidPrice,
} = require("../src/V3UpgradeTestHelpers.js");
const {
	readBidRaffleData,
	verifyBidRaffleClaimDraws,
} = require("../src/BidRaffleTestHelpers.js");

/** Quotes the posted ETH bid price one second from now and pins the next block to that timestamp. */
async function quoteAndPinNextBid_(game_) {
	const nextBlockTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
	const postedEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(nextBlockTimeStamp_),]);
	return postedEthBidPrice_;
}

async function getCumulativeWeightAt_(game_, roundNum_, bidIndex_) {
	return (await game_.getBidInfoAt(roundNum_, bidIndex_)).raffleCumulativeWeight;
}

describe("CosmicSignatureGameV3-BidRaffle", function () {
	it("records the posted ETH bid price as every bid type's raffle weight", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();
		const [bidder1_, bidder2_, bidder3_,] = contracts_.signers.slice(1, 4);

		const postedEthBidPrice0_ = await quoteAndPinNextBid_(game_);
		await waitForTransactionReceipt(
			game_.connect(bidder1_).bidWithEth(-1n, "", 0n, { value: postedEthBidPrice0_, })
		);
		expect(await getCumulativeWeightAt_(game_, roundNum_, 0n)).equal(postedEthBidPrice0_);

		await waitForTransactionReceipt(
			contracts_.randomWalkNft.connect(bidder2_).mint({ value: await contracts_.randomWalkNft.getMintPrice(), })
		);
		const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
		const postedEthBidPrice1_ = await quoteAndPinNextBid_(game_);
		const discountedEthBidPrice1_ = await game_.getEthPlusRandomWalkNftBidPrice(postedEthBidPrice1_);
		expect(discountedEthBidPrice1_).lessThan(postedEthBidPrice1_);
		{
			const receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithEth(randomWalkNftId_, "", 0n, { value: discountedEthBidPrice1_, })
			);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidEthPrice).equal(discountedEthBidPrice1_);
			expect(
				(await getCumulativeWeightAt_(game_, roundNum_, 1n)) -
				(await getCumulativeWeightAt_(game_, roundNum_, 0n))
			).equal(postedEthBidPrice1_);
		}

		const postedEthBidPrice2_ = await quoteAndPinNextBid_(game_);
		{
			const overpaidAmount_ = 1n;
			const receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder3_).bidWithEth(
					-1n,
					"",
					0n,
					{ value: postedEthBidPrice2_ + overpaidAmount_, gasPrice: 2n * 10n ** 9n, }
				)
			);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidEthPrice)
				.equal(postedEthBidPrice2_ + overpaidAmount_);
			expect(
				(await getCumulativeWeightAt_(game_, roundNum_, 2n)) -
				(await getCumulativeWeightAt_(game_, roundNum_, 1n))
			).equal(postedEthBidPrice2_);
		}

		const postedEthBidPrice3_ = await quoteAndPinNextBid_(game_);
		await waitForTransactionReceipt(
			game_.connect(bidder1_).bidWithEth(-1n, "", 0n, { value: postedEthBidPrice3_, })
		);
		{
			const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 3_600n;
			const postedEthBidPrice4_ = await game_.getNextEthBidPriceAdvanced(3_600n);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithEth(-1n, "", 0n, { value: postedEthBidPrice4_, })
			);
			expect(
				(await getCumulativeWeightAt_(game_, roundNum_, 4n)) -
				(await getCumulativeWeightAt_(game_, roundNum_, 3n))
			).equal(postedEthBidPrice4_);
		}

		{
			const bidder1CstBalance_ = await contracts_.cosmicSignatureToken.balanceOf(bidder1_.address);
			expect(bidder1CstBalance_).greaterThan(0n);
			const affordableCstBid_ = await findTimeStampWithAffordableCstBidPrice(
				game_,
				bidder1CstBalance_,
				(await getLatestBlockTimestamp()) + 1n
			);
			const currentTimeOffset_ = affordableCstBid_.timeStamp - (await getLatestBlockTimestamp());
			const concurrentEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(currentTimeOffset_);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(affordableCstBid_.timeStamp),]);
			const receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder1_).bidWithCst(1n << 255n, "", 0n)
			);
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice).equal(affordableCstBid_.price);
			expect(
				(await getCumulativeWeightAt_(game_, roundNum_, 5n)) -
				(await getCumulativeWeightAt_(game_, roundNum_, 4n))
			).equal(concurrentEthBidPrice_);
		}

		expect(await game_.getTotalNumBids(roundNum_)).equal(6n);
		const { cumulativeWeights: cumulativeWeights_ } = await readBidRaffleData(game_, roundNum_);
		for ( let bidIndex_ = 1; bidIndex_ < cumulativeWeights_.length; ++ bidIndex_ ) {
			expect(cumulativeWeights_[bidIndex_], `cumulative weight ${bidIndex_}`)
				.greaterThan(cumulativeWeights_[bidIndex_ - 1]);
		}
		expect(await getCumulativeWeightAt_(game_, roundNum_, 6n)).equal(0n);
		expect(await getCumulativeWeightAt_(game_, roundNum_ + 1n, 0n)).equal(0n);
	});

	it("draws the exact winners selected by the cumulative weights", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();
		const bidders_ = [1, 2, 3, 4, 2,].map((signerIndex_) => contracts_.signers[signerIndex_]);

		for ( let bidIndex_ = 0; bidIndex_ < bidders_.length; ++ bidIndex_ ) {
			let postedEthBidPrice_;
			if (bidIndex_ === bidders_.length - 1) {
				const bidTimeStamp_ = (await game_.mainPrizeTime()) - 10n;
				postedEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(
					bidTimeStamp_ - (await getLatestBlockTimestamp())
				);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			} else {
				postedEthBidPrice_ = await quoteAndPinNextBid_(game_);
			}
			await waitForTransactionReceipt(
				game_.connect(bidders_[bidIndex_]).bidWithEth(-1n, "", 0n, { value: postedEthBidPrice_, })
			);
			const prevBidRaffleCumulativeWeight_ =
				(bidIndex_ > 0) ? await getCumulativeWeightAt_(game_, roundNum_, BigInt(bidIndex_ - 1)) : 0n;
			expect(
				(await getCumulativeWeightAt_(game_, roundNum_, BigInt(bidIndex_))) - prevBidRaffleCumulativeWeight_
			).equal(postedEthBidPrice_);
		}

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		const claimReceipt_ = await waitForTransactionReceipt(game_.connect(bidders_.at(-1)).claimMainPrize());
		await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
	});

	it("awards every bidder raffle prize to the only bidder", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const roundNum_ = await game_.roundNum();
		const bidder_ = contracts_.signers[1];
		const postedEthBidPrice_ = await quoteAndPinNextBid_(game_);
		await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: postedEthBidPrice_, })
		);

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		const claimReceipt_ = await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
		let numRaffleWinnerLogs_ = 0n;
		for (const log_ of claimReceipt_.logs) {
			let parsedLog_;
			try { parsedLog_ = game_.interface.parseLog(log_); } catch { continue; }
			if (
				parsedLog_?.name === "RaffleWinnerBidderEthPrizeAllocated" ||
				(parsedLog_?.name === "RaffleWinnerPrizePaid" && ! parsedLog_.args.winnerIsRandomWalkNftStaker)
			) {
				expect(parsedLog_.args.winnerAddress).equal(bidder_.address);
				++ numRaffleWinnerLogs_;
			}
		}
		expect(numRaffleWinnerLogs_).equal(
			(await game_.numRaffleEthPrizesForBidders()) +
			(await game_.numRaffleCosmicSignatureNftsForBidders())
		);
		await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
	});
});
