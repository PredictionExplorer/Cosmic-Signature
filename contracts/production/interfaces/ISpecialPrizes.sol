// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

interface ISpecialPrizes is ICosmicSignatureGameStorage {
	/// @notice Obtains the current endurance champion and their duration.
	/// @return The address of the current endurance champion and their duration.
	/// @dev
	/// [ToDo-202411179-1]
	/// Should I comment out this function? The backend can calculate this.
	/// Otherwise move it to `BidStatistics`?
	/// Maybe eliminate the whole `SpecialPrizes` contract and its interface.
	/// It's a stretch to separate prizes into multiple contracts.
	/// Then rename `MainPrize` to `Prizes`.
	/// [/ToDo-202411179-1]
	/// todo-1 Rename this to `tryGetCurrentEnduranceChampionAddress`.
	function currentEnduranceChampion() external view returns (address, uint256);
}
