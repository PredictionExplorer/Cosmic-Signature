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
		// // #enable_asserts // #disable_smtchecker console.log("2 constructor");
		_disableInitializers();
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert ("Method does not exist.");
	// }

	// #endregion
	// #region `initializeV2`

	function initializeV2() external override /*onlyOwner*/ reinitializer(2) _onlyNonFirstRound() {
		// // #enable_asserts // #disable_smtchecker console.log("2 initializeV2");

		// Comment-202503119 applies.
		// #enable_asserts assert(owner() != address(0));

		// [Comment-202606021]
		// `initializeV2` is supposed to not be executed yet.
		// [/Comment-202606021]
		// [Comment-202606024]
		// Issue. This assertion will fail if the owner changed this variable.
		// [/Comment-202606024]
		// #enable_asserts assert(bidCstRewardAmountMultiplier == CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT);

		bidCstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;
	}

	// #endregion
	// #region `_authorizeUpgrade`

	/// @dev Comment-202412188 applies.
	function _authorizeUpgrade(address newImplementationAddress_) internal view override
		// Comment-202503119 applies.
		// Comment-202510114 applies.
		onlyOwner

		_onlyRoundIsInactive {
		// _providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("2 _authorizeUpgrade");

		// [Comment-202606022]
		// `initializeV2` is supposed to be already executed.
		// [/Comment-202606022]
		// Comment-202606024 applies.
		// #enable_asserts assert(bidCstRewardAmountMultiplier == CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER);
	}

	// #endregion
}

// #endregion
