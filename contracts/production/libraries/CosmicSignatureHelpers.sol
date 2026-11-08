// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

library CosmicSignatureHelpers {
	// #region // `max`

	// function max(int256 value1_, int256 value2_) internal pure returns (int256) {
	// 	return (value1_ > value2_) ? value1_ : value2_;
	// }

	// #endregion
	// #region `tryIncreaseValueExponentially`

	/// @notice
	/// [Comment-202606059]
	/// Given a variable `var` and a divisor `div > 0`. Both are treated as unsigned integers.
	/// `var` increase formula: `var += var / div`
	/// `var` reduction formula: `var -= var / (div + 1)`
	/// If `var < div`, the increase formula does not change `var`.
	/// If `var <= div`, the reduction formula does not change `var`.
	/// The formulas can overflow.
	/// Further discussion assumes that `div` stays the same, each update changes `var`, and no overflow occurs.
	/// Starting from any value, 1 or more increases followed by the same number of reductions restore the original value.
	/// But for reductions followed by increases, restoration is guaranteed for every such count only for "good" starting values:
	/// `div` and all values obtained by repeatedly increasing it.
	/// Once a "good" value is reached, further updates stay in this sequence and are reversible.
	/// Repeated reductions from a non-"good" value eventually reach a "good" one,
	/// but increases cannot turn a non-"good" value into a "good" one.
	/// For example, with `div == 100`, 5252 needs 355 reductions to first reach a "good" value, 200.
	/// [/Comment-202606059]
	function tryIncreaseValueExponentially(uint256 var_, uint256 div_) internal pure returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return var_ + var_ / div_;
		}
	}

	// #endregion
	// #region `tryReduceValueExponentially`

	/// @notice Comment-202606059 applies.
	function tryReduceValueExponentially(uint256 var_, uint256 div_) internal pure returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return var_ - var_ / (div_ + 1);
		}
	}

	// #endregion
	// #region `transferEthTo`

	/// @dev Comment-202609144 relates.
	function transferEthTo(address payable toAddress_, uint256 amount_) internal {
		// [Comment-202502043]
		// In most cases, we make high level calls to strongly typed addresses --
		// to let SMTChecker know what exactly method on what contract we are calling.
		// But we make a low level call like this to make a simple ETH transfer.
		// Comment-202502057 relates.
		// Comment-202506296 relates.
		// [/Comment-202502043]
		(bool isSuccess_, ) = toAddress_.call{value: amount_}("");

		if ( ! isSuccess_ ) {
			assembly ("memory-safe") {
				let returnDataSize_ := returndatasize()
				let freeMemoryPointer_ := mload(0x40)
				returndatacopy(freeMemoryPointer_, 0, returnDataSize_)
				revert (freeMemoryPointer_, returnDataSize_)
			}
		}
	}

	// #endregion
}

// #endregion
