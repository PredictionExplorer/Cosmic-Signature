// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IBiddingV2 } from "./IBiddingV2.sol";

interface IBiddingV3 is IBiddingV2 {
	function getRoundLateBidDuration() external view returns (uint256);

	/// @notice Calculates and returns the CST amount that accrues over one main prize time increment.
	/// This is the rate at which the bid CST reward grows and the CST bid price declines.
	/// Comment-202607165 applies.
	function getBidCstRewardAmountPerMainPrizeTimeIncrement() external view returns (uint256);

	/// @notice Calculates and returns the minimum limit that a CST bid imposes on the next CST Dutch auction beginning bid price.
	/// In V3+, `cstDutchAuctionBeginningBidPriceMinLimit` is ignored; this is derived instead.
	/// Comment-202607166 applies.
	function getCstDutchAuctionBeginningBidPriceMinLimit() external view returns (uint256);
}
