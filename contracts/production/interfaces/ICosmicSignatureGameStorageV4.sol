// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ICosmicSignatureGameStorageV3 } from "./ICosmicSignatureGameStorageV3.sol";
import { ICosmicSignatureArtAuction } from "./ICosmicSignatureArtAuction.sol";

interface ICosmicSignatureGameStorageV4 is ICosmicSignatureGameStorageV3 {
	/// @notice The immutable auction deployment receiving new V4 artwork batches.
	function artAuction() external view returns (ICosmicSignatureArtAuction);
}
