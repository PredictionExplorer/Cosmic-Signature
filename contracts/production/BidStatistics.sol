// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

// import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { IBidStatistics } from "./interfaces/IBidStatistics.sol";

abstract contract BidStatistics is CosmicGameStorage, IBidStatistics {
	/// @notice Update the endurance champion based on the current bid
	/// @dev This function is called for each bid to potentially update the endurance champion
	function _updateEnduranceChampion() internal {
		// if (lastBidder == address(0)) return;
		// #enable_asserts assert(lastBidder != address(0));

		// todo-0 Who and when updates `bidderInfo[roundNum][lastBidder].lastBidTime`? What if it got updated many bids ago?
		uint256 lastBidDuration = block.timestamp - bidderInfo[roundNum][lastBidder].lastBidTime;
		// [ToDo-202411082-0]
		// Can these both be zero?
		// Maybe we should reset `enduranceChampionDuration` to -1 on round start?
		// [/ToDo-202411082-0]
		if (lastBidDuration > enduranceChampionDuration) {
			enduranceChampionDuration = lastBidDuration;
			enduranceChampion = lastBidder;
		}
	}
}
