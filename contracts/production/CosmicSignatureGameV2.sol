// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameV2Base } from "./CosmicSignatureGameV2Base.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { BiddingV2 } from "./BiddingV2.sol";
import { MainPrizeV2 } from "./MainPrizeV2.sol";
import { CosmicSignatureGameStorageV2 } from "./CosmicSignatureGameStorageV2.sol";

// #endregion
// #region

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameV2 is
	CosmicSignatureGameV2Base,
	BiddingV2,
	MainPrizeV2,
	CosmicSignatureGameStorageV2 {
	// #region Data.

	uint256 private constant _CONTRACT_VERSION_NUMBER = 2;

	// #endregion
	// #region `reinitialize`

	/// @dev
	/// [Comment-202606128]
	/// `onlyOwner` is unnecessary because the pevious version's `_authorizeUpgrade` has just checked it
	/// within the same transaction.
	/// [/Comment-202606128]
	/// [Comment-202607079]
	/// In V2+, near Comment-202605294, `_onlyNonFirstRound` only asserts a condition.
	/// One might want to fully validate that condition here, but it's really unnecessary,
	/// because it's guaranteed to be `true` in the production.
	/// [/Comment-202607079]
	/// Comment-202606084 relates and/or applies.
	function reinitialize() external override /*virtual*/ /*onlyOwner*/ _onlyNonFirstRound() _onlyIfPrevVersionWasInitialized() reinitializer(uint64(_CONTRACT_VERSION_NUMBER)) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV2.reinitialize");

		cstDutchAuctionDuration = CosmicSignatureConstants.INITIAL_CST_DUTCH_AUCTION_DURATION;
		cstDutchAuctionDurationChangeDivisor = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR;
		bidCstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_RADICAND_MULTIPLIER;
		timeoutDurationToClaimMainPrize = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2;
	}

	// #endregion
	// #region `_checkIfPrevVersionWasInitialized`

	function _checkIfPrevVersionWasInitialized() internal override /*virtual*/ view {
		// Comment-202605294 applies.
		// #enable_asserts bool isSuccess_ = _getInitializedVersion() == uint64(_CONTRACT_VERSION_NUMBER - 1);
		// #enable_asserts assert(isSuccess_);

		// if ( ! isSuccess_ ) {
		// 	revert InvalidInitialization();
		// }
	}

	// #endregion
	// #region Overrides Required By Solidity

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV2) /* virtual */ returns (uint256) {
		return super.getNextCstBidPriceAdvanced(currentTimeOffset_);
	}

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV2) /* virtual */ returns (uint256) {
		return getBidCstRewardAmountAdvanced(currentTimeOffset_);
	}

	// #endregion
}

// #endregion
