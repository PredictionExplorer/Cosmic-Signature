// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureGameStorageV3Core } from "./CosmicSignatureGameStorageV3Core.sol";

// #endregion
// #region

/// @notice This is the V3+ Game implementation contract fork of the champion-update logic
/// in `BidStatisticsV2`. Comment-202608244 applies: the external views (`getTotalNumBids`,
/// `getBidderAddressAt`, `getBidderTotalSpentAmounts`, `tryGetCurrentChampions`) live in
/// `CosmicSignatureGameViewsModuleV3` via the original `BidStatisticsV2`, and `_saveChampionDurations`
/// lives in `CosmicSignatureGamePrizesModuleV3` via the original `BidStatisticsV3`,
/// because only the main prize claim needs it.
abstract contract BidStatisticsV3Core is CosmicSignatureGameStorageV3Core {
	// #region `_updateChampionsIfNeeded`

	/// @notice Comment-202605245 applies.
	function _updateChampionsIfNeeded() internal {
		// if (lastBidderAddress == address(0)) return;
		// #enable_asserts assert(lastBidderAddress != address(0));

		uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;
		uint256 lastBidDuration_ = block.timestamp - lastBidTimeStampCopy_;
		if (enduranceChampionAddress == address(0)) {
			enduranceChampionAddress = lastBidderAddress;
			enduranceChampionStartTimeStamp = lastBidTimeStampCopy_;
			enduranceChampionDuration = lastBidDuration_;
			// #enable_asserts assert(chronoWarriorAddress == address(0));
		} else if (lastBidDuration_ > enduranceChampionDuration) {
			{
				uint256 chronoEndTimeStamp_ = lastBidTimeStampCopy_ + enduranceChampionDuration;
				_updateChronoWarriorIfNeeded(chronoEndTimeStamp_);
			}
			prevEnduranceChampionDuration = enduranceChampionDuration;
			enduranceChampionAddress = lastBidderAddress;
			enduranceChampionStartTimeStamp = lastBidTimeStampCopy_;
			enduranceChampionDuration = lastBidDuration_;
		}

		// #enable_asserts assert(enduranceChampionAddress != address(0));
	}

	// #endregion
	// #region `_updateChronoWarriorIfNeeded`

	/// @notice Comment-202605246 applies.
	function _updateChronoWarriorIfNeeded(uint256 chronoEndTimeStamp_) internal {
		// #enable_asserts assert(enduranceChampionAddress != address(0));
		// #enable_asserts assert(int256(chronoWarriorDuration) >= -1);
		// #enable_asserts assert((chronoWarriorAddress == address(0)) == (int256(chronoWarriorDuration) < int256(0)));

		uint256 chronoStartTimeStamp_ = enduranceChampionStartTimeStamp + prevEnduranceChampionDuration;
		uint256 chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
		if (int256(chronoDuration_) > int256(chronoWarriorDuration)) {
			chronoWarriorAddress = enduranceChampionAddress;
			chronoWarriorDuration = chronoDuration_;
		}

		// #enable_asserts assert(chronoWarriorAddress != address(0));
		// #enable_asserts assert(int256(chronoWarriorDuration) >= int256(0));
	}

	// #endregion
}

// #endregion
