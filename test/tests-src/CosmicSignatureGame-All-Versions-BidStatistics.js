"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES, MICROSECONDS_PER_SECOND } = require("../../src/CosmicSignatureConstants.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, findParsedEvent, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const { testAcrossGameVersions, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

describe("CosmicSignatureGame-All-Versions-BidStatistics", function () {
	it("keeps round history across upgrades and saves V3+ champion durations and individual-bid flags only on main prize claim", async function () {
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
