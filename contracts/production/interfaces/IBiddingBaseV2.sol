// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEventsV2 } from "./ISystemEventsV2.sol";

interface IBiddingBaseV2 is ICosmicSignatureGameStorage, ISystemEventsV2 {
	/// @return Comment-202605237 applies.
	function getDurationUntilRoundActivation() external view returns (int256);

	/// @return Comment-202605238 applies.
	function getDurationElapsedSinceRoundActivation() external view returns (int256);
}
