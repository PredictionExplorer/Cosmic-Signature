// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Calculates the V2 per-bid CST reward.
library CstRewardCalculator {
	uint256 internal constant FORMULA_MULTIPLIER = 3;
	uint256 internal constant CST_SCALE_SQUARED = 1e36;
	uint256 internal constant MAX_SAFE_ELAPSED_SECONDS = type(uint256).max / FORMULA_MULTIPLIER / CST_SCALE_SQUARED;

	error CstRewardElapsedDurationTooLong(uint256 elapsedSeconds);

	function computeRadicand(uint256 elapsedSeconds_) internal pure returns (uint256) {
		if (elapsedSeconds_ > type(uint256).max / 3 / 1e36) {
			revert CstRewardElapsedDurationTooLong(elapsedSeconds_);
		}

		// #enable_asserts assert(elapsedSeconds_ <= type(uint256).max / 3 / 1e36);
		uint256 radicand_ = 3 * elapsedSeconds_ * 1e36;
		// #enable_asserts assert(elapsedSeconds_ == 0 || radicand_ >= 1e36);
		// #enable_asserts assert(radicand_ / 1e36 / 3 == elapsedSeconds_);
		return radicand_;
	}

	function compute(uint256 elapsedSeconds_) internal pure returns (uint256) {
		uint256 radicand_ = computeRadicand(elapsedSeconds_);
		uint256 cstBidRewardAmount_ = Math.sqrt(radicand_);

		// #enable_asserts // #disable_smtchecker assert((elapsedSeconds_ == 0) == (cstBidRewardAmount_ == 0));
		// #enable_asserts // #disable_smtchecker assert(cstBidRewardAmount_ * cstBidRewardAmount_ <= radicand_);
		// #enable_asserts // #disable_smtchecker if (cstBidRewardAmount_ < type(uint128).max) {
		// #enable_asserts // #disable_smtchecker 	uint256 nextCstBidRewardAmount_ = cstBidRewardAmount_ + 1;
		// #enable_asserts // #disable_smtchecker 	assert(nextCstBidRewardAmount_ * nextCstBidRewardAmount_ > radicand_);
		// #enable_asserts // #disable_smtchecker }

		return cstBidRewardAmount_;
	}
}
