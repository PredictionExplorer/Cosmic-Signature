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
			// On a bid, V1 moves the `mainPrizeTime` deadline into the future even if the deadline has already passed.
			// There is also `timeoutDurationToClaimMainPrize` on top of that.
			// V2+ instead adds to the deadline and thereby does not ensure that it will end up in the future.
			// V2+ also increases CST Dutch auction duration on a typical CST bid (V2 vs. V3+ use different logic for that).
			// In all versions, zero or negative net cost CST bids are possible after enough elapsed duration.
			// In V2+, if a bid does not move the deadline into the future,
			// the new last bidder can bid and claim the main prize within one transaction.
			// Issue. The problem with V1 is that a sufficiently late CST bid can cost net zero or negative
			// and still push the deadline when anybody is permitted to claim the main prize to a point in the future
			// before which the next CST bid net price will become zero or negative. This flaw makes it possible for a bidder
			// to keep a bidding round going indefinitely.
			// The V2+ logic mitigates this issue; it's possible to keep a round going only for a limited duration.
			// That said, in either Game version, attempting anything like that makes little sense for the last bidder,
			// so this possibility is only theoretical. It's unlikely that someone will ever attempt this.
			// [/Comment-202606175]
			uint256 mainPrizeTimeIncrement_ = getMainPrizeTimeIncrement();
			uint256 mainPrizeCorrectedTime_ = Math.max(mainPrizeTime, block.timestamp);
			mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;
		}
	}
}
