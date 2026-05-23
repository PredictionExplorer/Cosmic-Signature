// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorageV2 } from "./CosmicSignatureGameStorageV2.sol";
import { IBiddingBaseV2 } from "./interfaces/IBiddingBaseV2.sol";

abstract contract BiddingBaseV2 is CosmicSignatureGameStorageV2, IBiddingBaseV2 {
	modifier _onlyNonFirstRound() {
		_checkNonFirstRound();
		_;
	}

	function _checkNonFirstRound() internal view {
		// [Comment-202605294]
		// In V2+, this is guaranteed, so it's unnecessary to check this.
		// [/Comment-202605294]
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

	function _setRoundActivationTime(uint256 newValue_) internal {
		roundActivationTime = newValue_;
		emit RoundActivationTimeChanged(newValue_);
	}

	function _setEthDutchAuctionDurationDivisor(uint256 newValue_) internal {
		ethDutchAuctionDurationDivisor = newValue_;
		emit EthDutchAuctionDurationDivisorChanged(newValue_);
	}

	function _setEthDutchAuctionEndingBidPriceDivisor(uint256 newValue_) internal {
		ethDutchAuctionEndingBidPriceDivisor = newValue_;
		emit EthDutchAuctionEndingBidPriceDivisorChanged(newValue_);
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
