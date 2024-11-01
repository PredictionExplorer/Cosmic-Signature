// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Constants and Structs for Cosmic Game
/// @notice Default values and types used across the Cosmic Game ecosystem
/// @dev These constants are used for initial state variables but may be updated later
library CosmicGameConstants {
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

	// /// @notice System mode constants
	// /// @dev These define the operational states of the CosmicGameProxy contract.
	// uint256 public constant MODE_RUNTIME = 0; // Normal operation
	// uint256 public constant MODE_PREPARE_MAINTENANCE = 1; // Preparing for maintenance
	// uint256 public constant MODE_MAINTENANCE = 2; // System under maintenance
	//
	// /// @notice Error messages for system mode checks
	// string public constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE";
	// string public constant ERR_STR_MODE_RUNTIME = "System in maintenance mode";

	// @dev Comment-202411168 relates and/or applies.
	uint256 public constant INITIAL_ACTIVATION_TIME = 1_702_512_000;

	uint256 public constant INITIAL_DELAY_DURATION_BEFORE_NEXT_ROUND = SECONDS_PER_DAY;

	/// @notice Default marketing reward amount, in CST.
	uint256 public constant MARKETING_REWARD = 15 ether;

	/// @notice Default maximum length for bid messages
	/// todo-1 Also for donation messages? Clarify.
	/// Comment-202409143 applies.
	uint256 public constant MAX_MESSAGE_LENGTH = 280;

	uint256 public constant INITIAL_NANOSECONDS_EXTRA = NANOSECONDS_PER_HOUR;
	uint256 public constant INITIAL_TIME_INCREASE = MICROSECONDS_PER_SECOND + 30;
	// todo-0 Rename to `INITIAL_INITIAL_...`.
	// todo-0 Actually see a rename todo near `initialSecondsUntilPrize`.
	uint256 public constant INITIAL_SECONDS_UNTIL_PRIZE = SECONDS_PER_DAY;

	/// @notice Initial ETH bid price for the first round
	uint256 public constant FIRST_ROUND_BID_PRICE = 0.0001 ether;

	uint256 public constant INITIAL_BID_AMOUNT_FRACTION = 4_000;
	uint256 public constant INITIAL_PRICE_INCREASE = MILLION + 10_000;

	/// @notice Default `cstAuctionLength` and `roundStartCstAuctionLength`.
	uint256 public constant DEFAULT_AUCTION_LENGTH = 12 * SECONDS_PER_HOUR;

	uint256 public constant STARTING_BID_PRICE_CST_MULTIPLIER = 2;

	/// @notice CST bid price initial min limit
	uint256 public constant STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT = 200 ether;

	/// @notice CST bid price hard min limit
	/// This is used as a min limit on another min limit
	/// @dev This should not be smaller because we calculate CST bid price in the `1 / MILLION` resolution
	/// and we want to support a sufficient number of significant digits
	uint256 public constant STARTING_BID_PRICE_CST_HARD_MIN_LIMIT = 1 ether;

	/// @notice Default token reward amount (100 tokens)
	uint256 public constant TOKEN_REWARD = 100 ether;

	uint256 public constant INITIAL_MAIN_PRIZE_PERCENTAGE = 25;
	// todo-1 I added this. So now other initial percentages should be readjusted.
	uint256 public constant INITIAL_CHRONO_WARRIOR_ETH_PRIZE_PERCENTAGE = 7;
	uint256 public constant INITIAL_RAFFLE_PERCENTAGE = 5;
	uint256 public constant INITIAL_STAKING_PERCENTAGE = 10;
	uint256 public constant INITIAL_CHARITY_PERCENTAGE = 10;
	uint256 public constant INITIAL_TIMEOUT_CLAIM_PRIZE = SECONDS_PER_DAY;

	/// @notice `erc20RewardMultiplier` default value.
	uint256 public constant ERC20_REWARD_MULTIPLIER = 10;

	uint256 public constant INITIAL_RAFFLE_ETH_WINNERS_BIDDING = 3;
	uint256 public constant INITIAL_RAFFLE_NFT_WINNERS_BIDDING = 5;
	uint256 public constant INITIAL_STAKING_WINNERS_RWALK = 4;

	struct BooleanWithPadding {
		bool value;
		uint248 padding;
	}

	enum NftTypeCode {
		/// @notice This denotes an uninitialized or invalid value.
		None,

		CosmicSignature,
		RandomWalk
	}

	/// @notice Types of bids that can be made in the game.
	/// todo-0 Rename to `BidTypeCode`.
	enum BidType {
		/// @notice Bid using Ether.
		/// todo-1 Rename to `Eth`.
		ETH,

		/// @notice Bid using Ether + a RandomWalk NFT.
		/// todo-1 Rename to `EthPlusRandomWalkNft`.
		RandomWalk,

		/// @notice Bid using Cosmic Tokens.
		/// todo-1 Rename to `Cst`.
		CST
	}

	/// @notice Information about a bidder
	/// @dev Stores the total amount spent and the time of the last bid
	struct BidderInfo {
		uint256 totalSpentEth;
		uint256 totalSpentCst;
		uint256 lastBidTimeStamp;
	}

	/// @notice Details about a donation made to the game.
	/// Used for an ETH donation.
	struct DonationInfoRecord {
		address donor;
		uint256 amount;

		/// @notice JSON-formatted string with additional data.
		string data;
	}

	/// @notice Information about a donated NFT
	/// @dev Stores details about NFTs donated to the game
	struct DonatedNFT {
		IERC721 nftAddress;
		uint256 nftId;
		uint256 roundNum;
		// todo-1 Do we need this? Woudn't `nftAddress.ownerOf` show this?
		// todo-1 What if someone donates the same NFT again?
		// todo-1 Make sure it's impossible that we transfer someone's NFT to someone else.
		bool claimed;
	}
}
