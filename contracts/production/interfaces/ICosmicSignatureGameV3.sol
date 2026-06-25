// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBaseV2 } from "./IBiddingBaseV2.sol";
import { IMainPrizeBaseV2 } from "./IMainPrizeBaseV2.sol";
import { ISystemManagementV2 } from "./ISystemManagementV2.sol";
import { IEthDonations } from "./IEthDonations.sol";
import { INftDonations } from "./INftDonations.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { IBiddingV3 } from "./IBiddingV3.sol";
import { ISecondaryPrizes } from "./ISecondaryPrizes.sol";
import { IMainPrizeV2 } from "./IMainPrizeV2.sol";

interface ICosmicSignatureGameV3 is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	IBiddingBaseV2,
	IMainPrizeBaseV2,
	ISystemManagementV2,
	IEthDonations,
	INftDonations,
	IBidStatistics,
	IBiddingV3,
	ISecondaryPrizes,
	IMainPrizeV2 {
	/// @notice Makes additional initializations after a V2 to V3 upgrade.
	function initializeV3() external;
}
