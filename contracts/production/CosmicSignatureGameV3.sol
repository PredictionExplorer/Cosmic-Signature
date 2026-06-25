// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { MainPrizeV2 } from "./MainPrizeV2.sol";
import { CosmicSignatureGameV2 } from "./CosmicSignatureGameV2.sol";
import { CosmicSignatureGameStorageV3 } from "./CosmicSignatureGameStorageV3.sol";
import { SystemManagementV3 } from "./SystemManagementV3.sol";
import { MainPrizeV3 } from "./MainPrizeV3.sol";

// #endregion
// #region

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameV3 is
	CosmicSignatureGameV2,
	CosmicSignatureGameStorageV3,
	SystemManagementV3,
	MainPrizeV3 {
	// #region `reinitialize`

	/// @dev Comment-202606128 applies
	/// Comment-202607079 applies.
	/// Comment-202606084 relates and/or applies.
	function reinitialize() external override virtual /*onlyOwner*/ _onlyNonFirstRound() _onlyIfPrevVersionWasInitialized() reinitializer(uint64(3)) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV3.reinitialize");

		mainPrizeNumCosmicSignatureNfts = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS;
	}

	// #endregion
	// #region `_checkIfPrevVersionWasInitialized`

	function _checkIfPrevVersionWasInitialized() internal override virtual view {
		// Comment-202605294 applies.
		// #enable_asserts bool isSuccess_ = _getInitializedVersion() == uint64(2);
		// #enable_asserts assert(isSuccess_);

		// if ( ! isSuccess_ ) {
		// 	revert InvalidInitialization();
		// }
	}

	// #endregion
	// #region Overrides Required By Solidity

	function _distributePrizes() internal override (MainPrizeV2, MainPrizeV3) virtual {
		super._distributePrizes();
	}

	// #endregion
}

// #endregion
