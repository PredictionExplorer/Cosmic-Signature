"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const { activateCurrentRound, mineAtOrAfter, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
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
			const [ethSpent_, cstSpent_] = await game_.getBidderTotalSpentAmounts(roundNum_, contracts_.signers[2].address);
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
});
