// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

library CosmicGameConstants {
	uint256 public constant MILLION = 10 ** 6;
	uint256 public constant MAX_MESSAGE_LENGTH = 280;

	// You get 100 tokens when you bid
	uint256 public constant TOKEN_REWARD = 100 * 1e18;
	uint256 public constant MARKETING_REWARD = 15 * 1e18;

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
