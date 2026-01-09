// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

/// @title Cryptography Helpers.
/// @author The Cosmic Signature Development Team.
/// @notice Provides gas-optimized cryptographic utility functions.
library CryptographyHelpers {
	/// @notice Calculates the Keccak-256 hash of a uint256 value.
	/// @param value_ The value to hash.
	/// @return hashSum_ The 256-bit hash of the input value.
	/// @dev Uses inline assembly for gas efficiency.
	/// [Comment-202504061]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504061]
	function calculateHashSumOf(uint256 value_) internal pure returns (uint256 hashSum_) {
		// This assembly implementation is more gas-efficient than `keccak256(abi.encodePacked(value_))`.
		assembly {
			mstore(0x00, value_)
			hashSum_ := keccak256(0x00, 0x20)
		}		
	}
}
