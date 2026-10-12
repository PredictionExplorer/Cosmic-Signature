"use strict";

// Helpers for randomized tests outside the fuzz harness: a seeded random source whose printed seed reproduces a run,
// and iteration scaling by test mode. `test/src/fuzz/` has its own engine with the same seed convention.

const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper } = require("../../src/Helpers.js");
const { LONG_TEST_MODE_CODE } = require("../../src/ContractTestingHelpers.js");
const { parseFuzzSeedFromEnvironment } = require("./fuzz/FuzzSeed.js");

/**
A seeded pseudo-random source. The stream is the keccak chain that `generateRandomUInt256FromSeedWrapper` implements,
so a printed seed reproduces every decision a test makes.
*/
class SeededRandomSource {
	/** @param {bigint} seed_ */
	constructor(seed_) {
		this.seed = seed_;
		this.seedWrapper = { value: seed_, };
	}

	/** @returns {bigint} A uniformly random `uint256`. */
	nextUint256() {
		return generateRandomUInt256FromSeedWrapper(this.seedWrapper);
	}

	/**
	@param {bigint} bound_ Must be positive.
	@returns {bigint} A random bigint in `[0, bound_)`. The modulo bias is negligible for any bound far below `2 ** 256`.
	*/
	nextBigIntBelow(bound_) {
		// A plain check: this runs in hot loops, where a chai bigint comparison would cost more than the draw itself.
		if ( ! (bound_ > 0n) ) {
			throw new Error(`nextBigIntBelow: the bound must be positive, got ${bound_}.`);
		}
		return this.nextUint256() % bound_;
	}

	/**
	@param {bigint} min_
	@param {bigint} max_ Must be at least `min_`.
	@returns {bigint} A random bigint in `[min_, max_]`.
	*/
	nextBigIntInRange(min_, max_) {
		return min_ + this.nextBigIntBelow(max_ - min_ + 1n);
	}

	/**
	@param {number} min_
	@param {number} max_ Must be at least `min_`.
	@returns {number} A random integer in `[min_, max_]`.
	*/
	nextIntInRange(min_, max_) {
		return min_ + Number(this.nextBigIntBelow(BigInt(max_ - min_ + 1)));
	}

	/** @template T @param {T[]} items_ Must be nonempty. @returns {T} */
	pick(items_) {
		if (items_.length <= 0) {
			throw new Error("pick: the array must be nonempty.");
		}
		return items_[this.nextIntInRange(0, items_.length - 1)];
	}

	/** @param {number} percent_ @returns {boolean} `true` with probability `percent_ / 100`. */
	chancePercent(percent_) {
		return this.nextIntInRange(0, 99) < percent_;
	}

	/** Shuffles `items_` in place (Fisher-Yates) and returns it. @template T @param {T[]} items_ @returns {T[]} */
	shuffle(items_) {
		for (let index1_ = items_.length - 1; index1_ > 0; -- index1_) {
			const index2_ = this.nextIntInRange(0, index1_);
			[items_[index1_], items_[index2_]] = [items_[index2_], items_[index1_]];
		}
		return items_;
	}
}

/** @type {bigint | undefined} */
let processFuzzSeed_ = undefined;

/**
Creates the random source of one test and prints its seed. All the tests of one process share one seed:
`FUZZ_SEED` if it is set, otherwise a fresh random one. Each test consumes its own stream from that seed deterministically,
so the one printed value reproduces every test in the file. Like `test/tests-src/FuzzTest.js`, this assumes the same
build flags on reproduction.
@param {string} testDescription_
*/
function createSeededRandomSourceForTest(testDescription_) {
	processFuzzSeed_ ??= parseFuzzSeedFromEnvironment(process.env.FUZZ_SEED) ?? generateRandomUInt256();
	console.info("%s", `${testDescription_}: FUZZ_SEED=0x${processFuzzSeed_.toString(16)}`);
	return new SeededRandomSource(processFuzzSeed_);
}

/** Scales an iteration count with the test mode (Comment-202606305): quick, medium, full. */
function scaleWithTestMode(quick_, medium_, full_) {
	return [quick_, medium_, full_][LONG_TEST_MODE_CODE - 1];
}

module.exports = {
	SeededRandomSource,
	createSeededRandomSourceForTest,
	scaleWithTestMode,
};
