// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "./CosmicGameStorage.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";

abstract contract BidStatistics is CosmicGameStorage {

	/// @notice Update the endurance champion based on the current bid
	/// @dev This function is called for each bid to potentially update the endurance champion
	function _updateEnduranceChampion() internal {
		if (lastBidder == address(0)) return;

		// ToDo-202408116-0 applies.
		uint256 lastBidDuration = block.timestamp/*.sub*/ - (bidderInfo[roundNum][lastBidder].lastBidTime);
		if (lastBidDuration > enduranceChampionDuration) {
			enduranceChampionDuration = lastBidDuration;
			enduranceChampion = lastBidder;
		}
	}
}
