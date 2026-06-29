// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { ICosmicSignatureGameV2 } from "./interfaces/ICosmicSignatureGameV2.sol";

// #endregion
// #region

abstract contract CosmicSignatureGameV2Base is
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	BiddingCommonV2,
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
