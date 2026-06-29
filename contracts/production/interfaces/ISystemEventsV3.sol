// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ISystemEventsV2 } from "./ISystemEventsV2.sol";

/// @title Cosmic Signature Game V3 Configuration Events.
/// @author The Cosmic Signature Development Team.
/// @notice Comment-202605235 applies.
interface ISystemEventsV3 is ISystemEventsV2 {
	/// @notice Emitted when `mainPrizeNumCosmicSignatureNfts` is changed.
	/// @param newValue The new value.
	event MainPrizeNumCosmicSignatureNftsChanged(uint256 newValue);
}
