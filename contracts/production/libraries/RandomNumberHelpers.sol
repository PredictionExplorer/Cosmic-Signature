// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/// @dev
/// [Comment-202412104]
/// A random number generation prototype is located at
/// https://github.com/PredictionExplorer/cosmic-signature-logic-prototyping/blob/main/contracts/RandomNumberGenerator.sol
/// [/Comment-202412104]
library RandomNumberHelpers {
	struct RandomNumberSeedWrapper {
		/// @dev
		/// [Comment-202502075]
		/// This is a random number seed.
		/// We generate a random number by incrementing its seed and calculating a hash sum of the result.
		/// It's important that calculations involving this variable ignored overflows.
		/// That includes cases when we pass it to a method by value and then the method makes calculations involving the passed value.
		/// todo-1 Make sure the above is the case.
		/// [/Comment-202502075]
		/// [Comment-202502077]
		/// Optimization idea.
		/// Use the initially generated random number seed as a random number.
		/// Then, without incrementing it, calculate its hash sum, assign the result to itself, and use it as a random number.
		/// Only then start incrementing random number seed.
		/// [/Comment-202502077]
		uint256 value;
	}

	/// @dev Comment-202502075 applies to the return value.
	/// Comment-202502077 applies to the return value.
	function generateRandomNumberSeed() internal view returns(uint256) {
		return block.prevrandao ^ block.basefee;
	}

	/// @dev
	/// todo-1 Test that `seedWrapper_` changes after this call.
	function generateRandomNumber(RandomNumberSeedWrapper memory seedWrapper_) internal pure returns(uint256) {
		unchecked { ++ seedWrapper_.value; }
		return generateRandomNumber(seedWrapper_.value);
	}

	function generateRandomNumber(uint256 seed_) internal pure returns(uint256) {
		return calculateHashSumOf(seed_);
	}

	function calculateHashSumOf(uint256 value_) internal pure returns(uint256) {
		// A possibly more efficient conversion to `bytes`: https://stackoverflow.com/questions/49231267/how-to-convert-uint256-to-bytes-and-bytes-convert-to-uint256
		// But ChatGPT is saying that it's a bit less gas efficient than `abi.encodePacked`.
		// Indeed, `abi.encodePacked` returns data that 32 bytes long, so it's probably as efficient as it can be.
		return uint256(keccak256(abi.encodePacked(value_)));
	}
}
