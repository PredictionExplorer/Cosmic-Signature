// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

/// todo-1 Use this to generate entropy.
/// todo-1 But see my random number generation prototype.
/// todo-1 Comment and cross-ref a link to the prototype.
library CosmicSignatureHelpers {
	function generateInitialRandomNumber() internal view returns(uint256) {
		return block.prevrandao ^ block.timestamp;
	}

	function calculateHashSumOf(uint256 value_) internal pure returns(uint256) {
		return uint256(keccak256(abi.encodePacked(value_)));
	}
}
