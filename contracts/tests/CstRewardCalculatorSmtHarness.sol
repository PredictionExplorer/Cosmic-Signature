// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { CstRewardCalculator } from "../production/libraries/CstRewardCalculator.sol";

/// @dev Test-only SMTChecker harness for the V2 CST reward formula.
contract CstRewardCalculatorSmtHarness {
	function computeRadicand(uint256 elapsedSeconds_) external pure returns (uint256) {
		require(elapsedSeconds_ <= type(uint256).max / 3 / 1e36);
		return CstRewardCalculator.computeRadicand(elapsedSeconds_);
	}

	function proveZeroRadicand() external pure {
		uint256 radicand_ = CstRewardCalculator.computeRadicand(0);
		assert(radicand_ == 0);
	}

	function proveRadicandRoundTrip(uint256 elapsedSeconds_) external pure {
		require(elapsedSeconds_ <= type(uint256).max / 3 / 1e36);
		uint256 radicand_ = CstRewardCalculator.computeRadicand(elapsedSeconds_);
		assert(radicand_ / 1e36 / 3 == elapsedSeconds_);
	}

	function proveRadicandIsMonotonic(uint256 elapsedSeconds1_, uint256 elapsedSeconds2_) external pure {
		require(elapsedSeconds1_ <= elapsedSeconds2_);
		require(elapsedSeconds2_ <= type(uint256).max / 3 / 1e36);
		uint256 radicand1_ = CstRewardCalculator.computeRadicand(elapsedSeconds1_);
		uint256 radicand2_ = CstRewardCalculator.computeRadicand(elapsedSeconds2_);
		assert(radicand1_ <= radicand2_);
	}
}
