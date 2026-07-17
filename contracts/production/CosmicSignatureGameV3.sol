// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameV2Base } from "./CosmicSignatureGameV2Base.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { SystemManagementV3 } from "./SystemManagementV3.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BidStatisticsV3 } from "./BidStatisticsV3.sol";
import { BiddingV2 } from "./BiddingV2.sol";
import { BiddingV3 } from "./BiddingV3.sol";
import { MainPrizeV3 } from "./MainPrizeV3.sol";
import { CosmicSignatureGameStorageV3 } from "./CosmicSignatureGameStorageV3.sol";

// #endregion
// #region

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameV3 is
	CosmicSignatureGameV2Base,
	CosmicSignatureGameStorageV3Base,
	SystemManagementV3,
	BidStatisticsV3,
	BiddingV3,
	MainPrizeV3,
	CosmicSignatureGameStorageV3 {
	// #region Data.

	uint256 private constant _CONTRACT_VERSION_NUMBER = 3;

	// #endregion
	// #region `reinitialize`

	/// @dev Comment-202606128 applies
	/// Comment-202607079 applies.
	/// Comment-202606084 relates and/or applies.
	function reinitialize() external override /*virtual*/ /*onlyOwner*/ _onlyNonFirstRound() _onlyIfPrevVersionWasInitialized() reinitializer(uint64(_CONTRACT_VERSION_NUMBER)) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV3.reinitialize");

		roundLateBidDurationDivisor = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR;
		roundLateBidPricePremiumAmountBaseMultiplier = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER;
		roundLateBidPricePremiumAmountExponent = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT;
		bidCstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;
		lastBidderBidCstRewardAmountPercentage = CosmicSignatureConstants.DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE;
		mainPrizeNumCosmicSignatureNfts = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS;
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

	function _saveChampionDurations() internal override (BidStatisticsV2, BidStatisticsV3, MainPrizeV3) /* virtual */ {
		super._saveChampionDurations();
	}

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2, BiddingV3) /* virtual */ returns (uint256) {
		return super.getNextEthBidPriceAdvanced(currentTimeOffset_);
	}

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2, BiddingV3) /* virtual */ returns (uint256) {
		return super.getNextCstBidPriceAdvanced(currentTimeOffset_);
	}

	function getCstDutchAuctionDurations() public view override (BiddingV2, BiddingV3) /* virtual */ returns (uint256, int256) {
		return super.getCstDutchAuctionDurations();
	}

	function _getCstDutchAuctionBeginningBidPriceMinLimit() internal view override (BiddingV2, BiddingV3) /* virtual */ returns (uint256) {
		return super._getCstDutchAuctionBeginningBidPriceMinLimit();
	}

	function _updateCstDutchAuctionOnEthBid() internal view override (BiddingV2, BiddingV3) /* virtual */ returns (uint256) {
		return super._updateCstDutchAuctionOnEthBid();
	}

	function _updateCstDutchAuctionOnCstBid() internal view override (BiddingV2, BiddingV3) /* virtual */ returns (uint256) {
		return super._updateCstDutchAuctionOnCstBid();
	}

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (BiddingV2, BiddingV3) /* virtual */ returns (uint256) {
		return super.getBidCstRewardAmountAdvanced(currentTimeOffset_);
	}

	function _mintBidCstRewardAmountIfNeeded(uint256 bidCstRewardAmount_) internal override (BiddingV2, BiddingV3) /* virtual */ {
		super._mintBidCstRewardAmountIfNeeded(bidCstRewardAmount_);
	}

	function _burnCstBidPriceAndMintBidCstRewardAmountIfNeeded(uint256 cstBidPrice_, uint256 bidCstRewardAmount_) internal override (BiddingV2, BiddingV3) /* virtual */ {
		super._burnCstBidPriceAndMintBidCstRewardAmountIfNeeded(cstBidPrice_, bidCstRewardAmount_);
	}

	// #endregion
}

// #endregion
