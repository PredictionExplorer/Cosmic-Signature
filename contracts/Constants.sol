// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

library CosmicGameConstants {
	uint256 public constant MILLION = 10 ** 6;
	uint256 public constant MAX_MESSAGE_LENGTH = 280;
	uint256 public constant FIRST_ROUND_BID_PRICE = 1e14; // 1 / 10,000 of ETH

	// You get 100 tokens when you bid
	uint256 public constant TOKEN_REWARD = 100 * 1e18;
	uint256 public constant LONGEST_BIDDER_TOKEN_REWARD = 1000 * 1e18;
	uint256 public constant TOP_BIDDER_TOKEN_REWARD = 1000 * 1e18;
	uint256 public constant MARKETING_REWARD = 15 * 1e18;
	uint256 public constant DEFAULT_AUCTION_LENGTH = 12 * 3600;
	uint256 public constant MODE_RUNTIME = 0;
	uint256 public constant MODE_PREPARE_MAINTENANCE = 1;
	uint256 public constant MODE_MAINTENANCE = 2;

	string public constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE";
	string public constant ERR_STR_MODE_RUNTIME = "System in maintenance mode";

	struct BidderStatRec {
		// 192 bits in total, this layout fits single storage slot (256 bits)
		uint64 bidPricePaidEth; //fixed-point decimal, precision = 3 (ETH) digits, formula: bidPricePaidEth = bidPrice >> 15; (price in Wei units)
		uint64 bidPricePaidCST; //fixed-point decimal, precision = 3 (ETH) digits, formula: bidPricePaidCST = bidPriceCST >> 15; (price in Wei units)
		uint32 bidCount;
		uint32 bidTime; // duration of each bid, summarized
	}
	struct DonatedNFT {
		IERC721 nftAddress;
		uint256 tokenId;
		uint256 round;
		bool claimed;
	}
	enum BidType {
		ETH,
		RandomWalk,
		CST
	}
}
