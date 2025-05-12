// #region

"use strict";

// #endregion
// #region

const { generateRandomUInt256FromSeedWrapper } = require("./Helpers.js");

// #endregion
// #region

/**
 * Creates a weighted random number generator for selecting numbers in the range 0 through n - 1.
 * The probability to generate a number that was generated fewer times than the others is higher.
 * That's why this generator is named "Fair".
 *
 * The generator maintains a count of each candidate picks and assigns the candidate a weight according to:
 *
 *    weight(i) = max(counts) - counts[i] + k
 *
 * Because of that, the ratio of weights:
 *
 *    weight(i) / weight(j)
 *
 * between candidates depends only on the difference between their counts.
 * For example, if candidate A is behind candidate B by the same count (say, 1 vs. 3 or 11 vs. 13),
 * candidate A's weight is higher, and the ratio is the same.
 *
 * @param {number} n_ The total number of candidates. Explained above.
 * It's a positive and not too big integer value without a fractional part.
 * @param {number} k_ The constant explained above.
 * It's a positive and not too big integer value without a fractional part.
 * @param {object} randomNumberSeedWrapper_
 * @returns {object} An object with methods:
 *    `getNext`: Generates and returns a "fair" random number.
 */
function createFairRandomNumberGenerator(n_, k_, randomNumberSeedWrapper_) {
	// #region Data

	/// Each candidate's pick count.
	const _counts = Array(n_).fill(0);

	/// The sum of counts.
	let _totalCount = 0;

	// #endregion
	// #region Constructor

	{
		return {getNext,};
	}

	// #endregion
	// #region `getNext`
	
	function getNext() {
		// The maximum count across all candidates.
		const maxCount_ = Math.max(..._counts);

		// The sum of weights of all candidates.
		const totalWeight_ = (maxCount_ + k_) * n_ - _totalCount;

		const bigRandomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
		let target_ = Number(bigRandomNumber_ % BigInt(totalWeight_));
		let pickedNumber_ = n_;

		// Iterating through candidates to determine which one falls into the selected weighted slot.
		{
			do {
				-- pickedNumber_;
				const weight_ = maxCount_ - _counts[pickedNumber_] + k_;
				target_ -= weight_;
			}
		
			// This condition is sufficient to ensure that `pickedNumber_` doesn't become negative.
			// Note that rounding errors aren't possible here, provided all involved numbers are fractionless, are not too big.
			// They can become too big if we run this code for a year. Assuming we aren't going to.
			while (target_ >= 0);
		}

		++ _counts[pickedNumber_];
		++ _totalCount;
		return pickedNumber_;
	}

	// #endregion
}

// #endregion
// #region

module.exports = {
	createFairRandomNumberGenerator,
};

// #endregion
