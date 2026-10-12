"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { SECONDS_PER_HOUR } = require("../../src/CosmicSignatureConstants.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, findParsedEvent, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const {
	findTimeStampWithAffordableCstBidPrice,
	getV3CstDutchAuctionBeginningBidPriceMaxLimit,
	getV3CstBidRaffleWeight,
} = require("../src/V3UpgradeTestHelpers.js");
const { verifyBidRaffleClaimDraws, readBidRaffleData } = require("../src/BidRaffleTestHelpers.js");
const { testAcrossGameVersions, finishGameRound } = require("../src/GameRoundTestHelpers.js");

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
	it("weighs an ETH bid by its base ETH bid price and a CST bid by the fraction of the asking CST price it pays", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
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
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + SECONDS_PER_HOUR;
				const postedEthBidPrice4_ = await game_.getNextEthBidPriceAdvanced(SECONDS_PER_HOUR);
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
				const latestTimeStamp_ = await getLatestBlockTimestamp();
				const affordableCstBid_ = await findTimeStampWithAffordableCstBidPrice(game_, bidder1CstBalance_, latestTimeStamp_ + 1n);

				// Comment-202611027 applies. This is the round's first CST bid, so the CST Dutch auction it pays into
				// began at the maximum beginning bid price, calculated from the live parameters (Comment-202611025).
				expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
				const cstDutchAuctionBeginningBidPrice_ =
					getV3CstDutchAuctionBeginningBidPriceMaxLimit(
						await game_.bidCstRewardAmountMultiplier(),
						await game_.initialDurationUntilMainPrizeDivisor()
					);
				const cstBidPriceBase_ = await game_.getNextCstBidPriceBaseAdvanced(affordableCstBid_.timeStamp - latestTimeStamp_);
				expect(cstBidPriceBase_).greaterThan(0n);
				expect(cstBidPriceBase_).lessThan(cstDutchAuctionBeginningBidPrice_);
				const concurrentEthBidPriceBase_ = await game_.nextEthBidPrice();
				const expectedBidRaffleWeight_ =
					getV3CstBidRaffleWeight(concurrentEthBidPriceBase_, cstBidPriceBase_, cstDutchAuctionBeginningBidPrice_);
				expect(expectedBidRaffleWeight_).greaterThan(0n);
				expect(expectedBidRaffleWeight_).lessThan(concurrentEthBidPriceBase_);

				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(affordableCstBid_.timeStamp),]);
				const receipt_ = await waitForTransactionReceipt(
					game_.connect(bidder1_).bidWithCst(1n << 255n, "", 0n)
				);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice).equal(affordableCstBid_.price);
				expect(
					(await getCumulativeWeightAt_(game_, roundNum_, 5n)) -
					(await getCumulativeWeightAt_(game_, roundNum_, 4n))
				).equal(expectedBidRaffleWeight_);
			}

			// expect(await game_.getTotalNumBids(roundNum_)).equal(6n);
			expect((await game_.roundStats(roundNum_)).numBids).equal(6n);
			const { cumulativeWeights: cumulativeWeights_ } = await readBidRaffleData(game_, roundNum_);
			for ( let bidIndex_ = 1; bidIndex_ < cumulativeWeights_.length; ++ bidIndex_ ) {
				expect(cumulativeWeights_[bidIndex_], `cumulative weight ${bidIndex_}`)
					.greaterThan(cumulativeWeights_[bidIndex_ - 1]);
			}
			expect(await getCumulativeWeightAt_(game_, roundNum_, 6n)).equal(0n);
			expect(await getCumulativeWeightAt_(game_, roundNum_ + 1n, 0n)).equal(0n);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("draws the exact winners selected by the cumulative weights", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const roundNum_ = await game_.roundNum();
			const bidders_ = [1, 2, 3, 4, 2,].map((signerIndex_) => contracts_.signers[signerIndex_]);

			for ( let bidIndex_ = 0; bidIndex_ < bidders_.length; ++ bidIndex_ ) {
				let postedEthBidPrice_;
				let expectedBidRaffleWeight_;
				if (bidIndex_ === bidders_.length - 1) {
					const bidTimeStamp_ = (await game_.mainPrizeTime()) - 10n;
					postedEthBidPrice_ = await game_.getNextEthBidPriceAdvanced(
						bidTimeStamp_ - (await getLatestBlockTimestamp())
					);
					expectedBidRaffleWeight_ = await game_.nextEthBidPrice();
					expect(postedEthBidPrice_).greaterThan(expectedBidRaffleWeight_);
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
				} else {
					postedEthBidPrice_ = await quoteAndPinNextBid_(game_);
					expectedBidRaffleWeight_ = postedEthBidPrice_;
				}
				await waitForTransactionReceipt(
					game_.connect(bidders_[bidIndex_]).bidWithEth(-1n, "", 0n, { value: postedEthBidPrice_, })
				);
				const prevBidRaffleCumulativeWeight_ =
					(bidIndex_ > 0) ? await getCumulativeWeightAt_(game_, roundNum_, BigInt(bidIndex_ - 1)) : 0n;
				expect(
					(await getCumulativeWeightAt_(game_, roundNum_, BigInt(bidIndex_))) - prevBidRaffleCumulativeWeight_
				).equal(expectedBidRaffleWeight_);
			}

			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
			const claimReceipt_ = await waitForTransactionReceipt(game_.connect(bidders_.at(-1)).claimMainPrize());
			await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
		}, 3, 3);
	});

	it("gives a CST bid placed at a zero CST bid price base a zero raffle weight, which the raffle never draws", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const roundNum_ = await game_.roundNum();
			const ethBidders_ = contracts_.signers.slice(1, 4);

			// This bidder places no other bid in the round, so a raffle prize paid to it could only come from the zero-weight bid.
			const cstBidder_ = contracts_.signers[4];

			for (const ethBidder_ of ethBidders_) {
				const postedEthBidPrice_ = await quoteAndPinNextBid_(game_);
				await waitForTransactionReceipt(
					game_.connect(ethBidder_).bidWithEth(-1n, "", 0n, { value: postedEthBidPrice_, })
				);
			}
			const numEthBids_ = BigInt(ethBidders_.length);
			const totalWeightBeforeCstBid_ = await getCumulativeWeightAt_(game_, roundNum_, numEthBids_ - 1n);
			expect(totalWeightBeforeCstBid_).greaterThan(0n);

			// The CST bid price base reaches zero once the CST Dutch auction duration elapses (Comment-202611023).
			// The round's first CST Dutch auction lasts about the initial duration until main prize, which each ETH bid above
			// extended by a main prize time increment, so this timestamp precedes the late-bid premium window
			// and the whole CST bid price is zero too.
			const cstBidTimeStamp_ =
				(await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
			const currentTimeOffset_ = cstBidTimeStamp_ - (await getLatestBlockTimestamp());
			expect(currentTimeOffset_).greaterThan(0n);
			expect(cstBidTimeStamp_ + (await game_.getRoundLateBidDuration())).lessThan(await game_.mainPrizeTime());
			expect(await game_.getNextCstBidPriceBaseAdvanced(currentTimeOffset_)).equal(0n);
			expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_)).equal(0n);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(cstBidTimeStamp_),]);
			const receipt_ = await waitForTransactionReceipt(game_.connect(cstBidder_).bidWithCst(0n, "", 0n));
			expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice).equal(0n);

			// Comment-202611027 applies: the weight is zero, so the cumulative weight does not grow.
			expect(await getCumulativeWeightAt_(game_, roundNum_, numEthBids_)).equal(totalWeightBeforeCstBid_);
			const { bidderAddresses: bidderAddresses_, totalWeight: totalWeight_ } = await readBidRaffleData(game_, roundNum_);
			expect(bidderAddresses_).deep.equal([...ethBidders_.map((bidder_) => bidder_.address), cstBidder_.address,]);
			expect(totalWeight_).equal(totalWeightBeforeCstBid_);

			// Comment-202611029 applies: a zero-weight bid is never the first bid whose cumulative weight exceeds the target,
			// so the replayed draws and the emitted winners can never name the CST bidder.
			const claimReceipt_ = await finishGameRound(contracts_, game_);
			await verifyBidRaffleClaimDraws(game_, roundNum_, claimReceipt_);
			let numRaffleWinnerLogs_ = 0n;
			for (const log_ of claimReceipt_.logs) {
				let parsedLog_;
				try { parsedLog_ = game_.interface.parseLog(log_); } catch { continue; }
				if (
					parsedLog_?.name === "RaffleWinnerBidderEthPrizeAllocated" ||
					(parsedLog_?.name === "RaffleWinnerPrizePaid" && ! parsedLog_.args.winnerIsRandomWalkNftStaker)
				) {
					expect(parsedLog_.args.winnerAddress).not.equal(cstBidder_.address);
					++ numRaffleWinnerLogs_;
				}
			}
			expect(numRaffleWinnerLogs_).equal(
				(await game_.numRaffleEthPrizesForBidders()) +
				(await game_.numRaffleCosmicSignatureNftsForBidders())
			);
		}, 3, 3);
	});

	it("awards every bidder raffle prize to the only bidder", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
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
		}, 3, 3);
	});
});
