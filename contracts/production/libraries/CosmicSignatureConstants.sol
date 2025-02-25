// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// #endregion
// #region

/// @title Constants.
/// @author The Cosmic Signature Development Team.
/// @notice Most of these constants are used to initialize state variables.
/// @dev If a state variable will be automatically updated during the normal operation
/// the constant to initialize it from is named `INITIAL_...`; otherwise: `DEFAULT_...`.
/// todo-1 +++ Rename some `INITIAL_` to `DEFAULT_`.
/// todo-1 +++ Where a constant is not used to init a variable, don't name it `INITIAL_` or `DEFAULT_`.
/// todo-1 +++ Done on Jan 24 2025.
library CosmicSignatureConstants {
	// #region System Management

	// Empty.

	// #endregion
	// #region ETH Donations

	// Empty.

	// #endregion
	// #region Bid Statistics

	// Empty.

	// #endregion
	// #region Bidding

	/// @notice Default `delayDurationBeforeRoundActivation`.
	uint256 internal constant DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION = (1 hours) / 2;

	/// @notice Initial `roundActivationTime`.
	/// @dev This must be in the future -- to configure our contract after the deployment
	/// without calling `setRoundActivationTime` and to ensure that hackers won't attempt to bid
	/// before the deployment script is done configuring the contract.
	/// Comment-202411168 relates.
	uint256 internal constant INITIAL_ROUND_ACTIVATION_TIME = /*1_702_512_000*/ TIMESTAMP_9000_01_01;

	/// @notice Default `ethDutchAuctionDurationDivisor`.
	uint256 internal constant DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR = (MICROSECONDS_PER_SECOND + HOURS_PER_DAY) / (HOURS_PER_DAY * 2) - 0;

	/// @notice First bidding round initial ETH bid price.
	/// It's impossible to change it after the contract has been deployed.
	uint256 internal constant FIRST_ROUND_INITIAL_ETH_BID_PRICE = 0.0001 ether;

	uint256 internal constant ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2;

	/// @notice Default `ethDutchAuctionEndingBidPriceDivisor`.
	/// Comment-202501063 applies.
	uint256 internal constant DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR = 10 * ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;

	// @dev Comment-202502191 depends on this value.
	uint256 internal constant DEFAULT_NEXT_ETH_BID_PRICE_INCREASE_DIVISOR = 100;

	/// @notice
	/// [Comment-202412036]
	/// An ETH + RandomWalk NFT bid gets a 50% discount on the bid price.
	/// [/Comment-202412036]
	uint256 internal constant RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2;

	/// @notice Default `ethBidRefundAmountInGasMinLimit`.
	/// [Comment-202502052]
	/// This drives the logic that prevents refunding excess ETH that a bidder transferred to us if the refund is too small
	/// to justify the transfer transaction fee.
	/// This is expressed in gas.
	/// We multiply this by `block.basefee` and if the refund is at least as big as the result,
	/// we will transfer the refund back to the bidder; otherwise the excess ETH will simply stay in the Game contract balance.
	/// [/Comment-202502052]
	/// @dev
	/// [Comment-202502054]
	/// If we ran on the mainnnet, we would probably set this to something like 21100,
	/// because on the mainnet a simple ETH transfer costs 21000 plus an incentive fee.
	/// However on Arbitrum, which is an L2 network, there are both L2 and L1 gas fees.
	/// The former appears to always be 21000, while the latter varies and tends to be bigger than the former.
	/// We don't know what the L1 gas fee is going to be, so this value is approximate.
	/// todo-2 It will liikely need tweaking over time, especially after Arbitrum decentralizes their blockchain.
	/// [/Comment-202502054]
	uint256 internal constant DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_MIN_LIMIT = 21000 * 29 / 10;

	/// @notice Default `cstDutchAuctionDurationDivisor`.
	/// @dev
	/// todo-1 +++ Rename any "Auction" to "Dutch Auction".
	/// todo-1 +++ (?<!dutch)(?<!dutch[\-_ ])Auction
	/// todo-1 Done, but re-check it again.
	uint256 internal constant DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR = (MICROSECONDS_PER_SECOND + HOURS_PER_DAY / 4) / (HOURS_PER_DAY / 2) - 1;

	// @dev Comment-202502193 depends on this value.
	uint256 internal constant CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2;

	/// @notice Default `cstDutchAuctionBeginningBidPriceMinLimit`.
	/// Initial `nextRoundFirstCstDutchAuctionBeginningBidPrice`.
	uint256 internal constant DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT = 200 ether;

	/// @notice Default `bidMessageLengthMaxLimit`.
	/// Comment-202409143 applies.
	uint256 internal constant DEFAULT_BID_MESSAGE_LENGTH_MAX_LIMIT = 280;

	/// @notice Default `cstRewardAmountForBidding` and `GovernorSettings.proposalThreshold()`.
	uint256 internal constant DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING = 100 ether;

	// #endregion
	// #region Secondary Prizes

	/// @notice Default `cstRewardAmountMultiplier`.
	uint256 internal constant DEFAULT_CST_REWARD_AMOUNT_MULTIPLIER = 10 ether;

	uint256 internal constant DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE = 7;

	uint256 internal constant DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE = 5;

	uint256 internal constant DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS = 3;

	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS = 5;

	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS = 4;

	uint256 internal constant DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE = 10;

	// #endregion
	// #region Main Prize

	/// @notice Default `initialDurationUntilMainPrizeDivisor`.
	uint256 internal constant DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR = (MICROSECONDS_PER_SECOND + HOURS_PER_DAY / 2) / HOURS_PER_DAY - 1;

	uint256 internal constant INITIAL_MAIN_PRIZE_TIME_INCREMENT = 1 hours;

	/// @notice Default `mainPrizeTimeIncrementIncreaseDivisor`.
	uint256 internal constant DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR = 100;

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES`.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE = 1 days;

	uint256 internal constant DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE = 25;

	// #endregion
	// #region Cosmic Signature Token

	// /// @notice Default `CosmicSignatureToken.marketingWalletBalanceAmountMaxLimit`.
	// /// @dev todo-9 Is this amount OK?
	// uint256 internal constant DEFAULT_MARKETING_WALLET_BALANCE_AMOUNT_MAX_LIMIT = 1_000 ether;

	// #endregion
	// #region RandomWalk NFT

	// Empty.

	// #endregion
	// #region Cosmic Signature NFT

	/// @notice Comment-202409143 applies.
	uint256 internal constant COSMIC_SIGNATURE_NFT_NAME_LENGTH_MAX_LIMIT = 32;

	/// @dev todo-1 Hardcode a valid value here.
	string internal constant DEFAULT_COSMIC_SIGNATURE_NFT_BASE_URI = "TBD";

	/// @dev todo-1 Hardcode a valid value here.
	string internal constant DEFAULT_COSMIC_SIGNATURE_NFT_GENERATION_SCRIPT_URI = "ipfs://TBD";

	// #endregion
	// #region Prizes Wallet

	/// @notice See also: `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE`.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 2 weeks;

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

	// See `DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING`.

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
