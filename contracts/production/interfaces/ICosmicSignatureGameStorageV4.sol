// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { ICosmicSignatureGameStorageV3 } from "./ICosmicSignatureGameStorageV3.sol";
import { ICosmicSignatureArtAuction } from "./ICosmicSignatureArtAuction.sol";

import { IChaosZeroMarket } from "./IChaosZeroMarket.sol";

interface ICosmicSignatureGameStorageV4 is ICosmicSignatureGameStorageV3 {
	/// @notice The immutable auction deployment receiving new V4 artwork batches.
	function artAuction() external view returns (ICosmicSignatureArtAuction);
	/// @notice Opening price in wei for the next artwork batch registered by this game.
	function artAuctionOpeningBid() external view returns (uint256);
	function chaosZeroMarket() external view returns (IChaosZeroMarket);
	function CHAOS_ZERO_CST_PER_CYCLE() external view returns (uint256);

	/// @notice Fresh CST transferred for this cycle and total CST transferred to this market through this cycle.
	/// Unfunded entries return two zeros, including for market addresses from other deployments.
	function chaosZeroFunding(address market_, uint256 cycle_) external view returns (uint256 amount, uint256 cumulativeAmount);
}
