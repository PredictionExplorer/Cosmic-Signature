// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface IMainPrizeBase is ICosmicSignatureGameStorage, ISystemEvents {
	function getInitialDurationUntilMainPrize() external view returns (uint256);

	/// @notice This is a "friendly" version of `getDurationUntilMainPrizeRaw` that can't return a negative value.
	/// Comments near `getDurationUntilMainPrizeRaw` apply.
	function getDurationUntilMainPrize() external view returns (uint256);

	/// @notice See also: `getDurationUntilMainPrize`.
	/// @return The number of seconds until the last bidder will be permitted to claim the main prize,
	/// or a non-positive value if that time has already come.
	/// Comment-202501022 applies.
	function getDurationUntilMainPrizeRaw() external view returns (int256);

	function getMainPrizeTimeIncrement() external view returns (uint256);
}
