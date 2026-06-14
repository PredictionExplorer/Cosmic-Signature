"use strict";

/**
Parses a `FUZZ_SEED` environment value into a uint256 bigint, or returns `undefined`
to signal that a fresh random seed should be generated.
@param {string | undefined} raw_
@returns {bigint | undefined}
*/
function parseFuzzSeedFromEnvironment(raw_) {
	if (raw_ === undefined || raw_.length <= 0) {
		return undefined;
	}
	// todo-ai-1 It's often better to avoid complicating the logic, even if as a result the behavior will not be as good as it could be.
	// todo-ai-1 Remember that the code must be simple enough for a human to wrap their head around.
	// todo-ai-1 In this case, the checking that the value begins with "0x" or "0X" seems unnecessary.
	// todo-ai-1 You could simply document that it's required to be that way.
	// todo-ai-1 Furthermore, the user might want to provide a decimal number, like the number of milliseconds since the epoch
	// todo-ai-1 returned by a command.
	const normalized_ = (raw_.startsWith("0x") || raw_.startsWith("0X")) ? raw_ : `0x${raw_}`;
	return BigInt.asUintN(256, BigInt(normalized_));
}

module.exports = {
	parseFuzzSeedFromEnvironment,
};
