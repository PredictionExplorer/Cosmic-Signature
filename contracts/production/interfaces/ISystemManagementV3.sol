// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ISystemManagementV2 } from "./ISystemManagementV2.sol";

interface ISystemManagementV3 is ISystemManagementV2 {
	/// @notice Sets `roundLateBidDurationDivisor`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRoundLateBidDurationDivisor(uint256 newValue_) external;

	/// @notice Sets `roundLateBidPricePremiumAmountBaseMultiplier`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRoundLateBidPricePremiumAmountBaseMultiplier(uint256 newValue_) external;

	/// @notice Sets `roundLateBidPricePremiumAmountExponent`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setRoundLateBidPricePremiumAmountExponent(uint256 newValue_) external;

	/// @notice Sets `bidCstRewardAmountPerMinute`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setBidCstRewardAmountPerMinute(uint256 newValue_) external;

	/// @notice Sets `mainPrizeNumCosmicSignatureNfts`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMainPrizeNumCosmicSignatureNfts(uint256 newValue_) external;
}
