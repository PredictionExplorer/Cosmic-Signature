// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEventsV2 } from "./ISystemEventsV2.sol";

interface IMainPrizeBaseV2 is ICosmicSignatureGameStorage, ISystemEventsV2 {
	function getInitialDurationUntilMainPrize() external view returns (uint256);

	/// @notice Comment-202605239 applies.
	function getDurationUntilMainPrize() external view returns (uint256);

	/// @notice See also: `getDurationUntilMainPrize`.
	/// @return Comment-202605241 applies.
	/// Comment-202501022 applies.
	function getDurationUntilMainPrizeRaw() external view returns (int256);

	function getMainPrizeTimeIncrement() external view returns (uint256);
}
