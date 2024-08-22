// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "./CosmicGameStorage.sol";

contract SpecialPrizes is CosmicGameStorage {
	/// @notice Get the current endurance champion and their duration
	/// @return The address of the current endurance champion and their duration
	function currentEnduranceChampion() external view returns (address, uint256) {
		if (lastBidder == address(0)) {
			return (address(0), 0);
		}

		// ToDo-202408116-0 applies.
		uint256 lastBidTime = block.timestamp/*.sub*/ - (bidderInfo[roundNum][lastBidder].lastBidTime);
		if (lastBidTime > enduranceChampionDuration) {
			return (lastBidder, lastBidTime);
		}
		return (enduranceChampion, enduranceChampionDuration);
	}
}
