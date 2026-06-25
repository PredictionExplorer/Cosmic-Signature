// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { SystemManagementV2 } from "./SystemManagementV2.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { ISystemEventsV3 } from "./interfaces/ISystemEventsV3.sol";
import { ISystemManagementV3 } from "./interfaces/ISystemManagementV3.sol";

abstract contract SystemManagementV3 is
	SystemManagementV2,
	CosmicSignatureGameStorageV3Base,
	ISystemEventsV3,
	ISystemManagementV3 {
	function setMainPrizeNumCosmicSignatureNfts(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		mainPrizeNumCosmicSignatureNfts = newValue_;
		emit MainPrizeNumCosmicSignatureNftsChanged(newValue_);
	}
}
