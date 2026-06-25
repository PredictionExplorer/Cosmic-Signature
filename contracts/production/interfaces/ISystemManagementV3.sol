// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

interface ISystemManagementV3 {
	/// @notice Sets `mainPrizeNumCosmicSignatureNfts`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setMainPrizeNumCosmicSignatureNfts(uint256 newValue_) external;
}
