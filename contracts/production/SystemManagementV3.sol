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

	function setCstBidPriceDeclineMultiplier(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive _providedValueIsNonZero(newValue_) {
		cstBidPriceDeclineMultiplier = newValue_;
		emit CstBidPriceDeclineMultiplierChanged(newValue_);
	}

	function setCstBidPriceDeclineMultiplierChangeDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive _providedValueIsNonZero(newValue_) {
		cstBidPriceDeclineMultiplierChangeDivisor = newValue_;
		emit CstBidPriceDeclineMultiplierChangeDivisorChanged(newValue_);
	}

	function setRoundLateBidDurationDivisor(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive _providedValueIsNonZero(newValue_) {
		roundLateBidDurationDivisor = newValue_;
		emit RoundLateBidDurationDivisorChanged(newValue_);
	}

	/// @dev A zero is a valid value here. It disables the round late bid price premium.
	/// Comment-202608171 relates.
	function setRoundLateBidPricePremiumAmountBaseMultiplier(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive {
		roundLateBidPricePremiumAmountBaseMultiplier = newValue_;
		emit RoundLateBidPricePremiumAmountBaseMultiplierChanged(newValue_);
	}

	function setRoundLateBidPricePremiumAmountExponent(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive _providedValueIsNonZero(newValue_) {
		roundLateBidPricePremiumAmountExponent = newValue_;
		emit RoundLateBidPricePremiumAmountExponentChanged(newValue_);
	}

	function setMainPrizeNumCosmicSignatureNfts(uint256 newValue_) external override onlyOwner _onlyRoundIsInactive _providedValueIsNonZero(newValue_) {
		mainPrizeNumCosmicSignatureNfts = newValue_;
		emit MainPrizeNumCosmicSignatureNftsChanged(newValue_);
	}

	/// @notice
	/// [Comment-202608171]
	/// In V3+, configuration setters whose parameter a zero value would misconfigure in a dangerous way
	/// reject a zero.
	/// `mainPrizeNumCosmicSignatureNfts == 0` would make `claimMainPrize` revert with `Panic(0x11)`.
	/// Because both this setter and `_authorizeUpgrade` require an inactive bidding round,
	/// a round in which a bid has already been placed would be impossible to complete or repair,
	/// so the Game would be bricked permanently.
	/// A zero `roundLateBidDurationDivisor`, `cstBidPriceDeclineMultiplier`, or
	/// `cstBidPriceDeclineMultiplierChangeDivisor` would make bid price calculations and/or bid placements
	/// revert with `Panic(0x12)` until the value is repaired after the current bidding round completes.
	/// A zero `roundLateBidPricePremiumAmountExponent` would make the premium equal the whole bid price,
	/// effectively doubling it, which is likely not what the contract owner intends.
	/// Other configuration setters, including those inherited from `SystemManagementV2`, keep accepting any value.
	/// A zero `roundLateBidPricePremiumAmountBaseMultiplier` and a zero `bidCstRewardAmountMultiplier` remain valid,
	/// as they disable the respective features without breaking anything.
	/// Comment-202608177 relates.
	/// [/Comment-202608171]
	modifier _providedValueIsNonZero(uint256 value_) {
		if ( ! (value_ > 0) ) {
			revert CosmicSignatureErrors.ZeroValue();
		}
		_;
	}
}
