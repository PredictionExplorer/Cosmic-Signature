// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IMainPrizeBase } from "./interfaces/IMainPrizeBase.sol";

/// @title MainPrizeBase
/// @author Cosmic Signature Team
/// @notice Provides base functions for main prize time calculations and extensions.
/// @dev This abstract contract contains helper functions used by the main prize claiming logic:
/// - Time calculations for when the main prize becomes claimable.
/// - Logic to extend the main prize time on each bid.
/// - Conversion between microseconds and seconds for time increments.
abstract contract MainPrizeBase is CosmicSignatureGameStorage, IMainPrizeBase {
	// #region View Functions

	/// @inheritdoc IMainPrizeBase
	function getInitialDurationUntilMainPrize() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 initialDurationUntilMainPrize_ = mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor;
			return initialDurationUntilMainPrize_;
		}
	}

	/// @inheritdoc IMainPrizeBase
	function getDurationUntilMainPrize() external view override returns (uint256) {
		int256 durationUntilMainPrize_ = getDurationUntilMainPrizeRaw();
		return (durationUntilMainPrize_ > int256(0)) ? uint256(durationUntilMainPrize_) : 0;
	}

	/// @inheritdoc IMainPrizeBase
	function getDurationUntilMainPrizeRaw() public view override returns (int256) {
		// todo-1 +++ Review all `unchecked`.
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilMainPrize_ = int256(mainPrizeTime) - int256(block.timestamp);
			return durationUntilMainPrize_;
		}
	}

	/// @inheritdoc IMainPrizeBase
	function getMainPrizeTimeIncrement() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 mainPrizeTimeIncrement_ = mainPrizeTimeIncrementInMicroSeconds / CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
			// #enable_asserts assert(mainPrizeTimeIncrement_ > 0);
			return mainPrizeTimeIncrement_;
		}
	}

	// #endregion
	// #region Internal Functions

	/// @dev Sets the main prize time increment (in microseconds) and emits an event.
	/// @param newValue_ The new value in microseconds.
	function _setMainPrizeTimeIncrementInMicroSeconds(uint256 newValue_) internal {
		mainPrizeTimeIncrementInMicroSeconds = newValue_;
		emit MainPrizeTimeIncrementInMicroSecondsChanged(newValue_);
	}

	/// @dev Extends `mainPrizeTime` by the current time increment.
	/// Called on each bid, except the first one in a bidding round.
	/// Uses the maximum of the current `mainPrizeTime` and `block.timestamp` as the base
	/// to handle edge cases where `mainPrizeTime` might be in the past.
	function _extendMainPrizeTime() internal {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 mainPrizeCorrectedTime_ = Math.max(mainPrizeTime, block.timestamp);
			uint256 mainPrizeTimeIncrement_ = getMainPrizeTimeIncrement();
			mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;
		}
	}

	// #endregion
}
