// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @title The Cosmic Signature Game V2+.
/// @author The Cosmic Signature Development Team.
/// @notice Comment-202606014 applies.
/// @dev Comment-202606017 applies.
interface ICosmicSignatureGameV2 {
	// /// @notice See also: `IBidding1V2.receive`, `IEthDonations.donateEth`.
	// /// @dev It appears that we don't need this.
	// fallback() external payable;

	/// @notice Makes additional initializations after an upgrade.
	/// The upgrade task deploys the new implementation contract separately, then calls `upgradeToAndCall` on the proxy
	/// to update its implementation address and call this method in one transaction.
	/// According to Comment-202606128, this method implementation has no owner check of its own,
	/// so it must be called atomically with the proxy upgrade.
	function reinitialize() external;
}
