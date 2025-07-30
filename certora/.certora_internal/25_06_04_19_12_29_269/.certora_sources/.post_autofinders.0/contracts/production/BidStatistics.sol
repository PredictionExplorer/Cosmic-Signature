// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IBidStatistics } from "./interfaces/IBidStatistics.sol";

// #endregion
// #region

abstract contract BidStatistics is CosmicSignatureGameStorage, IBidStatistics {
	// #region `getTotalNumBids`

	function getTotalNumBids(uint256 roundNum_) external view override returns (uint256) {
		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000100cb,0)}
		uint256 totalNumBids_ = bidderAddressesReference_.numItems;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000cc,totalNumBids_)}
		return totalNumBids_;
	}

	// #endregion
	// #region `getBidderAddressAt`

	function getBidderAddressAt(uint256 roundNum_, uint256 bidIndex_) external view override returns (address) {
		address bidderAddress_ = bidderAddresses[roundNum_].items[bidIndex_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000cd,bidderAddress_)}
		return bidderAddress_;
	}

	// #endregion
	// #region `getBidderTotalSpentAmounts`

	function getBidderTotalSpentAmounts(uint256 roundNum_, address bidderAddress_) external view override returns (uint256, uint256) {
		BidderInfo storage bidderInfoReference_ = biddersInfo[roundNum_][bidderAddress_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000100ce,0)}
		return (bidderInfoReference_.totalSpentEthAmount, bidderInfoReference_.totalSpentCstAmount);
	}

	// #endregion
	// #region `_updateChampionsIfNeeded`

	/// @notice Updates the Endurance Champion and Chrono-Warrior info if needed.
	function _updateChampionsIfNeeded() internal {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01750000, 1037618708853) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01750001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01750004, 0) }
		// if (lastBidderAddress == address(0)) return;
		// #enable_asserts assert(lastBidderAddress != address(0));

		uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000cf,lastBidTimeStampCopy_)}
		uint256 lastBidDuration_ = block.timestamp - lastBidTimeStampCopy_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d0,lastBidDuration_)}
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

	/// @notice Updates the chrono-warrior info if needed.
	function _updateChronoWarriorIfNeeded(uint256 chronoEndTimeStamp_) internal {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01760000, 1037618708854) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01760001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01760005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01766000, chronoEndTimeStamp_) }
		// #enable_asserts assert(enduranceChampionAddress != address(0));
		// #enable_asserts assert(int256(chronoWarriorDuration) >= -1);
		// #enable_asserts assert((chronoWarriorAddress == address(0)) == (int256(chronoWarriorDuration) < int256(0)));

		uint256 chronoStartTimeStamp_ = enduranceChampionStartTimeStamp + prevEnduranceChampionDuration;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d1,chronoStartTimeStamp_)}
		uint256 chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d2,chronoDuration_)}
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
