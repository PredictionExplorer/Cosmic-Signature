// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Constants and structures for Cosmic Game
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

	/// @notice This is equivalent to the midnight of 9999-12-31.
	/// @dev JavaScript  code to calculate this.
	///		const n = (new Date(9999, 12 - 1, 31)).getTime() / 1000;
	///		console.log(n);
	///		const d = new Date(n * 1000);
	///		console.log(d);
	uint256 public constant TIMESTAMP_9999_12_31 = 253_402_214_400;

	// /// @notice System mode constants.
	// /// @dev These define the operational states of the CosmicGameProxy contract.
	// uint256 public constant MODE_RUNTIME = 0; // Normal operation.
	// uint256 public constant MODE_PREPARE_MAINTENANCE = 1; // Preparing for maintenance.
	// uint256 public constant MODE_MAINTENANCE = 2; // System under maintenance.
	//
	// /// @notice Error messages for system mode checks.
	// string public constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE.";
	// string public constant ERR_STR_MODE_RUNTIME = "System in maintenance mode.";

	// todo-1 Maybe remove `INITIAL_` from these constants names.
	// todo-1 And maybe in rare cases replace it with `DEFAULT_`.

	/// @notice Initial `activationTime`.
	/// @dev This should be in the future -- to configure our contract after the deployment
	/// without calling `setActivationTime`.
	/// Comment-202411168 relates.
	uint256 public constant INITIAL_ACTIVATION_TIME = /*1_702_512_000*/ TIMESTAMP_9999_12_31;

	/// @notice Default `delayDurationBeforeNextRound`.
	uint256 public constant INITIAL_DELAY_DURATION_BEFORE_NEXT_ROUND = SECONDS_PER_DAY;

	/// @notice Default `marketingReward`.
	uint256 public constant MARKETING_REWARD = 15 ether;

	/// @notice Default `maxMessageLength`.
	/// Comment-202409143 applies.
	uint256 public constant MAX_MESSAGE_LENGTH = 280;

	uint256 public constant INITIAL_NANOSECONDS_EXTRA = NANOSECONDS_PER_HOUR;
	uint256 public constant INITIAL_TIME_INCREASE = MICROSECONDS_PER_SECOND + 30;
	/// todo-0 Rename to `INITIAL_INITIAL_...`?
	/// todo-0 Actually see a rename todo near `initialSecondsUntilPrize`.
	uint256 public constant INITIAL_SECONDS_UNTIL_PRIZE = SECONDS_PER_DAY;

	/// @notice Initial `bidPrice` for the first bidding round.
	uint256 public constant FIRST_ROUND_BID_PRICE = 0.0001 ether;

	uint256 public constant INITIAL_BID_AMOUNT_FRACTION = 4_000;
	uint256 public constant INITIAL_PRICE_INCREASE = MILLION + 10_000;

	/// @notice Initial `cstAuctionLength`.
	/// Default `roundStartCstAuctionLength`.
	uint256 public constant DEFAULT_AUCTION_LENGTH = 12 * SECONDS_PER_HOUR;

	uint256 public constant STARTING_BID_PRICE_CST_MULTIPLIER = 2;

	/// @notice Initial `startingBidPriceCST`.
	/// Default `startingBidPriceCSTMinLimit`.
	uint256 public constant STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT = 200 ether;

	/// @notice `startingBidPriceCSTMinLimit` hard min limit.
	/// This is used as a min limit on another min limit.
	/// @dev This should not be smaller because we calculate CST bid price in the `1 / MILLION` resolution
	/// and we want to support a sufficient number of significant digits.
	uint256 public constant STARTING_BID_PRICE_CST_HARD_MIN_LIMIT = 1 ether;

	/// @notice Default `tokenReward`.
	uint256 public constant TOKEN_REWARD = 100 ether;

	uint256 public constant INITIAL_MAIN_PRIZE_PERCENTAGE = 25;
	/// todo-1 I added this. So now other initial percentages should be readjusted.
	uint256 public constant INITIAL_CHRONO_WARRIOR_ETH_PRIZE_PERCENTAGE = 7;
	uint256 public constant INITIAL_RAFFLE_PERCENTAGE = 5;
	uint256 public constant INITIAL_STAKING_PERCENTAGE = 10;
	uint256 public constant INITIAL_CHARITY_PERCENTAGE = 10;

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES`.
	uint256 public constant DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE = SECONDS_PER_DAY;

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE`.
	uint256 public constant DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 10 * SECONDS_PER_DAY;

	/// @notice Default `erc20RewardMultiplier`.
	uint256 public constant ERC20_REWARD_MULTIPLIER = 10;

	uint256 public constant INITIAL_RAFFLE_ETH_WINNERS_BIDDING = 3;
	uint256 public constant INITIAL_RAFFLE_NFT_WINNERS_BIDDING = 5;
	uint256 public constant INITIAL_STAKING_WINNERS_RWALK = 4;

	/// todo-1 Maybe just use `uint256` instead of this.
	struct BooleanWithPadding {
		bool value;
		uint248 padding;
	}

	struct BalanceInfo {
		uint256 roundNum;
		uint256 amount;
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

	/// @notice Details about an ERC-20 token donation made to the game.
	struct DonatedToken {
		// uint256 roundNum;
		// IERC20 tokenAddress;
		uint256 amount;
	}

	/// @notice Details about an ERC-20 token donation that one is required to provide to claim the donation.
	struct DonatedTokenToClaim {
		uint256 roundNum;
		IERC20 tokenAddress;
	}

	/// @notice Details about an NFT donated to the game.
	struct DonatedNft {
		/// todo-1 I have reordered `roundNum`. It used to be before `claimed`. I wrote about this on Slack.
		uint256 roundNum;
		IERC721 nftAddress;
		uint256 nftId;
		// bool claimed;
	}
}
