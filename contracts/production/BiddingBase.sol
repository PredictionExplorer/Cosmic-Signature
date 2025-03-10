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

	function _setRoundActivationTime(uint256 newValue_) internal {
		roundActivationTime = newValue_;

		// // [Comment-202411168]
		// // One might want to ensure that this is not in the past.
		// // But `roundActivationTime` is really not supposed to be in the past.
		// // So keeping it simple and effiicient.
		// // But since we now require the first bid to be ETH, we no longer need to do this.
		// // todo-1 Find all "cstDutchAuctionBeginningTimeStamp" (not whole word, case insensitive)
		// // todo-1 and possibly write a note like the above in other similar places.
		// // todo-1 Maybe write a comment near "cstDutchAuctionBeginningTimeStamp" and reference it.
		// // todo-1 Or just delete all this garbage?
		// // [/Comment-202411168]
		// cstDutchAuctionBeginningTimeStamp = newValue_;

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
