// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IBidding1V2 } from "./IBidding1V2.sol";

/// @notice Comment-202605251 applies.
interface IBidding1V3 is IBidding1V2 {
	function getRoundLateBidDuration() external view returns (uint256);
}
