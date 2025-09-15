// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

/// @notice This contract supports updating and getting game playing statistics, including Endurance Champion and Chrono-Warrior.
interface IBidStatistics is ICosmicSignatureGameStorage {
	/// @return The total number of bids in the given bidding round.
	/// If an argument is invalid the return value is indeterminate.
	function getTotalNumBids(uint256 roundNum_) external view returns (uint256);

	/// @return Bidder address in the given bidding round at the given bid index.
	/// If an argument is invalid the return value is indeterminate.
	function getBidderAddressAt(uint256 roundNum_, uint256 bidIndex_) external view returns (address);

	/// @return A tuple containing the total ETH and CST amounts spent by the given bidder in the given bidding round, in Wei.
	/// If the given bidder didn't bid in the given bidding round both return values will be zeros.
	/// If an argument is invalid the return value is indeterminate.
	/// @dev Comment-202503162 relates and/or applies.
	function getBidderTotalSpentAmounts(uint256 roundNum_, address bidderAddress_) external view returns (uint256, uint256);

	// /// @return The current Endurance Champion address and duration.
	// /// @dev
	// /// [Comment-202503141]
	// /// This method has been replaced with `tryGetCurrentChampions`.
	// /// [/Comment-202503141]
	// function tryGetCurrentEnduranceChampion() external view returns (address, uint256);

	/// @notice Calculates and returns the current real-time Endurance Champion and Crono-Warrior info.
	/// Provided the first bid has been placed in the current bidding round, the result changes over time,
	/// even if the contract state does not change,
	/// provided the first bid in a bidding round has been placed.
	/// If there are no bids in the current bidding round, all return values will be zeros.
	/// @dev
	/// [Comment-202412135]
	/// This method is intended to be called only off-chain.
	/// Therefore it's not very important to optimize it.
	/// [/Comment-202412135]
	/// Comment-202503141 relates.
	function tryGetCurrentChampions() external view
		returns (
			address enduranceChampionAddress_,
			uint256 enduranceChampionDuration_,
			address chronoWarriorAddress_,
			uint256 chronoWarriorDuration_
		);
}
