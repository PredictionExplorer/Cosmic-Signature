// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.33;

/// @title Cosmic Signature Helpers.
/// @author The Cosmic Signature Development Team.
/// @notice Provides common utility functions for the Cosmic Signature protocol.
library CosmicSignatureHelpers {
	// #region `transferEthTo`

	/// @notice Transfers ETH to a specified address, reverting with callee's error data on failure.
	/// @param toAddress_ The recipient address.
	/// @param amount_ The amount of ETH to transfer. Can be zero.
	/// @dev Uses low-level call for ETH transfer and propagates any revert data from the callee.
	/// This is more informative than a generic error message.
	/// Note: In some places where we transfer ETH by calling `address.call`,
	/// it could make sense to call this method instead.
	/// But there are no immediate plans to refactor anything.
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
			// Propagate the callee's revert data.
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
