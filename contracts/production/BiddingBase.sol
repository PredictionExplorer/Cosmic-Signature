// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./interfaces/IBiddingBase.sol";

abstract contract BiddingBase is CosmicSignatureGameStorage, IBiddingBase {
	/// @dev todo-1 Rename to use the word "round".
	modifier onlyInactive() {
		uint256 activationTimeCopy_ = activationTime;
		require(
			block.timestamp < activationTimeCopy_,
			CosmicSignatureErrors.SystemIsActive("The current bidding round is already active.", activationTimeCopy_, block.timestamp)
		);
		_;
	}

	/// @dev todo-1 Rename to use the word "round".
	modifier onlyActive() {
		uint256 activationTimeCopy_ = activationTime;
		require(
			block.timestamp >= activationTimeCopy_,
			CosmicSignatureErrors.SystemIsInactive("The current bidding round is not active yet.", activationTimeCopy_, block.timestamp)
		);
		_;
	}

	function _setActivationTime(uint256 newValue_) internal {
		activationTime = newValue_;

		// // [Comment-202411168]
		// // One might want to ensure that this is not in the past.
		// // But `activationTime` is really not supposed to be in the past.
		// // So keeping it simple and effiicient.
		// // [/Comment-202411168]
		// cstDutchAuctionBeginningTimeStamp = newValue_;

		emit ActivationTimeChanged(newValue_);
	}

	function getDurationUntilActivation() public view override returns(int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilActivation_ = ( - getDurationElapsedSinceActivation() );
			return durationUntilActivation_;
		}
	}

	function getDurationElapsedSinceActivation() public view override returns(int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationElapsedSinceActivation_ = int256(block.timestamp) - int256(activationTime);
			return durationElapsedSinceActivation_;
		}
	}
}
