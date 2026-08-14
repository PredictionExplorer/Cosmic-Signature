// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorageV3Core } from "./CosmicSignatureGameStorageV3Core.sol";

/// @notice This is the V3+ Game implementation contract fork of `MainPrizeCommonV2`.
/// Comment-202608244 applies: only the members the bid path needs are retained, with `internal` visibility;
/// the external views live in `CosmicSignatureGameViewsModuleV3` via the original `MainPrizeCommonV2`.
abstract contract MainPrizeCommonV3Core is CosmicSignatureGameStorageV3Core {
	/// @dev In the original `MainPrizeCommonV2`, this is `public`. Comment-202608244 applies.
	function getInitialDurationUntilMainPrize() internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 initialDurationUntilMainPrize_ = mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor;
			return initialDurationUntilMainPrize_;
		}
	}

	/// @dev In the original `MainPrizeCommonV2`, this is `public`. Comment-202608244 applies.
	function getDurationUntilMainPrizeRaw() internal view returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilMainPrize_ = int256(mainPrizeTime) - int256(block.timestamp);
			return durationUntilMainPrize_;
		}
	}

	/// @dev In the original `MainPrizeCommonV2`, this is `public`. Comment-202608244 applies.
	function getMainPrizeTimeIncrement() internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 mainPrizeTimeIncrement_ = mainPrizeTimeIncrementInMicroSeconds / CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
			// #enable_asserts assert(mainPrizeTimeIncrement_ > 0);
			return mainPrizeTimeIncrement_;
		}
	}

	/// @notice Comment-202605242 apples.
	function _extendMainPrizeTime() internal {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202606175 relates and/or applies.
			uint256 mainPrizeTimeIncrement_ = getMainPrizeTimeIncrement();
			mainPrizeTime += mainPrizeTimeIncrement_;
		}
	}
}
