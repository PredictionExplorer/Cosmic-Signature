// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

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
			// Issue. This logic ensures that `mainPrizeTime` becomes in the future, even if it's already in the past.
			// There is also a main prize claim timeout on top of that.
			// As a result, someone can, at least in theory, make a free or, at least, less expensive than the bidding reward CST bid
			// before the timeout expires. The timeout is long enough to allow that.
			// They can keep doing it for as long as they want to.
			// In V2+, this problem is somewhat mitigated by the increase of CST Dutch auction duration on each CST bid,
			// but even then it can take like a year until it's no longer possible to place such a bid within the timeout window.
			// Therefore, V2+ does not ensure that `mainPrizeTime` becomes in the future.
			// Note that the V2+ logic makes it theoretically possible to place a bid and claim main prize within a single transaction.
			// [/Comment-202606175]
			uint256 mainPrizeTimeIncrement_ = getMainPrizeTimeIncrement();
			uint256 mainPrizeCorrectedTime_ = Math.max(mainPrizeTime, block.timestamp);
			mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;
		}
	}
}
