// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { FakeArbBase } from "./FakeArbBase.sol";

/// @notice
/// [Comment-202506303]
/// This contract resembles respective Arbitrum contract.
/// [/Comment-202506303]
/// [Comment-202506282]
/// Similar logic exists in multiple places.
/// [/Comment-202506282]
contract FakeArbSys is FakeArbBase {
	function arbBlockNumber() external view returns (uint256) {
		if ((modeCode & 0x1) != 0) {
			revert ("FakeArbSys.arbBlockNumber is disabled.");
		}
		if ((modeCode & 0x2) != 0) {
			assembly {
				return (0, 0)
			}
		}
		unchecked { return block.number * 100; }
	}

	function arbBlockHash(uint256 arbBlockNum_) external view returns (bytes32) {
		if ((modeCode & 0x10) != 0) {
			revert ("FakeArbSys.arbBlockHash is disabled.");
		}
		if ((modeCode & 0x20) != 0) {
			assembly {
				return (0, 0)
			}
		}
		unchecked { return bytes32(arbBlockNum_ * 1_000_003); }
	}
}
