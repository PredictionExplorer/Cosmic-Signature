// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { ICosmicSignatureGameStorageV4 } from "./interfaces/ICosmicSignatureGameStorageV4.sol";
import { ICosmicSignatureArtAuction } from "./interfaces/ICosmicSignatureArtAuction.sol";

abstract contract CosmicSignatureGameStorageV4Base is CosmicSignatureGameStorageV3Base, ICosmicSignatureGameStorageV4 {
	/// @notice Selected once during V4 initialization. A later upgrade can select a new deployment for future batches.
	ICosmicSignatureArtAuction public override artAuction;
}
