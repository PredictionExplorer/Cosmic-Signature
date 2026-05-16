"use strict";

const DEFAULT_BID_CST_REWARD_FORMULA_PRODUCT = 3n * 10n ** 36n;

function sqrtBigInt(value_) {
	if (value_ < 0n) {
		throw new Error("Cannot calculate the square root of a negative bigint.");
	}
	if (value_ < 2n) {
		return value_;
	}
	let x0_ = value_;
	let x1_ = (value_ >> 1n) + 1n;
	while (x1_ < x0_) {
		x0_ = x1_;
		x1_ = (x1_ + value_ / x1_) >> 1n;
	}
	return x0_;
}

function computeBidCstRewardAmount(elapsedDurationInSeconds_, formulaProduct_ = DEFAULT_BID_CST_REWARD_FORMULA_PRODUCT) {
	if (typeof elapsedDurationInSeconds_ !== "bigint") {
		throw new TypeError("elapsedDurationInSeconds_ must be a bigint.");
	}
	if (typeof formulaProduct_ !== "bigint") {
		throw new TypeError("formulaProduct_ must be a bigint.");
	}
	return sqrtBigInt(elapsedDurationInSeconds_ * formulaProduct_);
}

module.exports = {
	DEFAULT_BID_CST_REWARD_FORMULA_PRODUCT,
	computeBidCstRewardAmount,
	sqrtBigInt,
};
