// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IBiddingV2 } from "./IBiddingV2.sol";

interface IBiddingV3 is IBiddingV2 {
	/// @notice Calls `getNextEthPlusRandomWalkNftBidPriceAdvanced` with `currentTimeOffset_ = 0`.
	function getNextEthPlusRandomWalkNftBidPrice() external view returns (uint256);

	/// @notice Returns the payable ETH price for an ETH + Random Walk NFT bid.
	/// @dev This applies the Random Walk NFT discount to the base ETH price before applying the V3 late-round premium.
	function getNextEthPlusRandomWalkNftBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);
}
