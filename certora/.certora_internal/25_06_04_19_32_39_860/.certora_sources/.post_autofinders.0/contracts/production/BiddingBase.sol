// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./interfaces/IBiddingBase.sol";

abstract contract BiddingBase is CosmicSignatureGameStorage, IBiddingBase {
	modifier _onlyRoundIsInactive() {
		_checkRoundIsInactive();
		_;
	}

	function _checkRoundIsInactive() internal view {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01870000, 1037618708871) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01870001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01870004, 0) }
		uint256 roundActivationTimeCopy_ = roundActivationTime;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000e1,roundActivationTimeCopy_)}
		if ( ! (block.timestamp < roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsActive("The current bidding round is already active.", roundActivationTimeCopy_, block.timestamp);
		}
	}

	modifier _onlyRoundIsActive() {
		_checkRoundIsActive();
		_;
	}

	function _checkRoundIsActive() internal view {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01880000, 1037618708872) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01880001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01880004, 0) }
		uint256 roundActivationTimeCopy_ = roundActivationTime;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000e2,roundActivationTimeCopy_)}
		if ( ! (block.timestamp >= roundActivationTimeCopy_) ) {
			revert CosmicSignatureErrors.RoundIsInactive("The current bidding round is not active yet.", roundActivationTimeCopy_, block.timestamp);
		}
	}

	/// @notice Comment-202503108 applies.
	modifier _onlyBeforeBidPlacedInRound() {
		_checkBeforeBidPlacedInRound();
		_;
	}

	/// @notice
	/// [Comment-202503108]
	/// It doesn't matter whether the current bidding round is active or not.
	/// This only requires that no bids have been placed in the current bidding round yet.
	/// [/Comment-202503108]
	function _checkBeforeBidPlacedInRound() internal view {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01890000, 1037618708873) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01890001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01890004, 0) }
		if ( ! (lastBidderAddress == address(0)) ) {
			revert CosmicSignatureErrors.BidHasBeenPlacedInCurrentRound("A bid has already been placed in the current bidding round.");
		}
	}

	function _setRoundActivationTime(uint256 newValue_) internal {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff018a0000, 1037618708874) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff018a0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff018a0005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff018a6000, newValue_) }
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

	function getDurationElapsedSinceRoundActivation() public view override returns (int256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01850000, 1037618708869) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01850001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01850004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationElapsedSinceRoundActivation_ = int256(block.timestamp) - int256(roundActivationTime);
			return durationElapsedSinceRoundActivation_;
		}
	}
}
