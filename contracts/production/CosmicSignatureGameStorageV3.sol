// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";

// #endregion
// #region

abstract contract CosmicSignatureGameStorageV3 is CosmicSignatureGameStorageV3Base {
	// #region Gap

	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	// solhint-disable-next-line var-name-mixedcase
	uint256[(1 << 30) - 1 - 7] private __gap_persistent;

	// todo-1 Transient storage is not yet supported for reference types.
	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	// uint256[1 << 30] private transient __gap_transient;
	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;

	// #endregion
}

// #endregion
