// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Calculates the V2 per-bid CST reward.
library CstRewardCalculator {
	uint256 internal constant DEFAULT_FORMULA_PRODUCT = 3 * (1 ether) * (1 ether);

	function computeRadicand(uint256 elapsedDurationInSeconds_, uint256 formulaProduct_) internal pure returns (uint256) {
		uint256 radicand_ = elapsedDurationInSeconds_ * formulaProduct_;
		// #enable_asserts assert(elapsedDurationInSeconds_ == 0 || formulaProduct_ == 0 || radicand_ >= formulaProduct_);
		// #enable_asserts assert(formulaProduct_ == 0 || radicand_ / formulaProduct_ == elapsedDurationInSeconds_);
		return radicand_;
	}

	function compute(uint256 elapsedDurationInSeconds_, uint256 formulaProduct_) internal pure returns (uint256) {
		uint256 radicand_ = computeRadicand(elapsedDurationInSeconds_, formulaProduct_);
		uint256 bidCstRewardAmount_ = Math.sqrt(radicand_);

		// #enable_asserts // #disable_smtchecker assert((elapsedDurationInSeconds_ == 0 || formulaProduct_ == 0) == (bidCstRewardAmount_ == 0));
		// #enable_asserts // #disable_smtchecker assert(bidCstRewardAmount_ * bidCstRewardAmount_ <= radicand_);
		// #enable_asserts // #disable_smtchecker if (bidCstRewardAmount_ < type(uint128).max) {
		// #enable_asserts // #disable_smtchecker 	uint256 nextBidCstRewardAmount_ = bidCstRewardAmount_ + 1;
		// #enable_asserts // #disable_smtchecker 	assert(nextBidCstRewardAmount_ * nextBidCstRewardAmount_ > radicand_);
		// #enable_asserts // #disable_smtchecker }

		return bidCstRewardAmount_;
	}
}
