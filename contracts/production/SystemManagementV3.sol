// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ISystemManagementV2, SystemManagementV2 } from "./SystemManagementV2.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { ISystemEventsV3 } from "./interfaces/ISystemEventsV3.sol";
import { ISystemManagementV3 } from "./interfaces/ISystemManagementV3.sol";

abstract contract SystemManagementV3 is
	SystemManagementV2,
	CosmicSignatureGameStorageV3Base,
	ISystemEventsV3,
	ISystemManagementV3 {
	function setCstDutchAuctionDuration(uint256 /* newValue_ */) /* external */ public override (ISystemManagementV2, SystemManagementV2) virtual /* onlyOwner */ /* _onlyRoundIsInactive */ {
		revert CosmicSignatureErrors.NotImplemented();
	}

	function setCstDutchAuctionDurationChangeDivisor(uint256 /* newValue_ */) /* external */ public override (ISystemManagementV2, SystemManagementV2) virtual /* onlyOwner */ /* _onlyRoundIsInactive */ {
		revert CosmicSignatureErrors.NotImplemented();
	}

	function setCstBidPriceDeclineMultiplier(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		cstBidPriceDeclineMultiplier = newValue_;
		emit CstBidPriceDeclineMultiplierChanged(newValue_);
	}

	function setCstBidPriceDeclineMultiplierChangeDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		cstBidPriceDeclineMultiplierChangeDivisor = newValue_;
		emit CstBidPriceDeclineMultiplierChangeDivisorChanged(newValue_);
	}

	function setRoundLateBidDurationDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		roundLateBidDurationDivisor = newValue_;
		emit RoundLateBidDurationDivisorChanged(newValue_);
	}

	function setRoundLateBidPricePremiumAmountBaseMultiplier(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		roundLateBidPricePremiumAmountBaseMultiplier = newValue_;
		emit RoundLateBidPricePremiumAmountBaseMultiplierChanged(newValue_);
	}

	function setRoundLateBidPricePremiumAmountExponent(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		roundLateBidPricePremiumAmountExponent = newValue_;
		emit RoundLateBidPricePremiumAmountExponentChanged(newValue_);
	}

	function setMainPrizeNumCosmicSignatureNfts(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		mainPrizeNumCosmicSignatureNfts = newValue_;
		emit MainPrizeNumCosmicSignatureNftsChanged(newValue_);
	}
}
