// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { CosmicSignatureGameStorageV2Base } from "./CosmicSignatureGameStorageV2Base.sol";
import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { MainPrizeCommonV2 } from "./MainPrizeCommonV2.sol";
import { SystemManagementV2 } from "./SystemManagementV2.sol";
import { EthDonationsV2 } from "./EthDonationsV2.sol";
import { NftDonationsV2 } from "./NftDonationsV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { SecondaryPrizesV2 } from "./SecondaryPrizesV2.sol";
import { MainPrizeV2Base } from "./MainPrizeV2Base.sol";
import { ICosmicSignatureGameV2 } from "./interfaces/ICosmicSignatureGameV2.sol";

// #endregion
// #region

abstract contract CosmicSignatureGameV2Base is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	AddressValidator,
	CosmicSignatureGameStorageV2Base,
	BiddingCommonV2,
	MainPrizeCommonV2,
	SystemManagementV2,
	EthDonationsV2,
	NftDonationsV2,
	BidStatisticsV2,
	BiddingV2Base,
	SecondaryPrizesV2,
	MainPrizeV2Base,
	ICosmicSignatureGameV2 {
	// #region `constructor`

	/// @notice Constructor.
	/// Comment-202503121 applies.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV2Base.constructor");
		_disableInitializers();
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert ("Method does not exist.");
	// }

	// #endregion
	// #region `reinitialize`

	function reinitialize() external virtual;

	// #endregion
	// #region `_onlyIfPrevVersionWasInitialized`

	/// @dev Comment-202606084 relates.
	modifier _onlyIfPrevVersionWasInitialized() {
		_checkIfPrevVersionWasInitialized();
		_;
	}

	// #endregion
	// #region `_checkIfPrevVersionWasInitialized`

	function _checkIfPrevVersionWasInitialized() internal virtual view;

	// #endregion
	// #region `_authorizeUpgrade`

	/// @dev Comment-202412188 applies.
	/// Comment-202606128 relates.
	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner _onlyRoundIsInactive {
		// _providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV2Base._authorizeUpgrade");
	}

	// #endregion
}

// #endregion
