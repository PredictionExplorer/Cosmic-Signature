// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

interface IMainPrizeBase is ICosmicSignatureGameStorage {
	function getInitialDurationUntilMainPrize() external view returns (uint256);

	/// @return The number of seconds until the last bidder will be permitted to claim the main prize,
	/// or a non-positive value if that time has already come.
	/// Comment-202501022 applies.
	function getDurationUntilMainPrize() external view returns (int256);

	function getMainPrizeTimeIncrement() external view returns (uint256);
}
