// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IAddressValidator } from "../../production/interfaces/IAddressValidator.sol";
import { ICosmicSignatureGameStorage } from "../../production/interfaces/ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "../../production/interfaces/IBiddingBase.sol";
import { IMainPrizeBase } from "../../production/interfaces/IMainPrizeBase.sol";
import { ISystemManagement } from "../../production/interfaces/ISystemManagement.sol";
import { IEthDonations } from "../../production/interfaces/IEthDonations.sol";
import { INftDonations } from "../../production/interfaces/INftDonations.sol";
import { IBidStatistics } from "../../production/interfaces/IBidStatistics.sol";
import { IBidding } from "../../production/interfaces/IBidding.sol";
import { ISecondaryPrizes } from "../../production/interfaces/ISecondaryPrizes.sol";
import { IMainPrize } from "../../production/interfaces/IMainPrize.sol";

/// @notice These are prototype interface and contract to upgrade `CosmicSignatureGame` to.
interface ICosmicSignatureGameOpenBid is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	IBiddingBase,
	IMainPrizeBase,
	ISystemManagement,
	IEthDonations,
	INftDonations,
	IBidStatistics,
	IBidding,
	ISecondaryPrizes,
	IMainPrize {
	// /// @notice See also: `IBidding.receive`.
	// /// @dev It appears that we don't need this.
	// fallback() external payable;

	/// @notice Makes new initializations after an upgrade.
	/// This method is called on the proxy contract right after deployment of the new implementation contract.
	/// Comment-202503119 applies.
	function initialize2() external;
}
