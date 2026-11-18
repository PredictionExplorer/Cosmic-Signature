// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { MainPrizeV3 } from "./MainPrizeV3.sol";
import { CosmicSignatureGameStorageV4Base } from "./CosmicSignatureGameStorageV4Base.sol";
import { ICosmicSignatureGameV4 } from "./interfaces/ICosmicSignatureGameV4.sol";
import { RandomNumberHelpers } from "./libraries/RandomNumberHelpers.sol";

abstract contract MainPrizeV4 is CosmicSignatureGameStorageV4Base, MainPrizeV3, ICosmicSignatureGameV4 {
	uint256 private constant _ART_AUCTION_NFTS_PER_ROUND = 8;

	function _distributePrizes() internal override {
		if (address(artAuction) == address(0)) {
			revert V4InitializationRequired();
		}

		// Leave V3's recipients, CST batch, NFT ordering and allocation events intact.
		super._distributePrizes();

		address[] memory artAuctionNftOwners_ = new address[](_ART_AUCTION_NFTS_PER_ROUND);
		for (uint256 index_ = 0; index_ < _ART_AUCTION_NFTS_PER_ROUND; ++index_) {
			artAuctionNftOwners_[index_] = address(artAuction);
		}

		// Separate the new seed stream from the existing allocation seeds without changing their derivation.
		uint256 randomNumberSeed_ = uint256(keccak256(abi.encode(
			"CosmicSignatureArtAuction/v1",
			RandomNumberHelpers.generateRandomNumberSeed(),
			roundNum,
			nft.totalSupply()
		)));
		uint256 firstNftId_ = nft.mintMany(roundNum, artAuctionNftOwners_, randomNumberSeed_);

		// Issue. Registration adds an external dependency to finalization. Failure intentionally
		// reverts all allocations and minting, so no auction inventory can exist without fixed terms.
		artAuction.registerAuctionBatch(roundNum, firstNftId_, artAuctionOpeningBid);
		emit ArtAuctionNftsMinted(roundNum, address(artAuction), firstNftId_, _ART_AUCTION_NFTS_PER_ROUND);
	}
}
