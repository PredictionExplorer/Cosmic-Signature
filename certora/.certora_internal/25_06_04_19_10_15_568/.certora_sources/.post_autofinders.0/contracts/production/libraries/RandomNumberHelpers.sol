// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { CryptographyHelpers } from "./CryptographyHelpers.sol";

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
		/// todo-1 +++ Make sure the above is the case.
		/// [/Comment-202502075]
		/// [Comment-202502077]
		/// Optimization idea.
		/// Use the initially generated random number seed as a random number.
		/// Then, without incrementing it, calculate its hash sum, assign the result to itself, and use it as a random number.
		/// Only then start incrementing random number seed.
		/// [/Comment-202502077]
		uint256 value;
	}

	/// @notice
	/// [Comment-202504067]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504067]
	/// @dev Comment-202502075 applies to the return value.
	/// Comment-202502077 applies to the return value.
	/// [Comment-202503254]
	/// It's safe to call this function without any additional logic only if it's guaranteed
	/// that we can call it no more than once per block.
	/// It's because all calls witin a particular block would return the same value.
	/// [/Comment-202503254]
	function generateRandomNumberSeed() internal view returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b90000, 1037618708921) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b90001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b90004, 0) }
		// #enable_asserts assert(block.prevrandao > 0);
		// #enable_asserts assert(block.basefee > 0);
		return block.prevrandao ^ block.basefee;
	}

	/// @notice
	/// [Comment-202504065]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504065]
	/// @dev todo-1 +++ Test that `seedWrapper_.value` changes after this call.
	function generateRandomNumber(RandomNumberSeedWrapper memory seedWrapper_) internal pure returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ba0000, 1037618708922) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ba0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ba0005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01ba6000, seedWrapper_) }
		unchecked { ++ seedWrapper_.value; }
		return generateRandomNumber(seedWrapper_.value);
	}

	/// @notice
	/// [Comment-202504063]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504063]
	function generateRandomNumber(uint256 seed_) internal pure returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01bb0000, 1037618708923) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01bb0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01bb0005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01bb6000, seed_) }
		return CryptographyHelpers.calculateHashSumOf(seed_);
	}
}
