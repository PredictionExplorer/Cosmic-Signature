// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { ICosmicSignatureGameStorageV4 } from "./interfaces/ICosmicSignatureGameStorageV4.sol";
import { ICosmicSignatureArtAuction } from "./interfaces/ICosmicSignatureArtAuction.sol";

import { IChaosZeroMarket } from "./interfaces/IChaosZeroMarket.sol";

abstract contract CosmicSignatureGameStorageV4Base is CosmicSignatureGameStorageV3Base, ICosmicSignatureGameStorageV4 {
	/// @notice Selected once during V4 initialization. A later upgrade can select a new deployment for future batches.
	ICosmicSignatureArtAuction public override artAuction;
	IChaosZeroMarket public override chaosZeroMarket;

	struct ChaosZeroCycleFunding {
		uint256 amount;
		uint256 cumulativeAmount;
	}

	mapping(address => mapping(uint256 => ChaosZeroCycleFunding)) public override chaosZeroFunding;
	mapping(address => uint256) internal _totalChaosZeroFunding;
	uint256 public override artAuctionOpeningBid;

	uint256 public constant override CHAOS_ZERO_CST_PER_CYCLE = 8_000 ether;
}
