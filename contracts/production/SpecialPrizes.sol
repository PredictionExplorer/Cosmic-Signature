// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { ISpecialPrizes } from "./interfaces/ISpecialPrizes.sol";

abstract contract SpecialPrizes is CosmicGameStorage, ISpecialPrizes {
	function currentEnduranceChampion() external view override returns (address, uint256) {
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
