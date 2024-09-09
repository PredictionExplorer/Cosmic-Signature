// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Constants and Structs for Cosmic Game
/// @notice Default values and types used across the Cosmic Game ecosystem
/// @dev These constants are used for initial state variables but may be updated later
library CosmicGameConstants {
	/// @notice Represents one million, useful for calculations involving millions
	uint256 public constant MILLION = 1e6;

	/// @notice Default maximum length for bid messages
	uint256 public constant MAX_MESSAGE_LENGTH = 280;

	/// @notice Initial bid price for the first round (0.0001 ETH)
	uint256 public constant FIRST_ROUND_BID_PRICE = 1e14; // 1 / 10,000 of ETH

	/// @notice Default token reward amount (100 tokens)
	uint256 public constant TOKEN_REWARD = 100 * 1e18;

	/// @notice Default multiplier for ERC20 token rewards
	uint256 public constant ERC20_REWARD_MULTIPLIER = 10;

	/// @notice Default marketing reward amount (15 tokens)
	uint256 public constant MARKETING_REWARD = 15 * 1e18;

	/// @notice Default auction length (12 hours)
	uint256 public constant DEFAULT_AUCTION_LENGTH = 12 * 3600;

	/// @notice System mode constants
	/// @dev These define the operational states of the CosmicGameProxy contract.
	uint256 public constant MODE_RUNTIME = 0; // Normal operation
	uint256 public constant MODE_PREPARE_MAINTENANCE = 1; // Preparing for maintenance
	uint256 public constant MODE_MAINTENANCE = 2; // System under maintenance

	/// @notice Error messages for system mode checks
	string public constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE";
	string public constant ERR_STR_MODE_RUNTIME = "System in maintenance mode";

	uint256 public constant INITIAL_NANOSECONDS_EXTRA = 3600 * 10 ** 9;
	uint256 public constant INITIAL_TIME_INCREASE = 1000030;
	uint256 public constant INITIAL_PRICE_INCREASE = 1010000;
	uint256 public constant INITIAL_BID_AMOUNT_FRACTION = 4000;
	uint256 public constant INITIAL_SECONDS_UNTIL_PRIZE = 24 * 3600;
	uint256 public constant INITIAL_TIMEOUT_CLAIM_PRIZE = 24 * 3600;
	uint256 public constant INITIAL_ACTIVATION_TIME = 1702512000;
	uint256 public constant INITIAL_PRIZE_PERCENTAGE = 25;
	uint256 public constant INITIAL_CHARITY_PERCENTAGE = 10;
	uint256 public constant INITIAL_RAFFLE_PERCENTAGE = 5;
	uint256 public constant INITIAL_STAKING_PERCENTAGE = 10;
	uint256 public constant INITIAL_RAFFLE_ETH_WINNERS_BIDDING = 3;
	uint256 public constant INITIAL_RAFFLE_NFT_WINNERS_BIDDING = 5;
	uint256 public constant INITIAL_STAKING_WINNERS_RWALK = 4;

	/// @notice Information about a bidder
	/// @dev Stores the total amount spent and the time of the last bid
	struct BidderInfo {
		uint256 totalSpent;
		uint256 lastBidTime;
	}

	/// @notice Information about a donated NFT
	/// @dev Stores details about NFTs donated to the game
	struct DonatedNFT {
		IERC721 nftAddress;
		uint256 tokenId;
		uint256 round;
		bool claimed;
	}

	/// @notice Information about a donation
	/// @dev Stores details about donations made to the game
	struct DonationInfoRecord {
		address donor;
		uint256 amount;
		string data; // JSON-formatted string with additional data
	}

	/// @notice Types of bids that can be made in the game
	enum BidType {
		ETH, // Bid using Ether
		RandomWalk, // Bid using RandomWalk NFT
		CST // Bid using Cosmic Tokens
	}
}
