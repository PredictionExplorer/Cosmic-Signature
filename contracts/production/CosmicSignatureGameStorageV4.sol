// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { CosmicSignatureGameStorageV4Base } from "./CosmicSignatureGameStorageV4Base.sol";

abstract contract CosmicSignatureGameStorageV4 is CosmicSignatureGameStorageV4Base {
	// The auction address consumes slot 314, the first slot of V3's final gap.
	// Keep the gap's end and the inherited transient-storage position unchanged.
	// solhint-disable-next-line var-name-mixedcase
	uint256[(1 << 30) - 1 - 6 - 1] private __gap_persistent;

	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;
}
