// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { SystemManagementV2 } from "./SystemManagementV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { CosmicSignatureGameV2Base } from "./CosmicSignatureGameV2Base.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { SystemManagementV3 } from "./SystemManagementV3.sol";
import { BidStatisticsV3 } from "./BidStatisticsV3.sol";
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

		// championDurations =
		cstDutchAuctionBeginningBidPriceMinLimit = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3;
		cstBidPriceDeclineMultiplier = CosmicSignatureConstants.INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER;
		cstBidPriceDeclineMultiplierChangeDivisor = CosmicSignatureConstants.DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR;
		roundLateBidDurationDivisor = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR;
		roundLateBidPricePremiumAmountBaseMultiplier = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER;
		roundLateBidPricePremiumAmountExponent = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT;
		bidCstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;
		chronoWarriorEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3;
		raffleTotalEthPrizeAmountForBiddersPercentage = CosmicSignatureConstants.DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3;
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage = CosmicSignatureConstants.DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3;
		mainEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3;
		mainPrizeNumCosmicSignatureNfts = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS;
		charityEthDonationAmountPercentage = CosmicSignatureConstants.DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3;
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

	function setCstDutchAuctionDuration(uint256 newValue_) /* external */ public override (SystemManagementV2, SystemManagementV3) /* virtual */ {
		super.setCstDutchAuctionDuration(newValue_);
	}

	function setCstDutchAuctionDurationChangeDivisor(uint256 newValue_) /* external */ public override (SystemManagementV2, SystemManagementV3) /* virtual */ {
		super.setCstDutchAuctionDurationChangeDivisor(newValue_);
	}

	function _saveChampionDurations() internal override (BidStatisticsV2, BidStatisticsV3, MainPrizeV3) /* virtual */ {
		super._saveChampionDurations();
	}

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) /* virtual */ returns (uint256) {
		return super.getNextEthBidPriceAdvanced(currentTimeOffset_);
	}

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) /* virtual */ returns (uint256) {
		return super.getNextCstBidPriceAdvanced(currentTimeOffset_);
	}

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) /* virtual */ returns (uint256) {
		return super.getBidCstRewardAmountAdvanced(currentTimeOffset_);
	}

	// #endregion
}

// #endregion
