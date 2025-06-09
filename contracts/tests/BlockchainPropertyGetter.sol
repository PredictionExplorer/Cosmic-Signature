// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

contract BlockchainPropertyGetter {
	// function getBlockNumber() external view returns (uint256) {
	// 	return block.number;
	// }

	// function getBlockTimeStamp() external view returns (uint256) {
	// 	return block.timestamp;
	// }

	/// @dev
	/// [Comment-202505293]
	/// Issue. This is a workaround for Comment-202504071.
	/// [/Comment-202505293]
	function getBlockPrevRandao() external view returns (uint256) {
		// #enable_asserts assert(block.prevrandao >= 2);
		return block.prevrandao;
	}

	// function getBlockBaseFeePerGas() external view returns (uint256) {
	// 	// Comment-202505294 relates.
	// 	// #enable_asserts assert(block.basefee > 0);
	//
	// 	return block.basefee;
	// }
}
