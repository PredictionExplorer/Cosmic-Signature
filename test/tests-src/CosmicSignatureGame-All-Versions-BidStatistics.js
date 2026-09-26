"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES, MICROSECONDS_PER_SECOND } = require("../../src/CosmicSignatureConstants.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, findParsedEvent, mineAtOrAfter, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const { testAcrossGameVersions, finishGameRound, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

async function checkEnduranceChampion(contracts_, game_, bidderIndices_, timeOffsets_, winnerIndex_, duration_) {
	const startTime_ = await getLatestBlockTimestamp() + 100n;
	for (let index_ = 0; index_ < bidderIndices_.length; ++ index_) {
		await bidWithEthAt(game_, contracts_.signers[bidderIndices_[index_]], startTime_ + timeOffsets_[index_]);
	}
	const [address_, actualDuration_] = await game_.tryGetCurrentChampions();
	expect(address_).equal(await game_.enduranceChampionAddress());
	expect(address_).equal(contracts_.signers[winnerIndex_].address);
	expect(actualDuration_).equal(await game_.enduranceChampionDuration());
	expect(actualDuration_).equal(duration_);
}

describe("CosmicSignatureGame-All-Versions-BidStatistics", function () {
	it("selects the longest bid among two bidders", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			await checkEnduranceChampion(contracts_, game_, [1, 2, 1, 2, 1], [0n, 1000n, 6000n, 7000n, 8000n], 2, 5000n);
			await finishGameRound(contracts_, game_);
		});
	});

	it("keeps the first champion when three bidders have equal bid durations", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const bidders_ = [1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 1, 2, 1];
			await checkEnduranceChampion(contracts_, game_, bidders_, bidders_.map((_, index_) => BigInt(index_) * 1000n), 1, 1000n);
			await finishGameRound(contracts_, game_);
		});
	});

	it("replaces the champion as successively longer bids finish", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			await checkEnduranceChampion(contracts_, game_, [0, 1, 2, 3], [0n, 1000n, 3000n, 8000n], 2, 5000n);
			await finishGameRound(contracts_, game_);
		});
	});

	it("keeps the longer Chrono-Warrior tenure when the current Endurance Champion changes", async function () {
		await testAcrossGameVersions(async (contracts_, game_, roundNum_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const baseTimeStamp_ = await getLatestBlockTimestamp() + 100n;
			await bidWithEthAt(game_, contracts_.signers[1], baseTimeStamp_);
			await bidWithEthAt(game_, contracts_.signers[2], baseTimeStamp_ + 100n);
			await bidWithEthAt(game_, contracts_.signers[3], baseTimeStamp_ + 10_100n);
			await bidWithEthAt(game_, contracts_.signers[4], baseTimeStamp_ + 20_200n);
			// const [ethSpent_, cstSpent_] = await game_.getBidderTotalSpentAmounts(roundNum_, contracts_.signers[2].address);
			const { totalSpentEthAmount: ethSpent_, totalSpentCstAmount: cstSpent_ } =
				await game_.biddersInfo(roundNum_, contracts_.signers[2].address);
			expect(ethSpent_).greaterThan(0n);
			expect(cstSpent_).equal(0n);
			expect(await game_.enduranceChampionAddress()).equal(contracts_.signers[3].address);
			expect(await game_.enduranceChampionDuration()).equal(10_100n);
			expect(await game_.chronoWarriorAddress()).equal(contracts_.signers[2].address);
			expect(await game_.chronoWarriorDuration()).equal(19_900n);
			await mineAtOrAfter(baseTimeStamp_ + 30_301n);
			const champions_ = await game_.tryGetCurrentChampions();
			expect(champions_[0]).equal(contracts_.signers[4].address);
			expect(champions_[1]).equal(10_101n);
			expect(champions_[2]).equal(contracts_.signers[2].address);
			expect(champions_[3]).equal(19_900n);
			await finishGameRound(contracts_, game_);
		});
	});

	it("keeps round history across upgrades and saves V3 champion durations and individual-bid flags only on claim", async function () {
		const completedRounds_ = [];
		const numRoundsByVersion_ = [0, 0, 0, 0];
		const scenarios_ = [
			{ bidderIndices: [1], bidTimeOffsets: [0n], claimOffset: 150n, enduranceDuration: 150n, chronoDuration: 150n, chronoBidderIndex: 1, sameBid: true },

			// The third bid selects an earlier Chrono-Warrior. At claim, the same wallet wins both titles with different bids.
			{ bidderIndices: [1, 2, 1], bidTimeOffsets: [0n, 100n, 201n], claimOffset: 452n, enduranceDuration: 251n, chronoDuration: 200n, chronoBidderIndex: 1, sameBid: false },

			// Equal Chrono-Warrior tenures keep the earlier bid; one additional second replaces it.
			{ bidderIndices: [1, 2], bidTimeOffsets: [0n, 100n], claimOffset: 400n, enduranceDuration: 300n, chronoDuration: 200n, chronoBidderIndex: 1, sameBid: false },
			{ bidderIndices: [1, 2], bidTimeOffsets: [0n, 100n], claimOffset: 401n, enduranceDuration: 301n, chronoDuration: 201n, chronoBidderIndex: 2, sameBid: true },
		];
		await testAcrossGameVersions(async (contracts_, game_, roundNum_, version_) => {
			for (const previousRound_ of completedRounds_) {
				expect(await game_.roundStats(previousRound_.roundNum)).deep.equal(previousRound_.stats);
				expect(await game_.getBidInfoAt(previousRound_.roundNum, 0n)).deep.equal(previousRound_.firstBidInfo);
			}

			const scenario_ = scenarios_[numRoundsByVersion_[version_] ++];
			const gameForOwner_ = game_.connect(contracts_.ownerSigner);
			await waitForTransactionReceipt(gameForOwner_.setMainPrizeTimeIncrementInMicroSeconds(100n * MICROSECONDS_PER_SECOND));
			await waitForTransactionReceipt(gameForOwner_.setInitialDurationUntilMainPrizeDivisor(MICROSECONDS_PER_SECOND));
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const startTimeStamp_ = await getLatestBlockTimestamp() + 10n;
			const spentAmountsByBidder_ = new Map();
			for (let bidIndex_ = 0; bidIndex_ < scenario_.bidderIndices.length; ++ bidIndex_) {
				const bidder_ = contracts_.signers[scenario_.bidderIndices[bidIndex_]];
				const bidTimeStamp_ = startTimeStamp_ + scenario_.bidTimeOffsets[bidIndex_];
				const receipt_ = await bidWithEthAt(game_, bidder_, bidTimeStamp_);
				const paidEthPrice_ = findParsedEvent(receipt_, game_, "BidPlaced").args.paidEthPrice;
				const spentEthAmount_ = (spentAmountsByBidder_.get(bidder_.address) ?? 0n) + paidEthPrice_;
				spentAmountsByBidder_.set(bidder_.address, spentEthAmount_);
				const bidderInfo_ = await game_.biddersInfo(roundNum_, bidder_.address);
				expect(bidderInfo_.totalSpentEthAmount).equal(spentEthAmount_);
				expect(bidderInfo_.totalSpentCstAmount).equal(0n);
				expect(bidderInfo_.lastBidTimeStamp).equal(bidTimeStamp_);
				expect((await game_.getBidInfoAt(roundNum_, bidIndex_)).bidderAddress).equal(bidder_.address);
				const stats_ = await game_.roundStats(roundNum_);
				expect(stats_.numBids).equal(BigInt(bidIndex_) + 1n);
				expect(stats_.enduranceChampionDuration).equal(0n);
				expect(stats_.chronoWarriorDuration).equal(0n);
				expect(stats_.flags).equal(0n);
			}

			const lastBidder_ = contracts_.signers[scenario_.bidderIndices.at(-1)];
			const claimTimeStamp_ = startTimeStamp_ + scenario_.claimOffset;
			expect(claimTimeStamp_).greaterThanOrEqual(await game_.mainPrizeTime());
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(claimTimeStamp_)]);
			const receipt_ = await waitForTransactionReceipt(game_.connect(lastBidder_).claimMainPrize());
			expect(findParsedEvent(receipt_, game_, "EnduranceChampionPrizePaid").args.enduranceChampionAddress)
				.equal(lastBidder_.address);
			expect(findParsedEvent(receipt_, game_, "ChronoWarriorPrizePaid").args.chronoWarriorAddress)
				.equal(contracts_.signers[scenario_.chronoBidderIndex].address);

			const stats_ = await game_.roundStats(roundNum_);
			expect(stats_.numBids).equal(BigInt(scenario_.bidderIndices.length));
			if (version_ < 3) {
				// V1 and V2 retain bid counts but never populate the appended V3 statistics.
				expect(Array.from(stats_).slice(1)).deep.equal(Array(8).fill(0n));
			} else {
				expect(stats_.enduranceChampionDuration).equal(scenario_.enduranceDuration);
				expect(stats_.chronoWarriorDuration).equal(scenario_.chronoDuration);
				expect(stats_.flags).equal(scenario_.sameBid ? SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES : 0n);
			}
			completedRounds_.push({ roundNum: roundNum_, stats: stats_, firstBidInfo: await game_.getBidInfoAt(roundNum_, 0n) });
			expect(Array.from(await game_.roundStats(roundNum_ + 1n))).deep.equal(Array(9).fill(0n));
		});
	});
});
