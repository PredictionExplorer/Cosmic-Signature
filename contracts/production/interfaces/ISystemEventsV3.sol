// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ISystemEventsV2 } from "./ISystemEventsV2.sol";

/// @title Cosmic Signature Game V3 Configuration Events.
/// @author The Cosmic Signature Development Team.
/// @notice Comment-202605235 applies.
interface ISystemEventsV3 is ISystemEventsV2 {
	/// @notice Emitted when `cstBidPriceDeclineMultiplier` is changed.
	/// todo-0 Comment-202606099 applies. Where else it's referenced?
	/// todo-0 Actually that comment is talking about `cstDutchAuctionDuration`, so it relates here.
	/// todo-0 So write another numbered comment and cross-ref them.
	/// @param newValue The new value.
	event CstBidPriceDeclineMultiplierChanged(uint256 newValue);

	/// @notice Emitted when `cstBidPriceDeclineMultiplierChangeDivisor` is changed.
	/// @param newValue The new value.
	event CstBidPriceDeclineMultiplierChangeDivisorChanged(uint256 newValue);

	/// @notice Emitted when `roundLateBidDurationDivisor` is changed.
	/// @param newValue The new value.
	event RoundLateBidDurationDivisorChanged(uint256 newValue);

	/// @notice Emitted when `roundLateBidPricePremiumAmountBaseMultiplier` is changed.
	/// @param newValue The new value.
	event RoundLateBidPricePremiumAmountBaseMultiplierChanged(uint256 newValue);

	/// @notice Emitted when `roundLateBidPricePremiumAmountExponent` is changed.
	/// @param newValue The new value.
	event RoundLateBidPricePremiumAmountExponentChanged(uint256 newValue);

	/// @notice Emitted when `mainPrizeNumCosmicSignatureNfts` is changed.
	/// @param newValue The new value.
	event MainPrizeNumCosmicSignatureNftsChanged(uint256 newValue);
}
