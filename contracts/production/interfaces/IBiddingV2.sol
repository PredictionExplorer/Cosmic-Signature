// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { IBidding } from "./IBidding.sol";

/// @notice V2 bidding interface with time-based CST bid rewards.
interface IBiddingV2 is IBidding {
	/// @notice Emitted when a bid receives its CST reward.
	/// @param roundNum The current bidding round number.
	/// @param bidderAddress The address that placed the bid.
	/// @param amount The minted CST reward amount, in wei.
	event CstBidRewardMinted(
		uint256 indexed roundNum,
		address indexed bidderAddress,
		uint256 amount
	);

	/// @notice Returns the CST reward that would be minted for a bid at the current timestamp.
	function getCstBidRewardAmount() external view returns (uint256);
}
