// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISystemEvents } from "./interfaces/ISystemEvents.sol";
import { IMainPrizeCommon } from "./interfaces/IMainPrizeCommon.sol";

abstract contract MainPrizeCommon is
	CosmicSignatureGameStorage,
	ISystemEvents,
	IMainPrizeCommon {
	function getInitialDurationUntilMainPrize() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 initialDurationUntilMainPrize_ = mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor;
			return initialDurationUntilMainPrize_;
		}
	}

	function getDurationUntilMainPrize() public view override returns (int256) {
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

	/// @notice
	/// [Comment-202605242]
	/// Extends `mainPrizeTime`.
	/// This method is called on each bid, except the first one in a bidding round.
	/// Comment-202412152 relates and/or applies.
	/// [/Comment-202605242]
	function _extendMainPrizeTime() internal {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// [Comment-202606175]
			// With a positive increment, V1 moves `mainPrizeTime` into the future even if it has already passed.
			// Issue. A sufficiently late CST bid can cost zero and restart the waiting period for the main prize claim.
			// V2 instead adds to the stored deadline and increases CST Dutch auction duration on each CST bid.
			// V3 retains the stored-deadline rule, but replaces that duration adjustment with a reduced decline rate
			// and a duration-based beginning-price floor. Zero-cost CST bids remain possible after enough elapsed time.
			// V2+ does not ensure that a bid moves `mainPrizeTime` into the future.
			// If the resulting deadline has already arrived, the new last bidder can bid and claim within one transaction.
			// [/Comment-202606175]
			uint256 mainPrizeTimeIncrement_ = getMainPrizeTimeIncrement();
			uint256 mainPrizeCorrectedTime_ = Math.max(mainPrizeTime, block.timestamp);
			mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;
		}
	}
}
