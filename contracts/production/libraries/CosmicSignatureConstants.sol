// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

/// @title Constants.
/// @author The Cosmic Signature Development Team.
/// @notice Most of these constants are used to initialize state variables.
/// @dev If a state variable will be automatically updated during the normal operations,
/// the constant to initialize it from is named `INITIAL_...`; otherwise: `DEFAULT_...`.
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
	/// @dev
	/// [Comment-202503135]
	/// This must be in the future -- to configure our contract after the deployment
	/// without calling `setRoundActivationTime` and to ensure that hackers won't attempt to bid
	/// before the deployment script is done configuring the contract.
	/// [/Comment-202503135]
	uint256 internal constant INITIAL_ROUND_ACTIVATION_TIME = /*1_702_512_000*/ TIMESTAMP_9000_01_01;

	/// @notice Default `ethDutchAuctionDurationDivisor`.
	/// Comment-202508288 relates.
	uint256 internal constant DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR = (INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND + (2 days) / 2) / (2 days);

	/// @notice First bidding round initial (first bid) ETH bid price.
	/// [Comment-202508094]
	/// It's impossible to reconfigure the very first bid price after the contract has been deployed.
	/// [/Comment-202508094]
	uint256 internal constant FIRST_ROUND_INITIAL_ETH_BID_PRICE = 0.0001 ether;

	/// @notice Comment-202503084 relates.
	uint256 internal constant ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2;

	/// @notice Default `ethDutchAuctionEndingBidPriceDivisor`.
	/// Comment-202501063 applies.
	uint256 internal constant DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR = 100 * ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;

	/// @notice Default `ethBidPriceIncreaseDivisor`.
	uint256 internal constant DEFAULT_ETH_BID_PRICE_INCREASE_DIVISOR = 100;

	/// @notice
	/// [Comment-202412036]
	/// An ETH + Random Walk NFT bid gets a 50% discount on the bid price.
	/// [/Comment-202412036]
	uint256 internal constant RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2;

	/// @notice Default `ethBidRefundAmountInGasToSwallowMaxLimit`.
	/// [Comment-202502052]
	/// This configures the logic that prevents refunding excess ETH that a bidder sent to us if the refund is too small
	/// to justify the ETH transfer transaction fee.
	/// This is expressed in gas.
	/// We will multiply this by `tx.gasprice` and if the refund is greater than the result,
	/// we will transfer the refund back to the bidder. Otherwise, the excess ETH will simply stay in the Game contract balance.
	/// This value equals the amount of gas consumed by the logic in the block near Comment-202506219.
	/// todo-2 This value might need tweaking after a blockchain upgrade.
	/// [/Comment-202502052]
	uint256 internal constant DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_TO_SWALLOW_MAX_LIMIT = 6843;

	/// @notice Default `cstDutchAuctionDurationDivisor`.
	/// Comment-202508288 relates.
	uint256 internal constant DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR = (INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND + ((1 days) / 2) / 2) / ((1 days) / 2);

	/// @notice Comment-202411066 relates.
	uint256 internal constant CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2;

	/// @notice Initial `nextRoundFirstCstDutchAuctionBeginningBidPrice`.
	/// Default `cstDutchAuctionBeginningBidPriceMinLimit`.
	uint256 internal constant DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT = 200 ether;

	/// @notice Default `bidMessageLengthMaxLimit`.
	/// Comment-202409143 applies.
	uint256 internal constant DEFAULT_BID_MESSAGE_LENGTH_MAX_LIMIT = 280;

	/// @notice Default `cstRewardAmountForBidding` and `CosmicSignatureDao.proposalThreshold()`.
	uint256 internal constant DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING = 100 ether;

	// #endregion
	// #region Secondary Prizes

	/// @notice Default `cstPrizeAmountMultiplier`.
	uint256 internal constant DEFAULT_CST_PRIZE_AMOUNT_MULTIPLIER = 10 ether;

	/// @notice Default `chronoWarriorEthPrizeAmountPercentage`.
	uint256 internal constant DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE = 8;

	/// @notice Default `raffleTotalEthPrizeAmountForBiddersPercentage`.
	uint256 internal constant DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE = 4;

	/// @notice Default `numRaffleEthPrizesForBidders`.
	uint256 internal constant DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS = 3;

	/// @notice Default `numRaffleCosmicSignatureNftsForBidders`.
	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS = 5;

	/// @notice Default `numRaffleCosmicSignatureNftsForRandomWalkNftStakers`.
	uint256 internal constant DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS = 4;

	/// @notice Default `cosmicSignatureNftStakingTotalEthRewardAmountPercentage`.
	uint256 internal constant DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE = 6;

	// #endregion
	// #region Main Prize

	/// @notice Default `initialDurationUntilMainPrizeDivisor`.
	/// Comment-202508288 relates.
	uint256 internal constant DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR = (INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND + (1 days) / 2) / (1 days);

	/// @notice Initial `mainPrizeTimeIncrementInMicroSeconds`, in seconds.
	uint256 internal constant INITIAL_MAIN_PRIZE_TIME_INCREMENT = 1 hours;

	/// @notice Default `mainPrizeTimeIncrementIncreaseDivisor`.
	uint256 internal constant DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR = 100;

	/// @notice Default `timeoutDurationToClaimMainPrize`.
	/// See also: `DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES`.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE = 1 days;

	/// @notice Default `mainEthPrizeAmountPercentage`.
	uint256 internal constant DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE = 25;

	// #endregion
	// #region Cosmic Signature Token

	// Empty.

	// #endregion
	// #region Random Walk NFT

	// Empty.

	// #endregion
	// #region Cosmic Signature NFT

	/// @notice Cosmic Signature NFT name length max limit.
	/// Comment-202409143 applies.
	uint256 internal constant COSMIC_SIGNATURE_NFT_NFT_NAME_LENGTH_MAX_LIMIT = 32;

	/// @notice Default `CosmicSignatureNft.nftBaseUri`.
	/// @dev todo-1 Hardcode a valid value here. Done, but recheck again that it's correct.
	string internal constant COSMIC_SIGNATURE_NFT_DEFAULT_NFT_BASE_URI = "https://nfts.cosmicsignature.com/cg/metadata/";

	/// @notice Default `CosmicSignatureNft.nftGenerationScriptUri`.
	/// @dev todo-1 Hardcode a valid value here.
	string internal constant COSMIC_SIGNATURE_NFT_DEFAULT_NFT_GENERATION_SCRIPT_URI = "ipfs://TBD";

	// #endregion
	// #region Prizes Wallet

	/// @notice Default `PrizesWallet.timeoutDurationToWithdrawPrizes`.
	/// Comment-202506139 applies.
	/// See also: `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE`.
	uint256 internal constant DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 5 weeks;

	// #endregion
	// #region NFT Staking

	// Empty.

	// #endregion
	// #region Marketing

	/// @notice Default `marketingWalletCstContributionAmount`.
	uint256 internal constant DEFAULT_MARKETING_WALLET_CST_CONTRIBUTION_AMOUNT = 1000 ether;

	// #endregion
	// #region Charity

	/// @notice Default `charityEthDonationAmountPercentage`.
	uint256 internal constant DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE = 7;

	// #endregion
	// #region DAO

	/// @notice Default `CosmicSignatureDao.votingDelay()`.
	/// @dev
	/// [Comment-202508041]
	/// OpenZeppelin logic acts as if this value was greater by 1.
	/// That could be because of Comment-202508043.
	/// [/Comment-202508041]
	uint48 internal constant DAO_DEFAULT_VOTING_DELAY =
		// 1 minutes;
		2 days;

	/// @notice Default `CosmicSignatureDao.votingPeriod()`.
	uint32 internal constant DAO_DEFAULT_VOTING_PERIOD =
		// 3 minutes;
		2 weeks;

	// See `DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING`.

	/// @notice Default `CosmicSignatureDao.quorum()`.
	/// @dev I've reduced this from the recommended 4% -- to increase the chance that there will be a sufficient quorum.
	/// Another reason is because marketing wallet holds some CST amount, and it's not supposed to vote.
	uint256 internal constant DAO_DEFAULT_VOTES_QUORUM_PERCENTAGE = 3;

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
	///		const n = /*Math.trunc*/((new Date(9000, 1 - 1, 1)).getTime() / 1000);
	///		console.info(n);
	///		const d = new Date(n * 1000);
	///		console.info(d);
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
