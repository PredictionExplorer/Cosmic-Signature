// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IBiddingV2 } from "./IBiddingV2.sol";

interface IBiddingV3 is IBiddingV2 {
	function getRoundLateBidDuration() external view returns (uint256);
}
