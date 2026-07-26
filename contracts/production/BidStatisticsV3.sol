// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";

// #endregion
// #region

abstract contract BidStatisticsV3 is
	BidStatisticsV2,
	CosmicSignatureGameStorageV3Base {
	// #region `_saveChampionDurations`

	/// todo-0 Test that this is called.
	function _saveChampionDurations() internal override virtual {
		super._saveChampionDurations();
		ChampionDurations storage championDurationsReference_ = championDurations[roundNum];
		championDurationsReference_.enduranceChampion = enduranceChampionDuration;
		championDurationsReference_.chronoWarrior = chronoWarriorDuration;
	}

	// #endregion
}

// #endregion
