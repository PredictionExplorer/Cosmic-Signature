// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";

interface IBidStatistics is ICosmicSignatureGameStorage {
	/// @return The total number of bids in the given bidding round.
	/// If an argument is invalid the behavior is undefined.
	function getTotalNumBids(uint256 roundNum_) external view returns(uint256);

	/// @return Bidder address in the given bidding round at the given bid index.
	/// If an argument is invalid the behavior is undefined.
	function getBidderAddressAt(uint256 roundNum_, uint256 bidIndex_) external view returns(address);

	/// @return A tuple containing the total ETH and CST amounts spent by the given bidder in the given bidding round, in Wei.
	/// If the given bider didn't bid in the given bidding round both return values will be zeros.
	/// todo-1 Add a test for the above.
	/// If an argument is invalid the behavior is undefined.
	function getBidderTotalSpentAmounts(uint256 roundNum_, address bidderAddress_) external view returns(uint256, uint256);

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
