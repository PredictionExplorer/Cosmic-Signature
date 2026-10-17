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
	/// The upgrade task calls this on the proxy as the payload of `upgradeToAndCall`, in the same transaction as the upgrade.
	/// It has no owner check of its own, so it must not be left for a separate transaction after the upgrade.
	function reinitialize() external;
}
