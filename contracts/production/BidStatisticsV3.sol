// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";

// #endregion
// #region

abstract contract BidStatisticsV3 is
	BidStatisticsV2,
	CosmicSignatureGameStorageV3Base {
	// #region `_updateRoundStatsOnMainPrizeClaim`

	/// todo-1 +++ Test that this is called.
	/// @param isSameBid_ Whether the same individual bid earned both Endurance Champion and Chrono-Warrior titles.
	/// It's taken from the value returned by the final call to `_updateChronoWarriorIfNeeded`.
	/// The values returned by earlier calls to it are ignored
	/// because earlier Chrono-Warrior candidates came from bids replaced as Endurance Champion.
	/// Only the final update can award both titles to the same individual bid.
	function _updateRoundStatsOnMainPrizeClaim(bool isSameBid_) internal override virtual {
		super._updateRoundStatsOnMainPrizeClaim(isSameBid_);
		RoundStats storage roundStatsReference_ = roundStats[roundNum];
		roundStatsReference_.enduranceChampionDuration = enduranceChampionDuration;
		roundStatsReference_.chronoWarriorDuration = chronoWarriorDuration;
		// #enable_asserts assert(roundStatsReference_.flags == 0);
		if (isSameBid_) {
			// roundStatsReference_.flags |= CosmicSignatureConstants.SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES;
			roundStatsReference_.flags = CosmicSignatureConstants.SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES;
		}
	}

	// #endregion
}

// #endregion
