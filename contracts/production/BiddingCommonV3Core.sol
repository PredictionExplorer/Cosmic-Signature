// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorageV3Core } from "./CosmicSignatureGameStorageV3Core.sol";

/// @notice
/// [Comment-202608244]
/// This is the V3+ Game implementation contract fork of `BiddingCommonV2`, re-parented onto the `internal`-visibility
/// storage chassis (Comment-202608243), and stripped of the members the slim implementation contract does not dispatch:
/// the external duration views live in `CosmicSignatureGameViewsModuleV3` (via the original `BiddingCommonV2`),
/// and the `_set*` helpers live in the modules that use them. The retained code is byte-for-byte the original logic.
/// Comment-202608245 applies to the modules.
/// [/Comment-202608244]
abstract contract BiddingCommonV3Core is CosmicSignatureGameStorageV3Core {
	modifier _onlyNonFirstRound() {
		_checkNonFirstRound();
		_;
	}

	function _checkNonFirstRound() internal view {
		// Comment-202605294 applies.
		// #enable_asserts assert(roundNum > 0);
	}

	modifier _onlyRoundIsInactive() {
		_checkRoundIsInactive();
		_;
	}

	function _checkRoundIsInactive() internal view {
		uint256 roundActivationTimeCopy_ = roundActivationTime;
		if ( ! (block.timestamp < roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsActive("The current bidding round is already active.", roundActivationTimeCopy_, block.timestamp);
		}
	}

	modifier _onlyRoundIsActive() {
		_checkRoundIsActive();
		_;
	}

	function _checkRoundIsActive() internal view {
		uint256 roundActivationTimeCopy_ = roundActivationTime;
		if ( ! (block.timestamp >= roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsInactive("The current bidding round is not active yet.", roundActivationTimeCopy_, block.timestamp);
		}
	}

	/// @notice Comment-202503108 applies.
	modifier _onlyBeforeBidPlacedInRound() {
		_checkBeforeBidPlacedInRound();
		_;
	}

	/// @notice Comment-202503108 applies.
	function _checkBeforeBidPlacedInRound() internal view {
		if ( ! (lastBidderAddress == address(0)) ) {
			revert CosmicSignatureErrors.BidHasBeenPlacedInCurrentRound("A bid has already been placed in the current bidding round.");
		}
	}

	/// @dev In the original `BiddingCommonV2`, this is `public`. Comment-202608244 applies.
	function getDurationElapsedSinceRoundActivation() internal view returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationElapsedSinceRoundActivation_ = int256(block.timestamp) - int256(roundActivationTime);
			return durationElapsedSinceRoundActivation_;
		}
	}
}
