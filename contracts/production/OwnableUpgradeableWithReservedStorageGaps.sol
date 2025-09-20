// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @dev
/// A contract with reserved storage gaps.
/// Comment-202412142 relates and/or applies.
/// Issue. A problem is that this is not helpful because OpenZeppelin upgradeable contracts,
/// at least those I have reviewed, including `ReentrancyGuardTransientUpgradeable`, `OwnableUpgradeable`,
/// `UUPSUpgradeable`, use storage slots at hardcoded positions.
/// Therefore we do not need contracts like this.
/// Altough I have no immeiate plans to eliminate this one.
abstract contract OwnableUpgradeableWithReservedStorageGaps is OwnableUpgradeable {
	/// @dev Comment-202412142 applies.
	// solhint-disable-next-line var-name-mixedcase
	uint256[256] private __gap_persistent;

	// todo-1 Transient storage is not yet supported for reference types.
	/// @dev Comment-202412142 applies.
	// uint256[256] private transient __gap_transient;
	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;
}
