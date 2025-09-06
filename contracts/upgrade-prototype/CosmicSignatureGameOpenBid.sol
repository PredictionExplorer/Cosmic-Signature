// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "../production/OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { AddressValidator } from "../production/AddressValidator.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { BiddingBase } from "../production/BiddingBase.sol";
import { MainPrizeBase } from "../production/MainPrizeBase.sol";
import { SystemManagement } from "../production/SystemManagement.sol";
import { EthDonations } from "../production/EthDonations.sol";
import { NftDonations } from "../production/NftDonations.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { BiddingOpenBid } from "./BiddingOpenBid.sol";
import { SecondaryPrizes } from "../production/SecondaryPrizes.sol";
import { MainPrize } from "../production/MainPrize.sol";
import { ICosmicSignatureGameOpenBid } from "./interfaces/ICosmicSignatureGameOpenBid.sol";

// #endregion
// #region

/// todo-1 +++ Compare both open-bid source files to their non-open-bid counterparts.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameOpenBid is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	AddressValidator,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	SystemManagement,
	EthDonations,
	NftDonations,
	BidStatistics,
	BiddingOpenBid,
	SecondaryPrizes,
	MainPrize,
	ICosmicSignatureGameOpenBid {
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
	// #region `initialize2`

	function initialize2() external override /*onlyOwner*/ reinitializer(2) {
		// // #enable_asserts // #disable_smtchecker console.log("2 initialize2");

		// Comment-202503119 applies.
		// #enable_asserts assert(owner() != address(0));

		// `initialize2` is supposed to not be executed yet.
		// #enable_asserts assert(timesEthBidPrice == 0);

		timesEthBidPrice = 3;
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

		// `initialize2` is supposed to be already executed.
		// #enable_asserts assert(timesEthBidPrice > 0);
	}

	// #endregion
}

// #endregion
