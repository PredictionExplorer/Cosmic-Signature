// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
// import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
// import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { CosmicSignatureGameStorageV3 } from "./CosmicSignatureGameStorageV3.sol";
// import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { CosmicSignatureGameV2Base } from "./CosmicSignatureGameV2Base.sol";
import { MainPrizeCommonV2 } from "./MainPrizeCommonV2.sol";
import { SystemManagementV3 } from "./SystemManagementV3.sol";
import { EthDonationsV2 } from "./EthDonationsV2.sol";
import { NftDonationsV2 } from "./NftDonationsV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BiddingV3 } from "./BiddingV3.sol";
import { SecondaryPrizesV2 } from "./SecondaryPrizesV2.sol";
import { MainPrizeV3 } from "./MainPrizeV3.sol";

// #endregion
// #region

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameV3 is
	ReentrancyGuardTransientUpgradeable,
	// OwnableUpgradeableWithReservedStorageGaps,
	// UUPSUpgradeable,
	AddressValidator,
	CosmicSignatureGameStorageV3,
	// BiddingCommonV2,
	CosmicSignatureGameV2Base,
	MainPrizeCommonV2,
	SystemManagementV3,
	EthDonationsV2,
	NftDonationsV2,
	BidStatisticsV2,
	BiddingV3,
	SecondaryPrizesV2,
	MainPrizeV3 {
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
		bidCstRewardAmountPerMinute = CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_PER_MINUTE;
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
}

// #endregion
