// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

/// @notice Comment-202506303 applies.
/// [Comment-202506284]
/// Similar logic exists in multiple places.
/// [/Comment-202506284]
contract FakeArbGasInfo {
	function getGasBacklog() external view returns (uint64) {
		unchecked { return uint64(block.number * 211); }
	}

	function getL1PricingUnitsSinceUpdate() external view returns (uint64) {
		unchecked { return uint64(block.number * 307); }
	}
}
