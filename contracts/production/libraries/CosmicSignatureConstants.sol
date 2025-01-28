// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// #endregion
// #region

/// @title Data types and constants.
/// @author The Cosmic Signature Development Team.
/// @notice Most of these constants are used to initialize state variables.
/// @dev
/// todo-1 +++ Replace some `INITIAL_` with `DEFAULT_`.
/// todo-1 +++ Where a constant is not used to init a variable, don't name it `INITIAL_` or `DEFAULT_`.
/// todo-1 +++ Done on Jan 24 2025.
library CosmicSignatureConstants {
	// #region // Data Types

	// /// @dev It appears that this was a bad idea.
	// /// It's probably more efficient to use `uint256` and avoid using `bool`.
	// struct BooleanWithPadding {
	// 	bool value;
	// 	uint248 padding;
	// }

	// #endregion
	// #region System Management

	// Empty.

	// #endregion
	// #region ETH Donations

	// Empty.

	// #endregion
	// #region Bidding

	/// @notice Default `delayDurationBeforeNextRound`.
	uint256 internal constant DEFAULT_DELAY_DURATION_BEFORE_NEXT_ROUND = (1 hours) / 2;

	/// @notice Initial `activationTime`.
	/// @dev This must be in the future -- to configure our contract after the deployment
	/// without calling `setActivationTime` and to ensure that hackers won't attempt to bid
	/// before the deployment script is done configuring the contract.
	/// Comment-202411168 relates.
	uint256 internal constant INITIAL_ACTIVATION_TIME = /*1_702_512_000*/ TIMESTAMP_9000_01_01;

	/// @notice Default `ethDutchAuctionDurationDivisor`.
	uint256 internal constant DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR = (MICROSECONDS_PER_SECOND + HOURS_PER_DAY) / (HOURS_PER_DAY * 2) - 0;

	/// @notice First bidding round initial ETH bid price.
	/// It's impossible to change it after the contract has been deployed.
	uint256 internal constant FIRST_ROUND_INITIAL_ETH_BID_PRICE = 0.0001 ether;

	uint256 internal constant ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2;

	/// @notice Default `ethDutchAuctionEndingBidPriceDivisor`.
	/// Comment-202501063 applies.
	uint256 internal constant DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR = 10 * ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;

	uint256 internal constant DEFAULT_NEXT_ETH_BID_PRICE_INCREASE_DIVISOR = 100;

	/// @notice
	/// [Comment-202412036]
	/// An ETH + RandomWalk NFT bid gets a 50% discount on the bid price.
	/// [/Comment-202412036]
	uint256 internal constant RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2;

	/// @notice Default `cstDutchAuctionDurationDivisor`.
	/// @dev
	/// todo-1 +++ Rename any "Auction" to "Dutch Auction".
	/// todo-1 +++ (?<!dutch)(?<!dutch[\-_ ])Auction
	/// todo-1 Done, but re-check it again.
	uint256 internal constant DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR = (MICROSECONDS_PER_SECOND + HOURS_PER_DAY / 4) / (HOURS_PER_DAY / 2) - 1;

	uint256 internal constant CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2;

	/// @notice Default `cstDutchAuctionBeginningBidPriceMinLimit`.
	/// Initial `cstDutchAuctionBeginningBidPrice`.
	uint256 internal constant DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT = 200 ether;

	// /// @notice `startingBidPriceCstMinLimit` "hard" min limit.
	// /// This is used as a min limit on another min limit.
	// /// @dev This should not be smaller because we calculate CST bid price in the `1 / MILLION` resolution
	// /// and we want to support a sufficient number of significant digits.
	// /// Issue. Actually the above comment is BS. We do not actually round prices. A price can be any amount in Weis.
	// /// todo-1 The web site shows 2 digits after the decimal point. Maybe in the tooltip it should show the whole number with all the digits.
	// uint256 internal constant STARTING_BID_PRICE_CST_HARD_MIN_LIMIT = 1 ether;

	/// @notice Default `maxMessageLength`.
	/// Comment-202409143 applies.
	/// @dev Does this really have to be configurable? Maybe make this non-configurable and remove `DEFAULT_`.
	uint256 internal constant DEFAULT_MAX_MESSAGE_LENGTH = 280;

	/// @notice Default `tokenReward` and `GovernorSettings.proposalThreshold()`.
	uint256 internal constant DEFAULT_TOKEN_REWARD = 100 ether;

	// #endregion
	// #region Bid Statistics

	// Empty.

	// #endregion
	// #region Main Prize

	/// @notice Default `initialDurationUntilMainPrizeDivisor`.
	uint256 internal constant DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR = (MICROSECONDS_PER_SECOND + HOURS_PER_DAY / 2) / HOURS_PER_DAY - 1;

	uint256 internal constant INITIAL_MAIN_PRIZE_TIME_INCREMENT = 1 hours;

	/// @notice Default `mainPrizeTimeIncrementIncreaseDivisor`.
	/// @dev todo-1 Since we now increase `mainPrizeTimeIncrementInMicroSeconds` once per round,
	/// todo-1 Taras needs to simulate a better value for this.
	/// todo-1 Discussed at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735492056099589?thread_ts=1735275853.000929&cid=C02EDDE5UF8
	uint256 internal constant DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR = 100;

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES`.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE = 1 days;

	uint256 internal constant DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE = 25;

	// #endregion
	// #region Secondary Prizes

	/// @notice Default `cstRewardAmountMultiplier`.
	uint256 internal constant DEFAULT_CST_REWARD_AMOUNT_MULTIPLIER = 10 ether;

	/// todo-1 I added this. So now other initial percentages should be readjusted.
	uint256 internal constant DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE = 7;

	uint256 internal constant DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_PERCENTAGE = 5;

	uint256 internal constant DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS = 3;

	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS = 5;

	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS = 4;

	uint256 internal constant DEFAULT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE = 10;

	// #endregion
	// #region Cosmic Signature Token

	// /// @notice Default `CosmicSignatureToken.marketingWalletBalanceAmountMaxLimit`.
	// /// @dev todo-9 Is this amount OK?
	// uint256 internal constant DEFAULT_MARKETING_WALLET_BALANCE_AMOUNT_MAX_LIMIT = 2_000 ether;

	// #endregion
	// #region RandomWalk NFT

	// Empty.

	// #endregion
	// #region Cosmic Signature NFT

	/// @notice Comment-202409143 applies.
	uint256 internal constant COSMIC_SIGNATURE_NFT_NAME_LENGTH_MAX_LIMIT = 32;

	// #endregion
	// #region Prizes Wallet

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE`.
	/// @dev todo-1 Increase to 31 days or at least 2 weeks, just in case our front end crashes and remains down for too long?
	/// todo-1 https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1731974036727899
	/// todo-1 https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1732036126494949
	/// todo-1 Create another thread to discuss.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 10 days;

	// #endregion
	// #region NFT Staking

	// Empty.

	// #endregion
	// #region Marketing

	/// @notice Default `marketingWalletCstContributionAmount`.
	/// @dev todo-1 +++ Is this amount OK? Asked at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735494696736999?thread_ts=1731872794.061669&cid=C02EDDE5UF8
	uint256 internal constant DEFAULT_MARKETING_WALLET_CST_CONTRIBUTION_AMOUNT = 300 ether;

	// #endregion
	// #region Charity

	uint256 internal constant DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE = 10;

	// #endregion
	// #region DAO

	uint48 internal constant GOVERNOR_DEFAULT_VOTING_DELAY = 1 days;

	/// @dev OpenZeppelin recommends to set voting period to 1 week. In our code, it used to be set to 30 days,
	/// which seems to be unnecessarily long. So I have reduced it to 2 weeks. Taras is OK with that.
	uint32 internal constant GOVERNOR_DEFAULT_VOTING_PERIOD = 2 weeks;

	/// @dev I changed this from the recommended 4% to 2% -- to increase the chance that there will be a sufficient quorum.
	/// Another reason is because the marketing wallet holds some tokens, and it's not going to vote.
	uint256 internal constant GOVERNOR_DEFAULT_VOTES_QUORUM_PERCENTAGE = 2;

	// #endregion
	// #region Time

	uint256 internal constant NANOSECONDS_PER_SECOND = BILLION;
	uint256 internal constant MICROSECONDS_PER_SECOND = MILLION;
	uint256 internal constant MILLISECONDS_PER_SECOND = THOUSAND;
	uint256 internal constant MINUTES_PER_HOUR = (1 hours) / (1 minutes);
	uint256 internal constant HOURS_PER_DAY = (1 days) / (1 hours);
	uint256 internal constant NANOSECONDS_PER_MINUTE = NANOSECONDS_PER_SECOND * (1 minutes);
	uint256 internal constant NANOSECONDS_PER_HOUR = NANOSECONDS_PER_SECOND * (1 hours);
	uint256 internal constant NANOSECONDS_PER_DAY = NANOSECONDS_PER_SECOND * (1 days);
	uint256 internal constant MICROSECONDS_PER_MINUTE = MICROSECONDS_PER_SECOND * (1 minutes);
	uint256 internal constant MICROSECONDS_PER_HOUR = MICROSECONDS_PER_SECOND * (1 hours);
	uint256 internal constant MICROSECONDS_PER_DAY = MICROSECONDS_PER_SECOND * (1 days);
	uint256 internal constant MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * (1 minutes);
	uint256 internal constant MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND * (1 hours);
	uint256 internal constant MILLISECONDS_PER_DAY = MILLISECONDS_PER_SECOND * (1 days);

	/// @notice This is equivalent to the midnight of 9000-01-01.
	/// @dev JavaScript  code to calculate this.
	///		const n = (new Date(9000, 1 - 1, 1)).getTime() / 1000;
	///		console.log(n);
	///		const d = new Date(n * 1000);
	///		console.log(d);
	uint256 internal constant TIMESTAMP_9000_01_01 = 221_845_392_000;

	// #endregion
	// #region Common

	/// @notice Represents one thousand. Useful for calculations involving thousands.
	uint256 internal constant THOUSAND = 1e3;

	/// @notice Represents one million. Useful for calculations involving millions.
	uint256 internal constant MILLION = THOUSAND * THOUSAND;

	/// @notice Represents one billion. Useful for calculations involving billions.
	uint256 internal constant BILLION = THOUSAND * MILLION;

	// #endregion
}

// #endregion
