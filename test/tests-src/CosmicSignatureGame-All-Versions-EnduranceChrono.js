// [Comment-202610172]
// See `docs/endurance-chrono-README.md`.
// [/Comment-202610172]

"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES, MICROSECONDS_PER_SECOND } = require("../../src/CosmicSignatureConstants.js");
const { shuffleArray, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, findParsedEvent, mineAtOrAfter, getLatestBlockTimestamp, blockTimestampOfReceipt } = require("../src/V2UpgradeTestHelpers.js");
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

/** Makes the main prize time increment and the initial duration until main prize 100 seconds each. */
async function configureShortRound(contracts_, game_) {
	const gameForOwner_ = game_.connect(contracts_.ownerSigner);
	await waitForTransactionReceipt(gameForOwner_.setMainPrizeTimeIncrementInMicroSeconds(100n * MICROSECONDS_PER_SECOND));
	await waitForTransactionReceipt(gameForOwner_.setInitialDurationUntilMainPrizeDivisor(MICROSECONDS_PER_SECOND));
	await activateCurrentRound(game_, contracts_.ownerSigner);
}

/**
Places ETH bids by `bidders_` in a single block with the given timestamp.
All versions allow multiple bids within the same second, so a bid can remain the last bid for zero seconds.
*/
async function bidWithEthInOneBlockAt(game_, bidders_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);

	// Each bid increases the next one's price, so overpay. The excess is refunded.
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	const args_ = [-1n, ""];
	if (game_.interface.getFunction("bidWithEth").inputs.length === 3) args_.push(0n);
	const transactionResponses_ = [];
	await hre.network.provider.send("evm_setAutomine", [false]);
	try {
		await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_)]);

		// [Comment-202611021]
		// Awaiting each submission before starting the next preserves its order in Hardhat's FIFO mempool.
		// The submission completes once Hardhat accepts the transaction; it does not wait for mining.
		// Issue. These tests depend on that ordering. Concurrent contract calls can reach Hardhat in a different order,
		// even with FIFO, so replacing sequential awaits with Promise.all could make the tests fail.
		// [/Comment-202611021]
		for (const bidder_ of bidders_) {
			transactionResponses_.push(await game_.connect(bidder_).bidWithEth(...args_, { value: ethBidPrice_ * 2n }));
		}

		await hre.network.provider.send("evm_mine");
	} finally {
		await hre.network.provider.send("evm_setAutomine", [true]);
	}
	const receipts_ = await Promise.all(transactionResponses_.map((transactionResponse_) => transactionResponse_.wait()));
	for (const receipt_ of receipts_) {
		expect(receipt_.status).equal(1);
		expect(receipt_.blockNumber).equal(receipts_[0].blockNumber);
		expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	}
}

async function expectStoredEnduranceChampion(game_, address_, startTimeStamp_, duration_, prevDuration_) {
	expect(await game_.enduranceChampionAddress()).equal(address_);
	expect(await game_.enduranceChampionStartTimeStamp()).equal(startTimeStamp_);
	expect(await game_.enduranceChampionDuration()).equal(duration_);
	expect(await game_.prevEnduranceChampionDuration()).equal(prevDuration_);
}

async function expectStoredChronoWarrior(game_, address_, duration_) {
	expect(await game_.chronoWarriorAddress()).equal(address_);
	expect(await game_.chronoWarriorDuration()).equal(duration_);
}

/** Claims the main prize at the given timestamp and checks the title winners and, in V3+, the saved round stats. */
async function claimMainPrizeAndCheckChampions(game_, claimer_, roundNum_, version_, timeStamp_, expected_) {
	expect(timeStamp_).greaterThanOrEqual(await game_.mainPrizeTime());
	await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_)]);
	const receipt_ = await waitForTransactionReceipt(game_.connect(claimer_).claimMainPrize());
	expect(findParsedEvent(receipt_, game_, "EnduranceChampionPrizePaid").args.enduranceChampionAddress)
		.equal(expected_.enduranceChampion.address);
	expect(findParsedEvent(receipt_, game_, "ChronoWarriorPrizePaid").args.chronoWarriorAddress)
		.equal(expected_.chronoWarrior.address);
	if (version_ >= 3) {
		const roundStats_ = await game_.roundStats(roundNum_);
		expect(roundStats_.enduranceChampionDuration).equal(expected_.enduranceChampionDuration);
		expect(roundStats_.chronoWarriorDuration).equal(expected_.chronoWarriorDuration);
		expect(roundStats_.flags).equal(expected_.isSameBid ? SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES : 0n);
	}
}

