// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { CosmicSignatureGameStorageV2 } from "./CosmicSignatureGameStorageV2.sol";
import { BiddingBaseV2 } from "./BiddingBaseV2.sol";
import { MainPrizeBaseV2 } from "./MainPrizeBaseV2.sol";
import { SystemManagementV2 } from "./SystemManagementV2.sol";
import { EthDonationsV2 } from "./EthDonationsV2.sol";
import { NftDonationsV2 } from "./NftDonationsV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BiddingV2 } from "./BiddingV2.sol";
import { SecondaryPrizesV2 } from "./SecondaryPrizesV2.sol";
import { MainPrizeV2 } from "./MainPrizeV2.sol";
import { ICosmicSignatureGameV2 } from "./interfaces/ICosmicSignatureGameV2.sol";

// #endregion
// #region

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameV2 is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	AddressValidator,
	CosmicSignatureGameStorageV2,
	BiddingBaseV2,
	MainPrizeBaseV2,
	SystemManagementV2,
	EthDonationsV2,
	NftDonationsV2,
	BidStatisticsV2,
	BiddingV2,
	SecondaryPrizesV2,
	MainPrizeV2,
	ICosmicSignatureGameV2 {
	// #region `constructor`

	/// @notice Constructor.
	/// Comment-202503121 applies.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV2.constructor");
		_disableInitializers();
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert ("Method does not exist.");
	// }

	// #endregion
	// #region `initializeV2`

	/// @dev
	/// [Comment-202606128]
	/// `onlyOwner` is unnecessary because the pevious version's `_authorizeUpgrade` has just checked it
	/// within the same transaction.
	/// [/Comment-202606128]
	/// In V2+, near Comment-202605294, `_onlyNonFirstRound` only asserts a condition.
	/// One might want to fully validate that condition here, but it's really unnecessary,
	/// because it's guaranteed to be `true` in the production.
	/// Comment-202606084 relates and/or applies.
	function initializeV2() external override /*onlyOwner*/ _onlyNonFirstRound() _onlyIfPrevVersionWasInitialized() reinitializer(uint64(2)) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV2.initializeV2");

		cstDutchAuctionDuration = CosmicSignatureConstants.INITIAL_CST_DUTCH_AUCTION_DURATION;
		cstDutchAuctionDurationChangeDivisor = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR;
		bidCstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;
	}

	// #endregion
	// #region `_onlyIfPrevVersionWasInitialized`

	/// @dev Comment-202606084 relates.
	modifier _onlyIfPrevVersionWasInitialized() {
		_checkIfPrevVersionWasInitialized();
		_;
	}

	// #endregion
	// #region `_checkIfPrevVersionWasInitialized`

	function _checkIfPrevVersionWasInitialized() private view {
		// Comment-202605294 applies.
		// But after V2 this will not be guaranteed.
		// #enable_asserts bool isSuccess_ = _getInitializedVersion() == uint64(1);
		// #enable_asserts assert(isSuccess_);

		// if ( ! isSuccess_ ) {
		// 	revert InvalidInitialization();
		// }
	}

	// #endregion
	// #region `_authorizeUpgrade`

	/// @dev Comment-202412188 applies.
	/// Comment-202606128 relates.
	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner _onlyRoundIsInactive {
		// _providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV2._authorizeUpgrade");
	}

	// #endregion
}

// #endregion
