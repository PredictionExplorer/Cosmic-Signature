// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "../production/OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
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
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameOpenBid.constructor");
		_disableInitializers();
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert ("Method does not exist.");
	// }

	// #endregion
	// #region `initializeV2`

	/// @dev Comment-202606128 applies.
	/// [Comment-202606084]
	/// Calling `_getInitializedVersion` like this allows `CosmicSignatureGameOpenBid` to be deployed as V2, V3,
	/// or any other version.
	/// Issue. But it's a bad idea to do this in a production contract.
	/// Instead, hardcode a specific version number after validating the already initialized version number
	/// with a modifier like `_onlyIfPrevVersionWasInitialized`.
	/// But if you decide to use this code pattern, it will be up to the contract owner performing the upgrade to not break things.
	/// Comment-202606126 relates.
	/// [/Comment-202606084]
	function initializeV2() external override /*onlyOwner*/ reinitializer(uint64(uint256(_getInitializedVersion()) + 1)) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameOpenBid.initializeV2");

		// Normally, `reinitializer` prevents a redundant initialization, but we disabled that validation near Comment-202606084.
		if ( ! (timesEthBidPrice == 0) ) {
			revert InvalidInitialization();
		}

		timesEthBidPrice = 3;
	}

	// #endregion
	// #region `_authorizeUpgrade`

	/// @dev Comment-202412188 applies.
	/// Comment-202606128 relates.
	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner _onlyRoundIsInactive {
		// _providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameOpenBid._authorizeUpgrade");
	}

	// #endregion
}

// #endregion
