// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IMainPrizeBase } from "./interfaces/IMainPrizeBase.sol";

abstract contract MainPrizeBase is CosmicSignatureGameStorage, IMainPrizeBase {
	function getInitialDurationUntilMainPrize() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 initialDurationUntilMainPrize_ = mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor;
			return initialDurationUntilMainPrize_;
		}
	}

	function getDurationUntilMainPrize() external view override returns (uint256) {
		int256 durationUntilMainPrize_ = getDurationUntilMainPrizeRaw();
		return (durationUntilMainPrize_ > int256(0)) ? uint256(durationUntilMainPrize_) : 0;
	}

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

	function _setMainPrizeTimeIncrementInMicroSeconds(uint256 newValue_) internal {
		mainPrizeTimeIncrementInMicroSeconds = newValue_;
		emit MainPrizeTimeIncrementInMicroSecondsChanged(newValue_);
	}

	/// @notice Extends `mainPrizeTime`.
	/// This method is called on each bid, except the first one in a bidding round.
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
}
