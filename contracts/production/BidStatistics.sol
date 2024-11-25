// #region

// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

// #endregion
// #region

// import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IBidStatistics } from "./interfaces/IBidStatistics.sol";

// #endregion
// #region

abstract contract BidStatistics is CosmicSignatureGameStorage, IBidStatistics {
	// #region `_updateChampionsIfNeeded`

	/// @notice Tries to update the endurance champion and chrono-warrior info.
	function _updateChampionsIfNeeded() internal {
		// if (lastBidderAddress == address(0)) return;
		// #enable_asserts assert(lastBidderAddress != address(0));

		uint256 lastBidTimeStampCopy_ = bidderInfo[roundNum][lastBidderAddress].lastBidTimeStamp;
		uint256 lastBidDuration_ = block.timestamp - lastBidTimeStampCopy_;
		if (enduranceChampion == address(0)) {
			enduranceChampion = lastBidderAddress;
			enduranceChampionStartTimeStamp = lastBidTimeStampCopy_;
			enduranceChampionDuration = lastBidDuration_;
			// #enable_asserts assert(chronoWarrior == address(0));
		} else if (lastBidDuration_ > enduranceChampionDuration) {
			{
				uint256 chronoEndTimeStamp_ = lastBidTimeStampCopy_ + enduranceChampionDuration;
				_updateChronoWarriorIfNeeded(chronoEndTimeStamp_);
			}
			prevEnduranceChampionDuration = enduranceChampionDuration;
			enduranceChampion = lastBidderAddress;
			enduranceChampionStartTimeStamp = lastBidTimeStampCopy_;
			enduranceChampionDuration = lastBidDuration_;
		}

		// #enable_asserts assert(enduranceChampion != address(0));
	}

	// #endregion
	// #region `_updateChronoWarriorIfNeeded`

	/// @notice Tries to update the chrono-warrior info.
	function _updateChronoWarriorIfNeeded(uint256 chronoEndTimeStamp_) internal {
		// #enable_asserts assert(enduranceChampion != address(0));
		// #enable_asserts assert(int256(chronoWarriorDuration) >= -1);
		// #enable_asserts assert((chronoWarrior == address(0)) == (int256(chronoWarriorDuration) < int256(0)));

		uint256 chronoStartTimeStamp_ = enduranceChampionStartTimeStamp + prevEnduranceChampionDuration;
		uint256 chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
		if (int256(chronoDuration_) > int256(chronoWarriorDuration)) {
			chronoWarrior = enduranceChampion;
			chronoWarriorDuration = chronoDuration_;
		}

		// #enable_asserts assert(chronoWarrior != address(0));
	}

	// #endregion
}

// #endregion
