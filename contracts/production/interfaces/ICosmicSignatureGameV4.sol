// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { ICosmicSignatureGameStorageV4 } from "./ICosmicSignatureGameStorageV4.sol";
import { ICosmicSignatureArtAuction } from "./ICosmicSignatureArtAuction.sol";

import { IChaosZeroMarket } from "./IChaosZeroMarket.sol";

interface ICosmicSignatureGameV4 is ICosmicSignatureGameStorageV4 {
	error InvalidArtAuction(address artAuctionAddress);
	error V4InitializationRequired();
	error InvalidChaosZeroMarket(address market);
	error ChaosZeroCollateralIsFixed(address token);

	event ArtAuctionOpeningBidChanged(uint256 openingBid);
	event ArtAuctionConfigured(address indexed artAuctionAddress);
	event ArtAuctionNftsMinted(uint256 indexed roundNum, address indexed artAuctionAddress, uint256 indexed firstNftId, uint256 numNfts);

	event ChaosZeroCycleFunded(address indexed market, uint256 indexed cycle, uint256 amount, uint256 cumulativeAmount);

	/// @notice Updates the opening price for future batches during an inactive interval.
	function setArtAuctionOpeningBid(uint256 openingBid_) external;

	/// @notice Configures V4 and funds the first V4 cycle, atomically with a V3-to-V4 upgrade.
	function initializeV4(ICosmicSignatureArtAuction artAuction_, IChaosZeroMarket chaosZeroMarket_) external;
}
