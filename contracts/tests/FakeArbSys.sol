// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

/// @notice
/// [Comment-202506303]
/// This contract resembles respective Arbitrum contract.
/// [/Comment-202506303]
/// [Comment-202506282]
/// Similar logic exists in multiple places.
/// [/Comment-202506282]
contract FakeArbSys {
	function arbBlockNumber() external view returns (uint256) {
		unchecked { return block.number * 100; }
	}

	function arbBlockHash(uint256 arbBlockNum_) external pure returns (bytes32) {
		unchecked { return bytes32(arbBlockNum_ * 1_000_003); }
	}
}
