// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBaseV2 } from "./IBiddingBaseV2.sol";
import { IMainPrizeBaseV2 } from "./IMainPrizeBaseV2.sol";
import { ISystemManagementV2 } from "./ISystemManagementV2.sol";
import { IEthDonations } from "./IEthDonations.sol";
import { INftDonations } from "./INftDonations.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { IBiddingV2 } from "./IBiddingV2.sol";
import { ISecondaryPrizes } from "./ISecondaryPrizes.sol";
import { IMainPrizeV2 } from "./IMainPrizeV2.sol";

/// @title The Cosmic Signature Game.
/// @author The Cosmic Signature Development Team.
/// @notice Comment-202606014 applies.
/// @dev Comment-202606017 applies.
interface ICosmicSignatureGameV2 is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	IBiddingBaseV2,
	IMainPrizeBaseV2,
	ISystemManagementV2,
	IEthDonations,
	INftDonations,
	IBidStatistics,
	IBiddingV2,
	ISecondaryPrizes,
	IMainPrizeV2 {
	// /// @notice See also: `IBiddingV2.receive`.
	// /// @dev It appears that we don't need this.
	// fallback() external payable;

	/// @notice
	/// [Comment-202606018]
	/// Makes additional initializations after an upgrade.
	/// This method is called on the proxy contract right after deployment of the new implementation contract.
	/// [/Comment-202606018]
	function initializeV2() external;
}
