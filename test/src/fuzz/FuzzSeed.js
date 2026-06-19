"use strict";

/**
Parses a `FUZZ_SEED` environment value into a uint256 bigint, or returns `undefined`
to signal that a fresh random seed should be generated.
Accepted forms are `0x`-prefixed hex or bare hex; bare values are interpreted as hex for
compatibility with previously printed reproduction seeds.
@param {string | undefined} raw_
@returns {bigint | undefined}
*/
function parseFuzzSeedFromEnvironment(raw_) {
	if (raw_ === undefined || raw_.length <= 0) {
		return undefined;
	}
	const normalized_ = (raw_.startsWith("0x") || raw_.startsWith("0X")) ? raw_ : `0x${raw_}`;
	return BigInt.asUintN(256, BigInt(normalized_));
}

module.exports = {
	parseFuzzSeedFromEnvironment,
};
