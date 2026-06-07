// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface IBiddingBase is ICosmicSignatureGameStorage, ISystemEvents {
	/// @return
	/// [Comment-202605237]
	/// The number of seconds until the current bidding round activates, or a non-positive value if it's already active.
	/// [/Comment-202605237]
	function getDurationUntilRoundActivation() external view returns (int256);

	/// @return
	/// [Comment-202605238]
	/// The number of seconds since the current bidding round activated, or a negative value if it's not yet active.
	/// [/Comment-202605238]
	function getDurationElapsedSinceRoundActivation() external view returns (int256);
}
