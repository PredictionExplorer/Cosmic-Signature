// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { FakeArbBase } from "./FakeArbBase.sol";

/// @notice Comment-202506303 applies.
/// [Comment-202506284]
/// Similar logic exists in multiple places.
/// [/Comment-202506284]
contract FakeArbGasInfo is FakeArbBase {
	function getGasBacklog() external view returns (uint64) {
		if ((modeCode & 0x100) != 0) {
			revert ("FakeArbGasInfo.getGasBacklog is disabled.");
		}
		if ((modeCode & 0x200) != 0) {
			assembly {
				return (0, 0)
			}
		}
		unchecked { return uint64(block.number * 211); }
	}

	function getL1PricingUnitsSinceUpdate() external view returns (uint64) {
		if ((modeCode & 0x1000) != 0) {
			revert ("FakeArbGasInfo.getL1PricingUnitsSinceUpdate is disabled.");
		}
		if ((modeCode & 0x2000) != 0) {
			assembly {
				return (0, 0)
			}
		}
		unchecked { return uint64(block.number * 307); }
	}
}
