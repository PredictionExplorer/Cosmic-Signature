"use strict";

// Tests `RaffleWeightHelpers` (Comment-202608261), the weighted bidder raffle selection library,
// through `RaffleWeightHelpersTestHarness`: cumulative sum maintenance, exhaustive
// selection-proportionality enumeration, boundary weis, zero-weight bids, huge weights,
// and a seeded fuzz campaign against a linear-scan reference implementation.
//
// The library reads no timestamps, so these tests cover multiple-bids-per-second scenarios
// by construction: a "bid" here is nothing but a weight, no matter when it was placed.

const { describe, it, before } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256FromSeedWrapper } = require("../../src/Helpers.js");
const { parseFuzzSeedFromEnvironment } = require("../src/fuzz/FuzzSeed.js");
const { pickBidIndexReference, calculateCumulativeWeights } = require("../src/WeightedRaffleTestHelpers.js");

// #region The tests.

describe("RaffleWeightHelpers", function () {
	/** @type {import("ethers").Contract} */
	let harness_;

	/** Each populated array gets a unique id; the harness keeps them independent. */
	let nextArrayId_ = 0n;

	before(async function () {
		const harnessFactory_ = await hre.ethers.getContractFactory("RaffleWeightHelpersTestHarness");
		harness_ = await harnessFactory_.deploy();
		await harness_.waitForDeployment();
	});

	/** Populates a fresh array with `weights_` and verifies the recorded cumulative sums. */
	async function populateAndVerifyArray_(weights_) {
		const arrayId_ = nextArrayId_;
		++ nextArrayId_;
		await (await harness_.appendWeights(arrayId_, weights_)).wait();
		const cumulativeWeights_ = calculateCumulativeWeights(weights_);
		expect(await harness_.getNumBids(arrayId_)).equal(BigInt(weights_.length));
		for ( let bidIndex_ = 0; bidIndex_ < weights_.length; ++ bidIndex_ ) {
			expect(await harness_.getCumulativeWeightAt(arrayId_, bidIndex_), `cumulative sum at ${bidIndex_}`).equal(cumulativeWeights_[bidIndex_]);
		}
		expect(await harness_.getTotalWeight(arrayId_)).equal(cumulativeWeights_.at(-1) ?? 0n);
		return { arrayId_, cumulativeWeights_ };
	}

	/** Runs the on-chain search for every given wei and compares against the linear-scan reference. */
	async function verifySelections_(arrayId_, cumulativeWeights_, randomWeis_) {
		const bidIndexes_ = await harness_.pickBidIndexMany(arrayId_, randomWeis_);
		for ( let weiIndex_ = 0; weiIndex_ < randomWeis_.length; ++ weiIndex_ ) {
			expect(bidIndexes_[weiIndex_], `owner of wei ${randomWeis_[weiIndex_]}`)
				.equal(pickBidIndexReference(cumulativeWeights_, randomWeis_[weiIndex_]));
		}
	}

	it("maintains cumulative sums and the total weight", async function () {
		await populateAndVerifyArray_([3n, 0n, 7n,]);
		await populateAndVerifyArray_([1n,]);

		// An empty array has a zero total.
		expect(await harness_.getTotalWeight(999_999_999n)).equal(0n);
	});

	it("selects every wei's owner exactly, in proportion to the weights (exhaustive enumeration)", async function () {
		// Weight patterns deliberately include zero-weight bids in the first, middle, and last positions,
		// equal weights, a single bid, and adjacent weights. Zero-weight bids own an empty wei range,
		// so they must never be selected.
		const weightArrays_ = [
			[1n,],
			[1n, 1n, 1n,],
			[3n, 0n, 7n,],
			[0n, 0n, 4n,],
			[2n, 0n, 0n, 3n,],
			[5n, 1n,],
			[1n, 2n, 3n, 4n, 5n,],
			[10n, 0n, 10n, 0n, 10n,],
			[7n, 11n, 0n, 1n, 23n, 5n,],
		];
		for (const weights_ of weightArrays_) {
			const { arrayId_, cumulativeWeights_ } = await populateAndVerifyArray_(weights_);
			const totalWeight_ = cumulativeWeights_.at(-1);

			// Every wei in [0, totalWeight), exhaustively.
			const allWeis_ = Array.from({length: Number(totalWeight_),}, (ignored_, weiValue_) => (BigInt(weiValue_)));
			const bidIndexes_ = await harness_.pickBidIndexMany(arrayId_, allWeis_);

			// Exact per-wei ownership, and therefore exact proportionality: bid `i` is selected `weights_[i]` times.
			const weightsDescription_ = weights_.join(",");
			const selectionCounts_ = new Array(weights_.length).fill(0n);
			for ( let weiValue_ = 0; weiValue_ < allWeis_.length; ++ weiValue_ ) {
				expect(bidIndexes_[weiValue_], `owner of wei ${weiValue_} of ${weightsDescription_}`)
					.equal(pickBidIndexReference(cumulativeWeights_, BigInt(weiValue_)));
				++ selectionCounts_[Number(bidIndexes_[weiValue_])];
			}
			for ( let bidIndex_ = 0; bidIndex_ < weights_.length; ++ bidIndex_ ) {
				expect(selectionCounts_[bidIndex_], `selection count of bid ${bidIndex_} of ${weightsDescription_}`).equal(weights_[bidIndex_]);
			}
		}
	});

	it("lands boundary weis on the boundary owners", async function () {
		const weights_ = [3n, 0n, 7n, 5n,];
		const { arrayId_ } = await populateAndVerifyArray_(weights_);

		// Cumulative sums: [3, 3, 10, 15]. Bid 1 owns the empty range [3, 3).
		expect(await harness_.pickBidIndex(arrayId_, 0n)).equal(0n);
		expect(await harness_.pickBidIndex(arrayId_, 2n)).equal(0n);
		expect(await harness_.pickBidIndex(arrayId_, 3n)).equal(2n);
		expect(await harness_.pickBidIndex(arrayId_, 9n)).equal(2n);
		expect(await harness_.pickBidIndex(arrayId_, 10n)).equal(3n);
		expect(await harness_.pickBidIndex(arrayId_, 14n)).equal(3n);
	});

	it("handles realistically huge weights", async function () {
		// On the order of the ETH total supply in wei, and far beyond.
		const bigWeight1_ = 123_456_789n * 10n ** 18n;
		const bigWeight2_ = 10n ** 30n;
		const weights_ = [bigWeight1_, 1n, bigWeight2_,];
		const { arrayId_, cumulativeWeights_ } = await populateAndVerifyArray_(weights_);
		const boundaryWeis_ = [
			0n,
			bigWeight1_ - 1n,
			bigWeight1_,
			bigWeight1_ + 1n,
			cumulativeWeights_.at(-1) - 1n,
		];
		await verifySelections_(arrayId_, cumulativeWeights_, boundaryWeis_);
	});

	it("fuzz: the binary search matches the linear-scan reference on random weight arrays", async function () {
		// Deterministic by default; override with the FUZZ_SEED environment variable to reproduce a failure.
		const seed_ = parseFuzzSeedFromEnvironment(process.env["FUZZ_SEED"]) ?? 0x9d1a35c5a45c2f11ba07899fa25ce2a557eeff29e6c273e0b25ce33cd24b6f95n;
		const randomNumberSeedWrapper_ = {value: seed_,};
		const random_ = () => (generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_));
		const numArrays_ = 150;

		for ( let arrayCounter_ = 0; arrayCounter_ < numArrays_; ++ arrayCounter_ ) {
			// #region Generating a random weight array.

			const numBids_ = Number(random_() % 50n) + 1;
			const weights_ = [];
			for ( let bidIndex_ = 0; bidIndex_ < numBids_; ++ bidIndex_ ) {
				const weightKind_ = random_() % 10n;
				let weight_;
				if (weightKind_ < 1n) {
					weight_ = 0n;
				} else if (weightKind_ < 3n) {
					weight_ = 1n;
				} else if (weightKind_ < 7n) {
					weight_ = random_() % 1_000n + 1n;
				} else {
					weight_ = random_() % (10n ** 30n) + 1n;
				}
				weights_.push(weight_);
			}

			// The total must be a nonzero (the production code guarantees that; Comment-202608262).
			if (weights_.every((weight_) => (weight_ === 0n))) {
				weights_[Number(random_() % BigInt(numBids_))] = random_() % 1_000n + 1n;
			}

			// #endregion
			// #region Verifying the cumulative sums and a batch of selections.

			const { arrayId_, cumulativeWeights_ } = await populateAndVerifyArray_(weights_);
			const totalWeight_ = cumulativeWeights_.at(-1);

			// Random weis plus every boundary: 0, total - 1, and each cumulative sum edge.
			const randomWeis_ = [0n, totalWeight_ - 1n,];
			for (const cumulativeWeight_ of cumulativeWeights_) {
				if (cumulativeWeight_ < totalWeight_) {
					randomWeis_.push(cumulativeWeight_);
				}
				if (cumulativeWeight_ > 0n && cumulativeWeight_ - 1n < totalWeight_) {
					randomWeis_.push(cumulativeWeight_ - 1n);
				}
			}
			for ( let weiCounter_ = 0; weiCounter_ < 30; ++ weiCounter_ ) {
				randomWeis_.push(random_() % totalWeight_);
			}
			await verifySelections_(arrayId_, cumulativeWeights_, randomWeis_);

			// #endregion
		}
	});
});

// #endregion
