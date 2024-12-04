// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

library CosmicSignatureHelpers {
	/// @dev
	/// [Comment-202412104]
	/// A random number generation prototype is located at
	/// https://github.com/PredictionExplorer/cosmic-signature-logic-prototyping/blob/main/contracts/RandomNumberGenerator.sol
	/// [/Comment-202412104]
	/// todo-1 Does this belong to `CosmicSignatureConstants`?
	struct RandomNumberSeed {
		uint256 value;
	}

	/// @dev Comment-202412104 applies.
	function generateInitialRandomNumberSeed() internal view returns(RandomNumberSeed memory) {
		return RandomNumberSeed(generateInitialRandomNumber());
	}

	/// @dev Comment-202412104 applies.
	function generateInitialRandomNumber() internal view returns(uint256) {
		return block.prevrandao ^ block.basefee;
	}

	/// @dev Comment-202412104 applies.
	function generateRandomNumber(RandomNumberSeed memory seed_) internal pure returns(uint256) {
		unchecked {
			return calculateHashSumOf( ++ seed_.value );
		}
	}

	/// @dev Comment-202412104 applies.
	function calculateHashSumOf(uint256 value_) internal pure returns(uint256) {
		return uint256(keccak256(abi.encodePacked(value_)));
	}
}
