// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

library CosmicSignatureHelpers {
	/// @dev
	/// [Comment-202412104]
	/// A random number generation prototype is available at
	/// https://github.com/PredictionExplorer/cosmic-signature-logic-prototyping/blob/main/contracts/RandomNumberGenerator.sol
	/// [/Comment-202412104]
	function generateInitialRandomNumber() internal view returns(uint256) {
		return block.prevrandao ^ block.basefee;
	}

	/// @dev Comment-202412104 applies.
	function calculateHashSumOf(uint256 value_) internal pure returns(uint256) {
		return uint256(keccak256(abi.encodePacked(value_)));
	}
}