const SCENARIOS = [
	// The example in `docs/endurance-chrono-README.md`, with times relative to `timeStamp_`.
	// The final Endurance Champion is not the final bid, but it earns both titles on main prize claim.
	async function playDocExample(contracts_, game_, roundNum_, version_) {
		const [alice_, bob_, carol_, dave_,] = contracts_.signers.slice(1, 5);
		await configureShortRound(contracts_, game_);
		const timeStamp_ = (await getLatestBlockTimestamp()) + 1000n;

		await bidWithEthAt(game_, alice_, timeStamp_ + 0n);
		expect(await game_.enduranceChampionAddress()).equal(hre.ethers.ZeroAddress);
		expect(await game_.chronoWarriorAddress()).equal(hre.ethers.ZeroAddress);

		await bidWithEthAt(game_, bob_, timeStamp_ + 100n);
		await expectStoredEnduranceChampion(game_, alice_.address, timeStamp_ + 0n, 100n, 0n);
		expect(await game_.chronoWarriorAddress()).equal(hre.ethers.ZeroAddress);

		await bidWithEthAt(game_, carol_, timeStamp_ + 250n);
		await expectStoredEnduranceChampion(game_, bob_.address, timeStamp_ + 100n, 150n, 100n);
		await expectStoredChronoWarrior(game_, alice_.address, 200n);

		await bidWithEthAt(game_, dave_, timeStamp_ + 300n);
		await expectStoredEnduranceChampion(game_, bob_.address, timeStamp_ + 100n, 150n, 100n);
		await expectStoredChronoWarrior(game_, alice_.address, 200n);

		// Real-time standings differ from the stored ones.
		await mineAtOrAfter(timeStamp_ + 600n);
		expect(await game_.tryGetCurrentChampions()).deep.equal([dave_.address, 300n, bob_.address, 250n,]);
		await expectStoredEnduranceChampion(game_, bob_.address, timeStamp_ + 100n, 150n, 100n);
		await expectStoredChronoWarrior(game_, alice_.address, 200n);

		await bidWithEthAt(game_, alice_, timeStamp_ + 700n);
		await expectStoredEnduranceChampion(game_, dave_.address, timeStamp_ + 300n, 400n, 150n);
		await expectStoredChronoWarrior(game_, bob_.address, 250n);

		await claimMainPrizeAndCheckChampions(game_, alice_, roundNum_, version_, timeStamp_ + 900n, {
			enduranceChampion: dave_, enduranceChampionDuration: 400n,
			chronoWarrior: dave_, chronoWarriorDuration: 450n,
			isSameBid: true,
		});
	},

	// A bid that remains the last bid for zero seconds cannot replace an Endurance Champion.
	async function playZeroDurationNonChampion(contracts_, game_, roundNum_, version_) {
		const [alice_, bob_, carol_,] = contracts_.signers.slice(1, 4);
		await configureShortRound(contracts_, game_);
		const timeStamp_ = (await getLatestBlockTimestamp()) + 1000n;

		await bidWithEthAt(game_, alice_, timeStamp_);
		await bidWithEthInOneBlockAt(game_, [bob_, carol_,], timeStamp_ + 100n);
		await expectStoredEnduranceChampion(game_, alice_.address, timeStamp_, 100n, 0n);
		expect(await game_.chronoWarriorAddress()).equal(hre.ethers.ZeroAddress);
		expect((await game_.getBidInfoAt(roundNum_, 1n)).bidderAddress).equal(bob_.address);
		expect((await game_.getBidInfoAt(roundNum_, 2n)).bidderAddress).equal(carol_.address);

		// Carol's bid lasts 200 seconds and replaces Alice's, which held the record from 0 to 100 + 100 = 200.
		// Carol's own record starts at 100 + 100 = 200, so at 300 her Chrono-Warrior duration is 100, which is not greater than 200.
		await claimMainPrizeAndCheckChampions(game_, carol_, roundNum_, version_, timeStamp_ + 300n, {
			enduranceChampion: carol_, enduranceChampionDuration: 200n,
			chronoWarrior: alice_, chronoWarriorDuration: 200n,
			isSameBid: false,
		});
	},

	// A zero-second bid can become the first Endurance Champion, and its Chrono-Warrior duration can be zero.
	async function playZeroDurationChampion(contracts_, game_, roundNum_, version_) {
		const [alice_, bob_, carol_,] = contracts_.signers.slice(1, 4);
		await configureShortRound(contracts_, game_);
		const timeStamp_ = (await getLatestBlockTimestamp()) + 1000n;

		await bidWithEthInOneBlockAt(game_, [alice_, bob_,], timeStamp_);
		await expectStoredEnduranceChampion(game_, alice_.address, timeStamp_, 0n, 0n);
		expect(await game_.chronoWarriorAddress()).equal(hre.ethers.ZeroAddress);

		await bidWithEthAt(game_, carol_, timeStamp_ + 50n);
		await expectStoredEnduranceChampion(game_, bob_.address, timeStamp_, 50n, 0n);
		await expectStoredChronoWarrior(game_, alice_.address, 0n);

		// Carol's bid lasts 250 seconds. Bob's bid held the record from 0 to 50 + 50 = 100.
		// Carol's record starts at 50 + 50 = 100, so at 300 her Chrono-Warrior duration is 200.
		await claimMainPrizeAndCheckChampions(game_, carol_, roundNum_, version_, timeStamp_ + 300n, {
			enduranceChampion: carol_, enduranceChampionDuration: 250n,
			chronoWarrior: carol_, chronoWarriorDuration: 200n,
			isSameBid: true,
		});
	},

	// The first two bids last zero seconds; the first remains the stored champion until the final bid is evaluated.
	async function playThreeBidsInOneBlock(contracts_, game_, roundNum_, version_) {
		const [alice_, bob_, carol_,] = contracts_.signers.slice(1, 4);
		await configureShortRound(contracts_, game_);
		const timeStamp_ = (await getLatestBlockTimestamp()) + 1000n;

		await bidWithEthInOneBlockAt(game_, [alice_, bob_, carol_,], timeStamp_);
		await expectStoredEnduranceChampion(game_, alice_.address, timeStamp_, 0n, 0n);
		expect(await game_.chronoWarriorAddress()).equal(hre.ethers.ZeroAddress);
		expect((await game_.roundStats(roundNum_)).numBids).equal(3n);
		for (const [bidIndex_, bidder_] of [alice_, bob_, carol_,].entries()) {
			expect((await game_.getBidInfoAt(roundNum_, bidIndex_)).bidderAddress).equal(bidder_.address);
		}

		await claimMainPrizeAndCheckChampions(game_, carol_, roundNum_, version_, timeStamp_ + 300n, {
			enduranceChampion: carol_, enduranceChampionDuration: 300n,
			chronoWarrior: carol_, chronoWarriorDuration: 300n,
			isSameBid: true,
		});
	},

	// In V2+, `mainPrizeTime` can remain in the past after a bid, so the bidder can claim the main prize in the same block.
	// Comment-202606175 relates.
	async function playBidAndClaimInOneBlock(contracts_, game_, roundNum_, version_) {
		const [alice_, bob_,] = contracts_.signers.slice(1, 3);
		await configureShortRound(contracts_, game_);
		const timeStamp_ = (await getLatestBlockTimestamp()) + 1000n;

		await bidWithEthAt(game_, alice_, timeStamp_);
		if (version_ < 2) {
			// In V1, a bid always moves `mainPrizeTime` to the future.
			await bidWithEthAt(game_, bob_, timeStamp_ + 1000n);
			await claimMainPrizeAndCheckChampions(game_, bob_, roundNum_, version_, await game_.mainPrizeTime(), {
				enduranceChampion: alice_, chronoWarrior: alice_,
			});
			return;
		}

		// Bob's bid lasts zero seconds. Alice's bid lasted 1000 seconds and earns both titles.
		const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(1000n);
		let bidTransactionResponse_;
		let claimTransactionResponse_;
		await hre.network.provider.send("evm_setAutomine", [false]);
		try {
			await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_ + 1000n)]);

			// Both transactions use Bob's account, so their nonces enforce bid-before-claim ordering.
			bidTransactionResponse_ = await game_.connect(bob_).bidWithEth(-1n, "", 0n, { value: ethBidPrice_ * 2n, });
			claimTransactionResponse_ = await game_.connect(bob_).claimMainPrize();

			await hre.network.provider.send("evm_mine");
		} finally {
			await hre.network.provider.send("evm_setAutomine", [true]);
		}
		const bidReceipt_ = await bidTransactionResponse_.wait();
		const claimReceipt_ = await claimTransactionResponse_.wait();
		expect(claimReceipt_.blockNumber).equal(bidReceipt_.blockNumber);
		expect(findParsedEvent(claimReceipt_, game_, "EnduranceChampionPrizePaid").args.enduranceChampionAddress).equal(alice_.address);
		expect(findParsedEvent(claimReceipt_, game_, "ChronoWarriorPrizePaid").args.chronoWarriorAddress).equal(alice_.address);
		if (version_ >= 3) {
			const roundStats_ = await game_.roundStats(roundNum_);
			expect(roundStats_.enduranceChampionDuration).equal(1000n);
			expect(roundStats_.chronoWarriorDuration).equal(1000n);
			expect(roundStats_.flags).equal(SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES);
		}
	},
];

describe("CosmicSignatureGame-All-Versions-EnduranceChrono", function () {
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

	it("follows the documented bid-by-bid, real-time, and main prize claim champion logic", async function () {
		const numRoundsByVersion_ = [undefined, 0, 0, 0,];
		const scenarios_ = [...SCENARIOS];
		shuffleArray(scenarios_);

		// Repeat upgrade sequences until every version has exercised every scenario, despite random pre-upgrade round counts.
		do {
			await testAcrossGameVersions(async (contracts_, game_, roundNum_, version_) => {
				const scenario_ = scenarios_[(numRoundsByVersion_[version_] ++) % scenarios_.length];
				await scenario_(contracts_, game_, roundNum_, version_);
			});
		} while (numRoundsByVersion_.slice(1).some((numRounds_) => numRounds_ < scenarios_.length));
	});
});
