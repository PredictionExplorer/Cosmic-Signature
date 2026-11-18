// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { CosmicSignatureGameStorageV4Base } from "./CosmicSignatureGameStorageV4Base.sol";

abstract contract CosmicSignatureGameStorageV4 is CosmicSignatureGameStorageV4Base {
	// V4 consumes slots 314 through 318 from V3's final gap.
	// Keep the gap's end and the inherited transient-storage position unchanged.
	// solhint-disable-next-line var-name-mixedcase
	uint256[(1 << 30) - 1 - 6 - 5] private __gap_persistent;

	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;
}
