// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Constants and structures.
/// @author The Cosmic Signature Development Team.
/// @notice Default values and types used across the Cosmic Signature ecosystem.
/// @dev These constants are used for initial state variables but may be updated later.
library CosmicSignatureConstants {
	/// @notice Represents one thousand. Useful for calculations involving thousands.
	uint256 internal constant THOUSAND = 1e3;

	/// @notice Represents one million. Useful for calculations involving millions.
	uint256 internal constant MILLION = THOUSAND * THOUSAND;

	/// @notice Represents one billion. Useful for calculations involving billions.
	uint256 internal constant BILLION = THOUSAND * MILLION;

	uint256 internal constant NANOSECONDS_PER_SECOND = BILLION;
	uint256 internal constant MICROSECONDS_PER_SECOND = MILLION;
	uint256 internal constant MILLISECONDS_PER_SECOND = THOUSAND;
	uint256 internal constant MINUTES_PER_HOUR = (1 hours) / (1 minutes);
	uint256 internal constant HOURS_PER_DAY = (1 days) / (1 hours);
	uint256 internal constant NANOSECONDS_PER_HOUR = NANOSECONDS_PER_SECOND * (1 hours);
	uint256 internal constant NANOSECONDS_PER_DAY = NANOSECONDS_PER_SECOND * (1 days);
	uint256 internal constant MICROSECONDS_PER_HOUR = MICROSECONDS_PER_SECOND * (1 hours);
	uint256 internal constant MICROSECONDS_PER_DAY = MICROSECONDS_PER_SECOND * (1 days);
	uint256 internal constant MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND * (1 hours);
	uint256 internal constant MILLISECONDS_PER_DAY = MILLISECONDS_PER_SECOND * (1 days);

	/// @notice This is equivalent to the midnight of 9000-01-01.
	/// @dev JavaScript  code to calculate this.
	///		const n = (new Date(9000, 1 - 1, 1)).getTime() / 1000;
	///		console.log(n);
	///		const d = new Date(n * 1000);
	///		console.log(d);
	uint256 internal constant TIMESTAMP_9000_01_01 = 221_845_392_000;

	// /// @notice System mode constants.
	// /// @dev These define the operational states of the `CosmicSignatureGame` contract.
	// uint256 internal constant MODE_RUNTIME = 0; // Normal operation.
	// uint256 internal constant MODE_PREPARE_MAINTENANCE = 1; // Preparing for maintenance.
	// uint256 internal constant MODE_MAINTENANCE = 2; // System under maintenance.
	//
	// /// @notice Error messages for system mode checks.
	// string internal constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE.";
	// string internal constant ERR_STR_MODE_RUNTIME = "System in maintenance mode.";

	// todo-1 Maybe remove `INITIAL_` from these constants names.
	// todo-1 And maybe in rare cases replace it with `DEFAULT_`.

	/// @notice Initial `activationTime`.
	/// @dev This must be in the future -- to configure our contract after the deployment
	/// without calling `setActivationTime` and to ensure that hackers won't attempt to bid
	/// before we are done with configuring the contract.
	/// Comment-202411168 relates.
	uint256 internal constant INITIAL_ACTIVATION_TIME = /*1_702_512_000*/ TIMESTAMP_9000_01_01;

	/// @notice Default `delayDurationBeforeNextRound`.
	uint256 internal constant INITIAL_DELAY_DURATION_BEFORE_NEXT_ROUND = (1 hours) / 2;

	/// @notice Default `marketingWalletCstContributionAmount`.
	/// @dev todo-1 Is this amount OK? Asked at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735494696736999?thread_ts=1731872794.061669&cid=C02EDDE5UF8
	uint256 internal constant DEFAULT_MARKETING_WALLET_CST_CONTRIBUTION_AMOUNT = 300 ether;

	/// @notice Default `maxMessageLength`.
	/// Comment-202409143 applies.
	uint256 internal constant MAX_MESSAGE_LENGTH = 280;

	uint256 internal constant INITIAL_MAIN_PRIZE_TIME_INCREMENT = 1 hours;
	/// todo-1 Rename `INITIAL...` to `DEFAULT...`.
	uint256 internal constant INITIAL_TIME_INCREASE = MICROSECONDS_PER_SECOND + 30;
	/// todo-0 Rename to `INITIAL_INITIAL_...`?
	/// todo-0 Actually see a rename todo near `initialSecondsUntilPrize`.
	uint256 internal constant INITIAL_SECONDS_UNTIL_PRIZE = 1 days;

	/// @notice Initial `nextEthBidPrice` for the first bidding round.
	uint256 internal constant FIRST_ROUND_INITIAL_ETH_BID_PRICE = 0.0001 ether;

	uint256 internal constant DEFAULT_ROUND_INITIAL_ETH_BID_PRICE_MULTIPLIER = 2;
	uint256 internal constant DEFAULT_ROUND_INITIAL_ETH_BID_PRICE_DIVISOR = 10;
	uint256 internal constant INITIAL_PRICE_INCREASE = MILLION + 10 * THOUSAND;

	/// @notice
	/// [Comment-202412036]
	/// An ETH + RandomWalk NFT bid gets a 50% discount on the bid price.
	/// todo-1 Should we support CST + RandomWalk NFT bids?
	/// todo-1 Proposed at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1732303226011229?thread_ts=1729031458.458109&cid=C02EDDE5UF8
	/// [/Comment-202412036]
	uint256 internal constant RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2;

	/// @notice Initial `cstAuctionLength`.
	/// Default `roundStartCstAuctionLength`.
	/// @dev todo-1 I wrote a todo to rename `cstAuctionLength` and `roundStartCstAuctionLength`. So rename this too.
	uint256 internal constant DEFAULT_AUCTION_LENGTH = 12 hours;

	uint256 internal constant STARTING_BID_PRICE_CST_MULTIPLIER = 2;

	/// @notice Initial `startingBidPriceCST`.
	/// Default `startingBidPriceCSTMinLimit`.
	uint256 internal constant STARTING_BID_PRICE_CST_DEFAULT_MIN_LIMIT = 200 ether;

	// /// @notice `startingBidPriceCSTMinLimit` "hard" min limit.
	// /// This is used as a min limit on another min limit.
	// /// @dev This should not be smaller because we calculate CST bid price in the `1 / MILLION` resolution
	// /// and we want to support a sufficient number of significant digits.
	// /// Issue. Actually the above comment is BS. We do not actually round prices. A price can be any amount in Weis.
	// /// todo-1 The web site shows 2 digits after the decimal point. Maybe in the tooltip it should show the whole number with all the digits.
	// uint256 internal constant STARTING_BID_PRICE_CST_HARD_MIN_LIMIT = 1 ether;

	/// @notice Default `tokenReward` and `GovernorSettings.proposalThreshold()`.
	uint256 internal constant DEFAULT_TOKEN_REWARD = 100 ether;

	uint256 internal constant DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE = 25;
	/// todo-1 I added this. So now other initial percentages should be readjusted.
	uint256 internal constant DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE = 7;
	uint256 internal constant DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_PERCENTAGE = 5;
	uint256 internal constant DEFAULT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE = 10;
	uint256 internal constant DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE = 10;

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES`.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE = 1 days;

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE`.
	/// @dev todo-1 Increase to 31 days, just in case our front end crashes and remains down for too long?
	/// todo-1 https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1731974036727899
	/// todo-1 https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1732036126494949
	/// todo-1 Create another thread to discuss.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 10 days;

	/// @notice Default `cstRewardAmountMultiplier`.
	uint256 internal constant DEFAULT_CST_REWARD_AMOUNT_MULTIPLIER = 10 ether;

	uint256 internal constant DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS = 3;
	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS = 5;
	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS = 4;

	// /// @notice Default `CosmicSignatureToken.marketingWalletBalanceAmountMaxLimit`.
	// /// @dev todo-9 Is this amount OK?
	// uint256 internal constant DEFAULT_MARKETING_WALLET_BALANCE_AMOUNT_MAX_LIMIT = 2_000 ether;

	/// @notice Comment-202409143 applies.
	uint256 internal constant COSMIC_SIGNATURE_NFT_NAME_LENGTH_MAX_LIMIT = 32;

	uint48 internal constant GOVERNOR_DEFAULT_VOTING_DELAY = 1 days;
	uint32 internal constant GOVERNOR_DEFAULT_VOTING_PERIOD = 2 weeks;
	uint256 internal constant GOVERNOR_DEFAULT_VOTES_QUORUM_PERCENTAGE = 2;

	// todo-1 Move some structs to interfaces?

	// /// @dev It appears that this was a bad idea.
	// /// It's probably more efficient to use `uint256` and avoid using `bool`.
	// struct BooleanWithPadding {
	// 	bool value;
	// 	uint248 padding;
	// }

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

	// /// @notice Types of bids that can be made in the Game.
	// /// todo-1 Rename to `BidTypeCode`.
	// enum BidType {
	// 	/// @notice Bid using Ether.
	// 	/// todo-1 Rename to `Eth`.
	// 	ETH,
	//
	// 	/// @notice Bid using Ether + a RandomWalk NFT.
	// 	/// todo-1 Rename to `EthPlusRandomWalkNft`.
	// 	RandomWalk,
	//
	// 	/// @notice Bid using Cosmic Signature Tokens.
	// 	/// todo-1 Rename to `Cst`.
	// 	CST
	// }

	/// @notice Information about a bidder.
	struct BidderInfo {
		// todo-1 Eliminate these total spens? It appears that they are not used in the logic.
		uint256 totalSpentEth;
		uint256 totalSpentCst;
		uint256 lastBidTimeStamp;
	}

	/// @notice Details about a donation made to the Game.
	/// Used for an ETH donation with additional info.
	struct DonationWithInfoRecord {
		uint256 roundNum;
		address donorAddress;
		uint256 amount;

		/// @notice Additional info in JSON format.
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
