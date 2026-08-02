// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

library CosmicSignatureHelpers {
	// #region // `max`

	// function max(int256 value1_, int256 value2_) internal pure returns (int256) {
	// 	return (value1_ >= value2_) ? value1_ : value2_;
	// }

	// #endregion
	// #region `tryIncreaseValueExponentially`

	/// @notice
	/// [Comment-202606059]
	/// Given a variable `var` and a divisor `div`. Both are treated as unsigned integers.
	/// Assuming `div > 0 && var >= div`.
	/// `var` increase formula: `var += var / div`
	/// `var` reduction formula: `var = (var + 1) * div / (div + 1)`
	/// The formulas are lossless, meaning an increases + a reduction or a reduction + an increase will produce the original value.
	/// The reduction formula can reach the minimum of `var == div`.
	/// If `var <= div`, the reduction formula will not change `var`.
	/// If `var < div`, the increase formula will not change `var`.
	/// In other words, the losslessness breaks at that point.
	/// Obviously, the formulas can overflow. The reduction formula is more susceptible to overflow.
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
			return (var_ + 1) * div_ / (div_ + 1);
		}
	}

	// #endregion
	// #region `transferEthTo`

	/// @dev Issue. In some places where we transfer ETH by calling `address.call`,
	/// it could make sense to call this method instead.
	/// But I have no immediate plans to refactor anything.
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
			assembly {
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
