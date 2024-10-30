// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

interface ISpecialPrizes is ICosmicSignatureGameStorage {
	/// @notice Obtains the current endurance champion and their duration.
	/// @return The address of the current endurance champion and their duration.
	/// @dev todo-1 Should I comment out this function? The backend can calculate this.
	/// todo-1 Otherwise move it to `BidStatistics`?
	function currentEnduranceChampion() external view returns (address, uint256);
}
