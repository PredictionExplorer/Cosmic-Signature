// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./interfaces/IBiddingBase.sol";

/// @title BiddingBase
/// @author Cosmic Signature Team
/// @notice Provides base modifiers and helper functions for bidding round status checks.
/// @dev This abstract contract contains modifiers that enforce bidding round state requirements:
/// - `_onlyNonFirstRound`: Ensures operation is not on the first round.
/// - `_onlyRoundIsInactive`: Ensures the current bidding round has not started yet.
/// - `_onlyRoundIsActive`: Ensures the current bidding round is active.
/// - `_onlyBeforeBidPlacedInRound`: Ensures no bids have been placed in the current round.
///
/// It also provides internal setters for round-related parameters that emit events.
abstract contract BiddingBase is CosmicSignatureGameStorage, IBiddingBase {
	// #region Modifiers and Checks

	/// @dev Modifier that ensures the current round is not the first (round 0).
	modifier _onlyNonFirstRound() {
		_checkNonFirstRound();
		_;
	}

	/// @dev Reverts if the current round is the first bidding round.
	function _checkNonFirstRound() internal view {
		if ( ! (roundNum > 0) ) {
			revert CosmicSignatureErrors.FirstRound("This operation is invalid during the very first bidding round.");
		}
	}

	/// @dev Modifier that ensures the current bidding round has not yet activated.
	modifier _onlyRoundIsInactive() {
		_checkRoundIsInactive();
		_;
	}

	/// @dev Reverts if the current bidding round is already active (current time >= activation time).
	function _checkRoundIsInactive() internal view {
		uint256 roundActivationTimeCopy_ = roundActivationTime;
		if ( ! (block.timestamp < roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsActive("The current bidding round is already active.", roundActivationTimeCopy_, block.timestamp);
		}
	}

	/// @dev Modifier that ensures the current bidding round is active.
	modifier _onlyRoundIsActive() {
		_checkRoundIsActive();
		_;
	}

	/// @dev Reverts if the current bidding round is not yet active (current time < activation time).
	function _checkRoundIsActive() internal view {
		uint256 roundActivationTimeCopy_ = roundActivationTime;
		if ( ! (block.timestamp >= roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsInactive("The current bidding round is not active yet.", roundActivationTimeCopy_, block.timestamp);
		}
	}

	/// @dev Modifier that ensures no bids have been placed in the current round yet.
	/// Comment-202503108 applies.
	modifier _onlyBeforeBidPlacedInRound() {
		_checkBeforeBidPlacedInRound();
		_;
	}

	/// @dev Reverts if a bid has already been placed in the current bidding round.
	/// [Comment-202503108]
	/// It doesn't matter whether the current bidding round is active or not.
	/// This only requires that no bids have been placed in the current bidding round yet.
	/// [/Comment-202503108]
	function _checkBeforeBidPlacedInRound() internal view {
		if ( ! (lastBidderAddress == address(0)) ) {
			revert CosmicSignatureErrors.BidHasBeenPlacedInCurrentRound("A bid has already been placed in the current bidding round.");
		}
	}

	// #endregion
	// #region Internal Setters

	/// @dev Sets the round activation time and emits an event.
	/// @param newValue_ The new round activation timestamp.
	function _setRoundActivationTime(uint256 newValue_) internal {
		roundActivationTime = newValue_;
		emit RoundActivationTimeChanged(newValue_);
	}

	/// @dev Sets the ETH Dutch auction duration divisor and emits an event.
	/// @param newValue_ The new divisor value.
	function _setEthDutchAuctionDurationDivisor(uint256 newValue_) internal {
		ethDutchAuctionDurationDivisor = newValue_;
		emit EthDutchAuctionDurationDivisorChanged(newValue_);
	}

	/// @dev Sets the ETH Dutch auction ending bid price divisor and emits an event.
	/// @param newValue_ The new divisor value.
	function _setEthDutchAuctionEndingBidPriceDivisor(uint256 newValue_) internal {
		ethDutchAuctionEndingBidPriceDivisor = newValue_;
		emit EthDutchAuctionEndingBidPriceDivisorChanged(newValue_);
	}

	// #endregion
	// #region View Functions

	/// @inheritdoc IBiddingBase
	function getDurationUntilRoundActivation() external view override returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilRoundActivation_ = ( - getDurationElapsedSinceRoundActivation() );
			return durationUntilRoundActivation_;
		}
	}

	/// @inheritdoc IBiddingBase
	function getDurationElapsedSinceRoundActivation() public view override returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationElapsedSinceRoundActivation_ = int256(block.timestamp) - int256(roundActivationTime);
			return durationElapsedSinceRoundActivation_;
		}
	}

	// #endregion
}
