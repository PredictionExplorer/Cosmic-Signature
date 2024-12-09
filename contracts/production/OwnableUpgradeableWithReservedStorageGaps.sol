// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @notice
/// [Comment-202412142]
/// A contract with reserved storage gaps.
/// Comment-202412142 relates and/or applies.
/// [/Comment-202412142]
/// todo-1 We need similar contracts for all upgradeable contracts that we use.
abstract contract OwnableUpgradeableWithReservedStorageGaps is OwnableUpgradeable {
	/// @notice Comment-202412142 applies.
	uint256[256] private __gap_persistent;

	// todo-1 Transient storage is not yet supported for reference types.
	// /// @notice Comment-202412142 applies.
	// uint256[256] private transient __gap_transient;
}
