// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

interface ISpecialPrizes {
	/// @notice Get the current endurance champion and their duration
	/// @return The address of the current endurance champion and their duration
   function currentEnduranceChampion() external view returns (address, uint256);
}
