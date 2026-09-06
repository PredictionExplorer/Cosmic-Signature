"use strict";

const { describe, it, before } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper, uint256ToPaddedHexString } = require("../../src/Helpers.js");
const { findBidIndexReference, calculateCumulativeWeights } = require("../src/BidRaffleTestHelpers.js");
const { parseFuzzSeedFromEnvironment } = require("../src/fuzz/FuzzSeed.js");

describe("BidRaffleWeightHelpers", function () {
	let harness_;
	let nextArrayId_ = 0n;

	before(async function () {
		const harnessFactory_ = await hre.ethers.getContractFactory("BidRaffleWeightHelpersTestHarness");
		harness_ = await harnessFactory_.deploy();
		await harness_.waitForDeployment();
	});

	async function populateAndVerifyArray_(weights_) {
		const arrayId_ = nextArrayId_ ++;
		await (await harness_.appendWeights(arrayId_, weights_)).wait();
		const cumulativeWeights_ = calculateCumulativeWeights(weights_);
		expect(await harness_.getNumBids(arrayId_)).equal(BigInt(weights_.length));
		for ( let bidIndex_ = 0; bidIndex_ < weights_.length; ++ bidIndex_ ) {
			expect(await harness_.getCumulativeWeightAt(arrayId_, bidIndex_), `cumulative sum at ${bidIndex_}`)
				.equal(cumulativeWeights_[bidIndex_]);
		}
		expect(await harness_.getTotalWeight(arrayId_)).equal(cumulativeWeights_.at(-1) ?? 0n);
		return { arrayId_, cumulativeWeights_ };
	}

	async function verifySelections_(arrayId_, cumulativeWeights_, targetCumulativeWeights_) {
		const bidIndexes_ = await harness_.findBidIndexMany(arrayId_, targetCumulativeWeights_);
		for ( let weightIndex_ = 0; weightIndex_ < targetCumulativeWeights_.length; ++ weightIndex_ ) {
			expect(bidIndexes_[weightIndex_], `owner of weight unit ${targetCumulativeWeights_[weightIndex_]}`)
				.equal(findBidIndexReference(cumulativeWeights_, targetCumulativeWeights_[weightIndex_]));
		}
	}

	it("maintains cumulative sums and the total weight", async function () {
		await populateAndVerifyArray_([3n, 2n, 7n,]);
		await populateAndVerifyArray_([1n,]);
		expect(await harness_.getTotalWeight(999_999_999n)).equal(0n);
	});

	it("selects each weight unit in proportion to the bids", async function () {
		const weightArrays_ = [
			[1n,],
			[1n, 1n, 1n,],
			[3n, 2n, 7n,],
			[2n, 3n, 4n,],
			[2n, 1n, 4n, 3n,],
			[5n, 1n,],
			[1n, 2n, 3n, 4n, 5n,],
			[10n, 1n, 10n, 2n, 10n,],
			[7n, 11n, 3n, 1n, 23n, 5n,],
		];
		for (const weights_ of weightArrays_) {
			const { arrayId_, cumulativeWeights_ } = await populateAndVerifyArray_(weights_);
			const totalWeight_ = cumulativeWeights_.at(-1);
			const allTargetCumulativeWeights_ = Array.from({length: Number(totalWeight_),}, (ignored_, value_) => BigInt(value_));
			const bidIndexes_ = await harness_.findBidIndexMany(arrayId_, allTargetCumulativeWeights_);
			const selectionCounts_ = new Array(weights_.length).fill(0n);
			for ( let value_ = 0; value_ < allTargetCumulativeWeights_.length; ++ value_ ) {
				expect(bidIndexes_[value_]).equal(findBidIndexReference(cumulativeWeights_, BigInt(value_)));
				++ selectionCounts_[Number(bidIndexes_[value_])];
			}
			expect(selectionCounts_).deep.equal(weights_);
		}
	});

	it("selects the correct bids at cumulative-weight boundaries", async function () {
		const { arrayId_ } = await populateAndVerifyArray_([3n, 2n, 7n, 5n,]);
		expect(await harness_.findBidIndex(arrayId_, 0n)).equal(0n);
		expect(await harness_.findBidIndex(arrayId_, 2n)).equal(0n);
		expect(await harness_.findBidIndex(arrayId_, 3n)).equal(1n);
		expect(await harness_.findBidIndex(arrayId_, 4n)).equal(1n);
		expect(await harness_.findBidIndex(arrayId_, 5n)).equal(2n);
		expect(await harness_.findBidIndex(arrayId_, 11n)).equal(2n);
		expect(await harness_.findBidIndex(arrayId_, 12n)).equal(3n);
		expect(await harness_.findBidIndex(arrayId_, 16n)).equal(3n);
	});

	it("handles realistically huge weights", async function () {
		const bigWeight1_ = 123_456_789n * 10n ** 18n;
		const bigWeight2_ = 10n ** 30n;
		const { arrayId_, cumulativeWeights_ } = await populateAndVerifyArray_([bigWeight1_, 1n, bigWeight2_,]);
		await verifySelections_(arrayId_, cumulativeWeights_, [
			0n,
			bigWeight1_ - 1n,
			bigWeight1_,
			bigWeight1_ + 1n,
			cumulativeWeights_.at(-1) - 1n,
		]);
	});

	it("matches a linear scan for random weight arrays", async function () {
		// Issue. I replaced `0x9d1a35c5a45c2f11ba07899fa25ce2a557eeff29e6c273e0b25ce33cd24b6f95n`
		// with a call to `generateRandomUInt256`. Why was that magic number hardcoded?
		const seed_ = parseFuzzSeedFromEnvironment(process.env["FUZZ_SEED"]) ?? generateRandomUInt256();

		console.info("%s", `Random seed: ${uint256ToPaddedHexString(seed_)}`);
		const randomNumberSeedWrapper_ = {value: seed_,};
		const random_ = () => generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
		for ( let arrayCounter_ = 0; arrayCounter_ < 150; ++ arrayCounter_ ) {
			const numBids_ = Number(random_() % 50n) + 1;
			const weights_ = [];
			for ( let bidIndex_ = 0; bidIndex_ < numBids_; ++ bidIndex_ ) {
				const weightKind_ = random_() % 10n;
				const weight_ =
					(weightKind_ < 3n) ? 1n :
					(weightKind_ < 7n) ? random_() % 1_000n + 1n :
					random_() % (10n ** 30n) + 1n;
				weights_.push(weight_);
			}

			const { arrayId_, cumulativeWeights_ } = await populateAndVerifyArray_(weights_);
			const totalWeight_ = cumulativeWeights_.at(-1);
			const targetCumulativeWeights_ = [0n, totalWeight_ - 1n,];
			for (const cumulativeWeight_ of cumulativeWeights_) {
				if (cumulativeWeight_ < totalWeight_) targetCumulativeWeights_.push(cumulativeWeight_);
				if (cumulativeWeight_ > 0n) targetCumulativeWeights_.push(cumulativeWeight_ - 1n);
			}
			for ( let counter_ = 0; counter_ < 30; ++ counter_ ) {
				targetCumulativeWeights_.push(random_() % totalWeight_);
			}
			await verifySelections_(arrayId_, cumulativeWeights_, targetCumulativeWeights_);
		}
	});
});
