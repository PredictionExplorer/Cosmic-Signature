// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface IMainPrizeCommon is ICosmicSignatureGameStorage, ISystemEvents {
	function getInitialDurationUntilMainPrize() external view returns (uint256);

	/// @notice
	/// [Comment-202605239]
	/// This is a "friendly" version of `getDurationUntilMainPrize` that can't return a negative value.
	/// Comments near `getDurationUntilMainPrize` apply.
	/// [/Comment-202605239]
	function getDurationUntilMainPrizeClamped() external view returns (uint256);

	/// @notice See also: `getDurationUntilMainPrizeClamped`.
	/// @return
	/// [Comment-202605241]
	/// The number of seconds until the last bidder will be permitted to claim the main prize,
	/// or a non-positive value if that time has already come.
	/// [/Comment-202605241]
	/// Comment-202501022 applies.
	function getDurationUntilMainPrize() external view returns (int256);

	function getMainPrizeTimeIncrement() external view returns (uint256);
}
