// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { ICosmicSignatureGameStorageV4 } from "./ICosmicSignatureGameStorageV4.sol";
import { ICosmicSignatureArtAuction } from "./ICosmicSignatureArtAuction.sol";

interface ICosmicSignatureGameV4 is ICosmicSignatureGameStorageV4 {
	error InvalidArtAuction(address artAuctionAddress);
	error V4InitializationRequired();

	event ArtAuctionConfigured(address indexed artAuctionAddress);
	event ArtAuctionNftsMinted(uint256 indexed roundNum, address indexed artAuctionAddress, uint256 indexed firstNftId, uint256 numNfts);

	/// @notice Initializes only the new auction address, atomically with a V3-to-V4 upgrade.
	function initializeV4(ICosmicSignatureArtAuction artAuction_) external;
}
