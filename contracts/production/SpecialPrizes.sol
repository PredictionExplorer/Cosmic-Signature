// SPDX-License-Identifier: MIT

pragma solidity 0.8.27;

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISpecialPrizes } from "./interfaces/ISpecialPrizes.sol";

abstract contract SpecialPrizes is CosmicSignatureGameStorage, ISpecialPrizes {
	function currentEnduranceChampion() external view override returns (address, uint256) {
		// todo-1 Would it be more correct to evaluate `enduranceChampion` here instead.
		// todo-1 One good reason is to avoid reading an extra memory slot.
		if (lastBidder == address(0)) {

			return (address(0), 0);
		}
		{
			uint256 lastBidDuration_ = block.timestamp - bidderInfo[roundNum][lastBidder].lastBidTimeStamp;
			if (lastBidDuration_ > enduranceChampionDuration) {
				return (lastBidder, lastBidDuration_);
			}
		}
		return (enduranceChampion, enduranceChampionDuration);
	}
}
