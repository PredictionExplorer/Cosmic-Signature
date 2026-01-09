// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IBidStatistics } from "./interfaces/IBidStatistics.sol";

// #endregion
// #region

/// @title BidStatistics
/// @author Cosmic Signature Team
/// @notice Provides functions for retrieving bid-related statistics and updating champion tracking.
/// @dev This abstract contract handles:
/// - Query functions for bid counts and bidder information.
/// - Endurance Champion tracking (longest single continuous bid duration).
/// - Chrono-Warrior tracking (longest duration as Endurance Champion).
/// See `${workspaceFolder}/docs/endurance-chrono-README.md` for detailed champion definitions.
abstract contract BidStatistics is CosmicSignatureGameStorage, IBidStatistics {
	// #region `getTotalNumBids`

	/// @inheritdoc IBidStatistics
	function getTotalNumBids(uint256 roundNum_) external view override returns (uint256) {
		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum_];
		uint256 totalNumBids_ = bidderAddressesReference_.numItems;
		return totalNumBids_;
	}

	// #endregion
	// #region `getBidderAddressAt`

	/// @inheritdoc IBidStatistics
	function getBidderAddressAt(uint256 roundNum_, uint256 bidIndex_) external view override returns (address) {
		address bidderAddress_ = bidderAddresses[roundNum_].items[bidIndex_];
		return bidderAddress_;
	}

	// #endregion
	// #region `getBidderTotalSpentAmounts`

	/// @inheritdoc IBidStatistics
	function getBidderTotalSpentAmounts(uint256 roundNum_, address bidderAddress_) external view override returns (uint256, uint256) {
		BidderInfo storage bidderInfoReference_ = biddersInfo[roundNum_][bidderAddress_];
		return (bidderInfoReference_.totalSpentEthAmount, bidderInfoReference_.totalSpentCstAmount);
	}

	// #endregion
	// #region `_updateChampionsIfNeeded`

	/// @dev Updates Endurance Champion and Chrono-Warrior info if the last bidder has held
	/// the position longer than the current champion.
	/// Called on each bid (except the first) and when claiming the main prize.
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

	/// @dev Updates Chrono-Warrior if the current Endurance Champion has held the title
	/// longer than the previous Chrono-Warrior.
	/// @param chronoEndTimeStamp_ The timestamp marking the end of the current champion's reign.
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
	// #region // `tryGetCurrentEnduranceChampion`

	// function tryGetCurrentEnduranceChampion() external view override returns (address, uint256) {
	// 	if (lastBidderAddress == address(0)) {
	// 		return (address(0), 0);
	// 	}
	// 	{
	// 		uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;
	// 		uint256 lastBidDuration_ = block.timestamp - lastBidTimeStampCopy_;
	// 		if (lastBidDuration_ > enduranceChampionDuration || enduranceChampionAddress == address(0)) {
	// 			return (lastBidderAddress, lastBidDuration_);
	// 		}
	// 	}
	// 	return (enduranceChampionAddress, enduranceChampionDuration);
	// }

	// #endregion
	// #region `tryGetCurrentChampions`

	/// @inheritdoc IBidStatistics
	/// @dev This is a view function that simulates what the champion values would be
	/// if `_updateChampionsIfNeeded` were called at `block.timestamp`.
	function tryGetCurrentChampions() external view override
		returns (
			address enduranceChampionAddress_,
			uint256 enduranceChampionDuration_,
			address chronoWarriorAddress_,
			uint256 chronoWarriorDuration_
		) {
		// #region

		if (lastBidderAddress != address(0)) {
			// #region

			// Issue. It's inefficient to load all these storage slots. We will not necessarily use some of these values.
			// But it's not too bad, given Comment-202412135.
			enduranceChampionAddress_ = enduranceChampionAddress;
			uint256 enduranceChampionStartTimeStamp_ = enduranceChampionStartTimeStamp;
			enduranceChampionDuration_ = enduranceChampionDuration;
			uint256 prevEnduranceChampionDuration_ = prevEnduranceChampionDuration;
			chronoWarriorAddress_ = chronoWarriorAddress;
			chronoWarriorDuration_ = chronoWarriorDuration;

			// #endregion
			// #region

			uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;
			uint256 lastBidDuration_ = block.timestamp - lastBidTimeStampCopy_;

			// #endregion
			// #region

			if (enduranceChampionAddress_ == address(0)) {
				// #region

				enduranceChampionAddress_ = lastBidderAddress;
				enduranceChampionStartTimeStamp_ = lastBidTimeStampCopy_;
				enduranceChampionDuration_ = lastBidDuration_;

				// #endregion
			} else if (lastBidDuration_ > enduranceChampionDuration_) {
				// #region

				{
					uint256 chronoEndTimeStamp_ = lastBidTimeStampCopy_ + enduranceChampionDuration_;
					uint256 chronoStartTimeStamp_ = enduranceChampionStartTimeStamp_ + prevEnduranceChampionDuration_;
					uint256 chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
					if (int256(chronoDuration_) > int256(chronoWarriorDuration_)) {
						chronoWarriorAddress_ = enduranceChampionAddress_;
						chronoWarriorDuration_ = chronoDuration_;
					}
				}

				// #endregion
				// #region

				prevEnduranceChampionDuration_ = enduranceChampionDuration_;
				enduranceChampionAddress_ = lastBidderAddress;
				enduranceChampionStartTimeStamp_ = lastBidTimeStampCopy_;
				enduranceChampionDuration_ = lastBidDuration_;

				// #endregion
			}

			// #endregion
			// #region

			{
				uint256 chronoEndTimeStamp_ = block.timestamp;
				uint256 chronoStartTimeStamp_ = enduranceChampionStartTimeStamp_ + prevEnduranceChampionDuration_;
				uint256 chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
				if (int256(chronoDuration_) > int256(chronoWarriorDuration_)) {
					chronoWarriorAddress_ = enduranceChampionAddress_;
					chronoWarriorDuration_ = chronoDuration_;
				}
			}

			// #endregion
		}

		// #endregion
	}

	// #endregion
}

// #endregion
