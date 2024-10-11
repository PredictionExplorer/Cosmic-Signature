// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Constants and Structs for Cosmic Game
/// @notice Default values and types used across the Cosmic Game ecosystem
/// @dev These constants are used for initial state variables but may be updated later
library CosmicGameConstants {
	/// @notice Types of bids that can be made in the game
	enum BidType {
		/// @notice Bid using Ether
		ETH,

		/// @notice Bid using RandomWalk NFT
		RandomWalk,

		/// @notice Bid using Cosmic Tokens
		CST
	}

	/// @notice Information about a bidder
	/// @dev Stores the total amount spent and the time of the last bid
	struct BidderInfo {
		uint256 totalSpentETH;
		uint256 totalSpentCST;
		uint256 lastBidTime;
	}

	/// @notice Information about a donated NFT
	/// @dev Stores details about NFTs donated to the game
	struct DonatedNFT {
		IERC721 nftAddress;
		uint256 nftId;
		uint256 round;
		bool claimed;
	}

	/// @notice Information about a donation
	/// @dev Stores details about donations made to the game
	struct DonationInfoRecord {
		address donor;
		uint256 amount;

		/// @notice JSON-formatted string with additional data
		string data;
	}

	/// @notice Represents one million. Useful for calculations involving millions
	uint256 public constant MILLION = 1e6;

	/// @notice Represents one billion. Useful for calculations involving billions
	uint256 public constant BILLION = 1e3 * MILLION;

	uint256 public constant NANOSECONDS_PER_SECOND = BILLION;
	uint256 public constant MICROSECONDS_PER_SECOND = MILLION;
	uint256 public constant SECONDS_PER_MINUTE = 60;
	uint256 public constant MINUTES_PER_HOUR = 60;
	uint256 public constant HOURS_PER_DAY = 24;
	uint256 public constant SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
	uint256 public constant NANOSECONDS_PER_HOUR = NANOSECONDS_PER_SECOND * SECONDS_PER_HOUR;
	uint256 public constant SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;
	uint256 public constant NANOSECONDS_PER_DAY = NANOSECONDS_PER_SECOND * SECONDS_PER_DAY;

	/// @notice Default maximum length for bid messages
	/// Comment-202409143 applies.
	uint256 public constant MAX_MESSAGE_LENGTH = 280;

	/// @notice Initial ETH bid price for the first round
	uint256 public constant FIRST_ROUND_BID_PRICE = 0.0001 ether;

	uint256 public constant STARTING_BID_PRICE_CST_MULTIPLIER = 2;

	/// @notice CST bid price initial min limit
	uint256 public constant STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT = 200 ether;

	/// @notice CST bid price hard min limit
	/// This is used for a sanity check
	/// @dev This should not be smaller because we calculate CST bid price in the `1 / MILLION` resolution
	/// and we want to support a sufficient number of significant digits
	uint256 public constant STARTING_BID_PRICE_CST_HARD_MIN_LIMIT = 1 ether;

	/// @notice Default token reward amount (100 tokens)
	uint256 public constant TOKEN_REWARD = 100 ether;

	/// @notice Default multiplier for ERC20 token rewards
	uint256 public constant ERC20_REWARD_MULTIPLIER = 10;

	/// @notice Default marketing reward amount (15 tokens)
	uint256 public constant MARKETING_REWARD = 15 ether;

	/// @notice Default auction length (12 hours)
	uint256 public constant DEFAULT_AUCTION_LENGTH = 12 * SECONDS_PER_HOUR;

	/// @notice System mode constants
	/// @dev These define the operational states of the CosmicGameProxy contract.
	uint256 public constant MODE_RUNTIME = 0; // Normal operation
	uint256 public constant MODE_PREPARE_MAINTENANCE = 1; // Preparing for maintenance
	uint256 public constant MODE_MAINTENANCE = 2; // System under maintenance

	/// @notice Error messages for system mode checks
	string public constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE";
	string public constant ERR_STR_MODE_RUNTIME = "System in maintenance mode";

	uint256 public constant INITIAL_NANOSECONDS_EXTRA = NANOSECONDS_PER_HOUR;
	uint256 public constant INITIAL_TIME_INCREASE = MICROSECONDS_PER_SECOND + 30;
	uint256 public constant INITIAL_PRICE_INCREASE = MILLION + 10_000;
	uint256 public constant INITIAL_BID_AMOUNT_FRACTION = 4_000;
	uint256 public constant INITIAL_SECONDS_UNTIL_PRIZE = SECONDS_PER_DAY;
	uint256 public constant INITIAL_TIMEOUT_CLAIM_PRIZE = SECONDS_PER_DAY;
	uint256 public constant INITIAL_ACTIVATION_TIME = 1_702_512_000;
	uint256 public constant INITIAL_PRIZE_PERCENTAGE = 25;
	uint256 public constant INITIAL_CHARITY_PERCENTAGE = 10;
	uint256 public constant INITIAL_RAFFLE_PERCENTAGE = 5;
	uint256 public constant INITIAL_STAKING_PERCENTAGE = 10;
	uint256 public constant INITIAL_RAFFLE_ETH_WINNERS_BIDDING = 3;
	uint256 public constant INITIAL_RAFFLE_NFT_WINNERS_BIDDING = 5;
	uint256 public constant INITIAL_STAKING_WINNERS_RWALK = 4;
}
