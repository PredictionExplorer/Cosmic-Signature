// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @title The Cosmic Signature Game.
/// @author The Cosmic Signature Development Team.
/// @notice Comment-202606014 applies.
/// @dev Comment-202606017 applies.
interface ICosmicSignatureGameV2 {
	// /// @notice See also: `IBiddingV2.receive`.
	// /// @dev It appears that we don't need this.
	// fallback() external payable;

	/// @notice Makes additional initializations after an upgrade.
	/// This method is called on the proxy contract right after deployment of the new implementation contract.
	function reinitialize() external;
}
