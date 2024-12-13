// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

interface IBidStatistics is ICosmicSignatureGameStorage {
	// /// @return The current Endurance Champion address and duration.
	// /// @dev This method has been replaced with `tryGetCurrentChampions`.
	// function tryGetCurrentEnduranceChampion() external view returns(address, uint256);

	/// @notice Calculates and returns the current Endurance Champion and Crono-Warrior info.
	/// The result changes over time, even if the contract state doesn't change.
	/// @dev
	/// [Comment-202412135]
	/// This method is intended to be called only off-chain.
	/// Therefore it's not very important to optimize it.
	/// [/Comment-202412135]
	function tryGetCurrentChampions() external view
		returns(
			address enduranceChampionAddress_,
			uint256 enduranceChampionDuration_,
			address chronoWarriorAddress_,
			uint256 chronoWarriorDuration_
		);
}
