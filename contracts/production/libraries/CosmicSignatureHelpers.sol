// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

library CosmicSignatureHelpers {
	/// @dev
	/// [Comment-202412104]
	/// A random number generation prototype is located at
	/// https://github.com/PredictionExplorer/cosmic-signature-logic-prototyping/blob/main/contracts/RandomNumberGenerator.sol
	/// [/Comment-202412104]
	/// todo-1 ??? Does this belong to `CosmicSignatureConstants`?
	struct RandomNumberSeedWrapper {
		/// @dev It's important that calculations involving this variable ignored overflows.
		/// That includes cases when we pass it to a method by value and then the method makes calculations involving the passed value.
		/// todo-1 Make sure the above is the case.
		uint256 value;
	}

	/// @dev Comment-202412104 applies.
	function generateRandomNumberSeed() internal view returns(uint256) {
		return block.prevrandao ^ block.basefee;
	}

	/// @dev Comment-202412104 applies.
	/// todo-1 Test that `seedWrapper_` changes after this call.
	function generateRandomNumber(RandomNumberSeedWrapper memory seedWrapper_) internal pure returns(uint256) {
		unchecked { ++ seedWrapper_.value; }
		return generateRandomNumber(seedWrapper_.value);
	}

	/// @dev Comment-202412104 applies.
	function generateRandomNumber(uint256 seed_) internal pure returns(uint256) {
		return calculateHashSumOf(seed_);
	}

	/// @dev Comment-202412104 applies.
	function calculateHashSumOf(uint256 value_) internal pure returns(uint256) {
		// A possibly more efficient conversion to `bytes`: https://stackoverflow.com/questions/49231267/how-to-convert-uint256-to-bytes-and-bytes-convert-to-uint256
		// But ChatGPT is saying that it's a bit less gas efficient than `abi.encodePacked`.
		// Indeed, `abi.encodePacked` returns data that 32 bytes long, so it's probably as efficient as it can be.
		return uint256(keccak256(abi.encodePacked(value_)));
	}
}
