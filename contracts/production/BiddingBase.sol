// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./interfaces/IBiddingBase.sol";

abstract contract BiddingBase is CosmicSignatureGameStorage, IBiddingBase {
	modifier _onlyRoundIsInactive() {
		uint256 roundActivationTimeCopy_ = roundActivationTime;
		if ( ! (block.timestamp < roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsActive("The current bidding round is already active.", roundActivationTimeCopy_, block.timestamp);
		}
		_;
	}

	modifier _onlyRoundIsActive() {
		uint256 roundActivationTimeCopy_ = roundActivationTime;
		if ( ! (block.timestamp >= roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsInactive("The current bidding round is not active yet.", roundActivationTimeCopy_, block.timestamp);
		}
		_;
	}

	/// @notice
	/// [Comment-202503108]
	/// It doesn't matter whether the current bidding round is active or not.
	/// This only requires that no bids have been placed in the current bidding round yet.
	/// [/Comment-202503108]
	modifier _noBidsPlacedInCurrentRound() {
		if ( ! (lastBidderAddress == address(0)) ) {
			revert CosmicSignatureErrors.BidHasBeenPlacedInCurrentRound("A bid has already been placed in the current bidding round.");
		}
		_;
	}

	function _setRoundActivationTime(uint256 newValue_) internal {
		roundActivationTime = newValue_;
		emit RoundActivationTimeChanged(newValue_);
	}

	function getDurationUntilRoundActivation() external view override returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilRoundActivation_ = ( - getDurationElapsedSinceRoundActivation() );
			return durationUntilRoundActivation_;
		}
	}

	function getDurationElapsedSinceRoundActivation() public view override returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationElapsedSinceRoundActivation_ = int256(block.timestamp) - int256(roundActivationTime);
			return durationElapsedSinceRoundActivation_;
		}
	}
}
