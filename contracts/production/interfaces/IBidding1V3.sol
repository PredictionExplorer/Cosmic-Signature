// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IBidding1V2 } from "./IBidding1V2.sol";

/// @notice Comment-202605251 applies.
interface IBidding1V3 is IBidding1V2 {
	/// @notice Calls `getNextCstBidPriceBaseAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getNextCstBidPriceBaseAdvanced` apply.
	function getNextCstBidPriceBase() external view returns (uint256);

	/// @notice Calculates and returns the CST bid price without the late-bid premium.
	/// `getNextCstBidPriceAdvanced` returns this plus the premium.
	/// Comment-202611023 applies.
	/// Comment-202503162 applies.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return The CST bid price base. It can be zero.
	/// Comment-202501022 applies.
	function getNextCstBidPriceBaseAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @return The duration before `mainPrizeTime` during which bid prices include the late-bid premium, in seconds.
	function getRoundLateBidDuration() external view returns (uint256);
}
