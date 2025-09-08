// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

library CosmicSignatureHelpers {
	// #region // Data Types

	// todo-1 Can I delete this?
	// /// @dev It appears that this was a bad idea.
	// /// It's probably more efficient to use `uint256` and avoid using `bool`.
	// struct BooleanWithPadding {
	// 	bool value;
	// 	uint248 padding;
	// }

	// #endregion
	// #region `transferEthTo`

	/// @dev Issue. In some places where we transfer ETH by calling `address.call`,
	/// it could make sense to call this method instead.
	/// But I have no immediate plans to refactorr anything.
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
