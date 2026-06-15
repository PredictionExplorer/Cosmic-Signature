"use strict";

/**
Pure bigint math helpers mirroring on-chain arithmetic exactly.
All division is truncating (like Solidity `uint256` division for non-negative operands).
*/

/**
Floor integer square root, matching OpenZeppelin `Math.sqrt` exactly.
@param {bigint} value_
@returns {bigint}
*/
function sqrtFloor(value_) {
	if (value_ < 0n) {
		throw new Error("sqrtFloor of negative value");
	}
	if (value_ < 2n) {
		return value_;
	}
	// Newton's method with a good initial estimate.
	let x0_ = value_;
	let x1_ = (value_ >> 1n) + 1n;
	while (x1_ < x0_) {
		x0_ = x1_;
		x1_ = (value_ / x1_ + x1_) >> 1n;
	}
	return x0_;
}

/**
Solidity-style `Math.max`.
@param {bigint} a_
@param {bigint} b_
*/
function maxBigInt(a_, b_) {
	return (a_ >= b_) ? a_ : b_;
}

/**
@param {bigint} a_
@param {bigint} b_
*/
function minBigInt(a_, b_) {
	return (a_ <= b_) ? a_ : b_;
}

/**
Interprets a uint256 value as int256 (two's complement), like Solidity `int256(uint256Value)`.
@param {bigint} value_
*/
function uint256ToInt256(value_) {
	return BigInt.asIntN(256, value_);
}

/**
Interprets an int256 value as uint256, like Solidity `uint256(int256Value)`.
@param {bigint} value_
*/
function int256ToUint256(value_) {
	return BigInt.asUintN(256, value_);
}

/**
Converts a value to uint256, failing if the conversion would wrap unless the caller explicitly
documents that wraparound as an accepted path.
@param {bigint} value_
@param {string} [label_]
@param {boolean} [allowWrap_]
*/
function u256(value_, label_ = "uint256 arithmetic", allowWrap_ = false) {
	const wrapped_ = BigInt.asUintN(256, value_);
	if ( ! allowWrap_ && wrapped_ !== value_ ) {
		throw new Error(`${label_} unexpectedly wrapped uint256 arithmetic: ${value_}`);
	}
	return wrapped_;
}

module.exports = {
	sqrtFloor,
	maxBigInt,
	minBigInt,
	uint256ToInt256,
	int256ToUint256,
	u256,
};
