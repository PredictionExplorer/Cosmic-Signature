// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

library CosmicGameConstants {
	uint256 public constant MILLION = 10 ** 6;
	uint256 public constant MAX_MESSAGE_LENGTH = 280;
	uint256 public constant FIRST_ROUND_BID_PRICE = 1e14; // 1 / 10,000 of ETH

	// You get 100 tokens when you bid
	uint256 public constant TOKEN_REWARD = 100 * 1e18;
	uint256 public constant ERC20_REWARD_MULTIPLIER = 10;
	uint256 public constant MARKETING_REWARD = 15 * 1e18;
	uint256 public constant DEFAULT_AUCTION_LENGTH = 12 * 3600;
	uint256 public constant MODE_RUNTIME = 0;
	uint256 public constant MODE_PREPARE_MAINTENANCE = 1;
	uint256 public constant MODE_MAINTENANCE = 2;

	string public constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE";
	string public constant ERR_STR_MODE_RUNTIME = "System in maintenance mode";

	struct BidderInfo {
		uint256 totalSpent;
		uint256 lastBidTime;
	}

	struct DonatedNFT {
		IERC721 nftAddress;
		uint256 tokenId;
		uint256 round;
		bool claimed;
	}
	struct DonationInfoRecord {
		address donor;
		uint256 amount;
		string data; // JSON-formatted string with data, defined by us (offchain)
	}
	enum BidType {
		ETH,
		RandomWalk,
		CST
	}
}
