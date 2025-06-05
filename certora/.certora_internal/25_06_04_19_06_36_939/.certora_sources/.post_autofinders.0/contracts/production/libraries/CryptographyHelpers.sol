// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

library CryptographyHelpers {
	/// @notice
	/// [Comment-202504061]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504061]
	function calculateHashSumOf(uint256 value_) internal pure returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b80000, 1037618708920) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b80001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b80005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b86000, value_) }
		// A possibly more efficient conversion to `bytes`: https://stackoverflow.com/questions/49231267/how-to-convert-uint256-to-bytes-and-bytes-convert-to-uint256
		// But ChatGPT is saying that it's a bit less gas efficient than `abi.encodePacked`.
		// Indeed, `abi.encodePacked` returns data that 32 bytes long, so it's probably as efficient as it can be.
		return uint256(keccak256(abi.encodePacked(value_)));
	}
}
