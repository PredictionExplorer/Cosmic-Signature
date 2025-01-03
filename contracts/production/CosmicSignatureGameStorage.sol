// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { PrizesWallet } from "./PrizesWallet.sol";
import { ICosmicSignatureGameStorage } from "./interfaces/ICosmicSignatureGameStorage.sol";

// #endregion
// #region

/// todo-1 Avoid combining big arrays with `mapping`s or dynamic arrays in the same contract.
/// todo-1 But where we do so, consider validating that a big array item index passed to a method,
/// todo-1 such as `roundNum_`,  is not too big.
/// todo-1 Otherwise a collision can create a vulnerability.
/// todo-1 Really, `mapping`s and dynamic arrays (including strings) are evil. Avoid them!
/// todo-1 Write a better todo near each `mapping` and dynamic array to eliminate them and/or review the code.
abstract contract CosmicSignatureGameStorage is ICosmicSignatureGameStorage {
	// #region System Parameters and Variables

	// /// @notice Comment-202411064 applies.
	// /// todo-9 Rename to `systemModeCode`.
	// uint256 public systemMode;

	/// @notice The current bidding round activation time.
	/// Starting at this point, people will be allowed to place bids.
	/// [Comment-202411064]
	/// This is a configurable parameter.
	/// [/Comment-202411064]
	/// [Comment-202411172]
	/// At the same time, this is a variable that the logic changes.
	/// [/Comment-202411172]
	/// [Comment-202411173]
	/// And in that case the logic emits an event.
	/// Comment-202411174 relates
	/// [/Comment-202411173]
	/// @dev Comment-202411236 relates.
	/// Comment-202411168 relates.
	uint256 public activationTime;

	/// @notice Delay duration from when the main prize gets claimed until the next bidding round activates.
	/// Comment-202411064 applies.
	/// @dev
	/// [Comment-202412312]
	/// We do not automatically increase this.
	/// [/Comment-202412312]
	uint256 public delayDurationBeforeNextRound;

	/// @notice At the end of each bidding round, we mint this CST amount to `marketingWallet`.
	/// Comment-202411064 applies.
	/// @dev ToDo-202411182-1 relates.
	/// todo-1 Ask Taras if he is eventually going to set this to zero.
	/// todo-1 Asked at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735320400279989?thread_ts=1731872794.061669&cid=C02EDDE5UF8
	/// todo-1 If so, before making the mint call check that this is a nonzero.
	/// todo-1 But maybe this should not be zero because the DAO will keep doing something.
	/// todo-1 Besides, rounds will keep getting longer.
	uint256 public marketingWalletCstContributionAmount;

	/// @notice The maximum allowed length of a bid message.
	/// [Comment-202409143]
	/// This limits the number of bytes, which can be fewer UTF-8 characters.
	/// [/Comment-202409143]
	/// Comment-202411064 applies.
	/// todo-1 Rename this to `bidMessageLengthMaxLimit`.
	/// todo-1 Reorder this to near other bid related variables?
	/// todo-1 Also reorder the constant from which this is initialized.
	uint256 public maxMessageLength;

	// #endregion
	// #region External Contract and Other Addresses

	/// @notice The `CosmicSignatureToken` contract address.
	/// Comment-202411064 applies.
	CosmicSignatureToken public token;

	/// @notice Comment-202411064 applies.
	CosmicSignatureNft public nft;

	/// @notice Comment-202411064 applies.
	RandomWalkNFT public randomWalkNft;

	/// @notice Comment-202411064 applies.
	StakingWalletCosmicSignatureNft public stakingWalletCosmicSignatureNft;

	/// @notice Comment-202411064 applies.
	StakingWalletRandomWalkNft public stakingWalletRandomWalkNft;

	/// @notice Comment-202411064 applies.
	PrizesWallet public prizesWallet;

	/// @notice Comment-202411064 applies.
	/// @dev It's currently unnecessary to make this variable strongly typed.
	address public marketingWallet;

	/// @notice Comment-202411064 applies.
	/// @dev
	/// [Comment-202411078]
	/// We transfer ETH directly to this address.
	/// This is intended to be our own `CharityWallet`.
	/// But even if this was a 3rd party address, it could be safe to assume that it doesn't host a malitios contract.
	/// A malitios contract can inflict damage, such as use an excessive amount of gas.
	/// Therefore if this is a 3rd party address it's important that someone conducted due-diligence on it.
	/// Comment-202411077 relates.
	/// [/Comment-202411078]
	address public charityAddress;

	// #endregion
	// #region Donation Variables

	CosmicSignatureConstants.DonationWithInfoRecord[] public ethDonationWithInfoRecords;
	// uint256 public numDonatedNfts;
	// mapping(uint256 index => CosmicSignatureConstants.DonatedNft) public donatedNfts;

	// #endregion
	// #region Game Parameters and Variables

	/// @notice Comment-202412152 relates.
	/// We use this on a number of other occasions as well.
	/// todo-0 Review where we use this. Maybe comment near involved variables about all those uses. Reference the comments here.
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// [Comment-202411174]
	/// But in that case the logic does not emit an event.
	/// Comment-202411173 relates.
	/// [/Comment-202411174]
	/// [Comment-202411067]
	/// We slightly exponentially increase this on every bid, based on `timeIncrease`.
	/// todo-0 Not on every bid any more?
	/// [/Comment-202411067]
	/// todo-1 Reference Comment-202501025.
	uint256 public mainPrizeTimeIncrementInMicroSeconds;

	/// @notice Comment-202411064 applies.
	/// Equals the number of microseconds per second plus a small fraction of it.
	/// todo-0 But this will now be a divisor.
	/// Comment-202411067 relates.
	/// todo-1 Since we now increase `mainPrizeTimeIncrementInMicroSeconds` once per round,
	/// todo-1 Taras needs to simulate a better value for this.
	/// todo-1 Discussed at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735492056099589?thread_ts=1735275853.000929&cid=C02EDDE5UF8
	uint256 public timeIncrease;

	/// @notice Comment-202411064 applies.
	/// todo-1 Rename to `roundInitialDuration`.
	/// todo-1 It's really not round duration, but rather duration until the main prize.
	uint256 public initialSecondsUntilPrize;

	/// @notice The time when the last bidder will be granted the premission to claim the main prize.
	/// [Comment-202412152]
	/// On each bid, we calculate the new value of this variable
	/// by adding `mainPrizeTimeIncrementInMicroSeconds` to `max(mainPrizeTime, block.timestamp)`.
	/// [/Comment-202412152]
	uint256 public mainPrizeTime;

	/// @notice Bidding round counter.
	/// For the first round, this equals zero.
	uint256 public roundNum;

	/// @notice Next ETH bid price.
	/// [Comment-202501022]
	/// This is valid only after the 1st ETH bid has been placed in the current bidding round.
	/// todo-1 Therefore declare this `internal` and rename to `_...` and add a smarter getter if needed.
	/// todo-1 The same applies to other variables that are not always valid.
	/// todo-1 Think where to eference this comment.
	/// [/Comment-202501022]
	/// [Comment-202411065]
	/// We increase this based on `priceIncrease`.
	/// [/Comment-202411065]
	/// todo-1 Add a setter to change this? We don't currently have one, right? Because the price can be too high for anybody to bid.
	/// todo-1 Comment and document that after the owner executes the setter, they must set activation time to a point in the past
	/// todo-1 (specify exactly how long into the past), so that the new price immediately went into effect.
	uint256 public nextEthBidPrice;

	/// @notice Comment-202411064 applies.
	uint256 public roundInitialEthBidPriceMultiplier;

	/// @notice Comment-202411064 applies.
	uint256 public roundInitialEthBidPriceDivisor;

	/// @notice Comment-202411064 applies.
	/// Comment-202411065 relates.
	/// Equals a million plus a small fraction of it.
	/// todo-1 Rename to `ethBidPriceIncreaseParam`.
	uint256 public priceIncrease;

	/// @notice Comment-202411064 applies.
	/// [Comment-202501025]
	/// We divide `mainPrizeTimeIncrementInMicroSeconds` by this.
	/// [/Comment-202501025]
	uint256 public cstDutchAuctionDurationDivisor;

	/// @notice Last CST bid timestamp.
	/// A.k.a. CST Dutch auction start timestamp.
	/// Comment-202501022 applies.
	/// @dev Comment-202411168 relates.
	/// todo-0 This is really not last CST bid timestamp, but rather CST Dutch auction start timestamp.
	/// todo-0 So rename this.
	uint256 public lastCstBidTimeStamp;

	/// @notice
	/// [Comment-202411066]
	/// We don't let this fall below `startingBidPriceCSTMinLimit`.
	/// [/Comment-202411066]
	/// @dev This is based on an actual price someone pays, therefore Comment-202412033 applies.
	/// todo-1 Rename to `cstDutchAuctionStartingBidPrice`.
	uint256 public startingBidPriceCST;

	/// @notice Comment-202411064 applies.
	/// Comment-202411066 relates.
	/// todo-1 Rename to `cstDutchAuctionStartingBidPriceMinLimit`.
	uint256 public startingBidPriceCSTMinLimit;

	/// @notice Comment-202411064 applies.
	/// This number of CSTs is minted as a reward for each bid.
	/// todo-1 Rename to `cstRewardAmountForBidding` or `cstRewardAmountForBid`.
	/// todo-1 Or are we going to use it only for non-CST bids? If so reflect that in the name and/or write a comment.
	uint256 public tokenReward;

	/// @notice A RandomWalk NFT is allowed to be used for bidding only once.
	// mapping(uint256 nftId => bool nftWasUsed) public usedRandomWalkNfts;
	mapping(uint256 nftId => uint256 nftWasUsed) public usedRandomWalkNfts;

	// @notice The address of the account that placed the last bid.
	address public lastBidderAddress;

	// @notice The address of the account that placed the last CST bid.
	/// todo-1 Move some comments to here from near `stellarSpender`.
	address public lastCstBidderAddress;

	// /// todo-1 Rename to `lastBidTypeCode`.
	// CosmicSignatureConstants.BidType public lastBidType;

	/// @dev ToDo-202411098-0 applies.
	/// todo-1 Rename to `roundNumBids` or better `numBids`.
	/// todo-1 But better don't store this for past rounds.
	mapping(uint256 roundNum => uint256 numBids) public numRaffleParticipants;

	/// @notice We add an item on each bid.
	/// @dev
	/// [ToDo-202411098-0]
	/// Is it really necessary to save info about past rounds?
	/// But Nick wrote at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729540799827169?thread_ts=1729208829.862549&cid=C02EDDE5UF8 :
	///    Taras wanted to keep this info per round because he has another project that will be giving rewards
	///    based on bidding statistics. This project is called Prisoner' Dillema in Game Theory, you can search for it on Slack history.
	/// [/ToDo-202411098-0]
	/// todo-1 Rename to `roundBids` or  better `bids`.
	/// todo-1 But better don't store this for past rounds.
	mapping(uint256 roundNum => mapping(uint256 bidNum => address bidderAddress)) public raffleParticipants;

	/// @dev ToDo-202411098-0 applies.
	/// todo-1 Do we really need this?
	/// todo-1 Rename to `biddersInfo`.
	mapping(uint256 roundNum => mapping(address bidderAddress => CosmicSignatureConstants.BidderInfo)) public bidderInfo;

	// #endregion
	// #region Game Prize Percentage Parameters

	/// @notice The percentage of ETH in the game account to be paid to the bidding round main prize winner.
	/// Comment-202411064 applies.
	uint256 public mainEthPrizeAmountPercentage;

	/// @notice Comment-202411064 applies.
	uint256 public chronoWarriorEthPrizeAmountPercentage;

	/// @notice Comment-202411064 applies.
	uint256 public raffleTotalEthPrizeAmountPercentage;

	/// @notice Comment-202411064 applies.
	uint256 public stakingTotalEthRewardAmountPercentage;

	/// @notice Comment-202411064 applies.
	uint256 public charityEthDonationAmountPercentage;

	// #endregion
	// #region Game Prize Other Parameters and Variables

	/// @notice If bidding round main prize winner doesn't claim the prize within this timeout, anybody will be welcomed to claim it.
	/// Comment-202411064 applies.
	/// See also: `PrizesWallet.timeoutDurationToWithdrawPrizes`.
	/// @dev Comment-202412312 applies.
	uint256 public timeoutDurationToClaimMainPrize;

	// /// @notice Bidding round main prize winners.
	// /// @dev ToDo-202411098-0 applies.
	// /// I have replaced this with `PrizesWallet.mainPrizeWinnerAddresses`.
	// mapping(uint256 roundNum => address winnerAddress) public winners;

	// /// @notice Stellar Spender address.
	// /// This will remain zero if nobody bids with CST or everybody bids with a zero CST price.
	// /// Comment-202409179 relates.
	// /// todo-1 Move some of these comments to near `lastCstBidderAddress`.
	// address public stellarSpender;
	//
	// uint256 public stellarSpenderTotalSpentCst;

	/// @notice Endurance champion is the person who was the last bidder for the longest continuous period of time.
	/// [Comment-202411075]
	/// It makes no difference if they bid multiple times in a row. The durations do not get added up.
	/// [/Comment-202411075]
	/// @dev
	/// [Comment-202411099]
	/// Relevant logic prototype:
	/// https://github.com/PredictionExplorer/cosmic-signature-logic-prototyping/blob/main/contracts/ChampionFinder.sol
	/// [/Comment-202411099]
	address public enduranceChampionAddress;

	uint256 public enduranceChampionStartTimeStamp;
	uint256 public enduranceChampionDuration;
	uint256 public prevEnduranceChampionDuration;

	/// @notice Chrono-warrior is the person who was the endurance champion for the longest continuous period of time.
	/// Comment-202411075 applies.
	/// Comment-202411099 applies.
	address public chronoWarriorAddress;

	uint256 public chronoWarriorDuration;

	/// @notice The last CST bidder and Endurance Champion CST reward amount multiplier.
	/// Comment-202411064 applies.
	uint256 public cstRewardAmountMultiplier;

	/// @notice The number of raffle ETH prizes to be distributed to bidders.
	/// Comment-202411064 applies.
	uint256 public numRaffleEthPrizesForBidders;

	/// @notice The number of raffle CosmicSignature NFTs to be minted and distributed to bidders.
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForBidders;

	/// @notice The number of raffle CosmicSignature NFTs to be minted and distributed to RandomWalk NFT stakers.
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForRandomWalkNftStakers;

	// /// @dev todo-9 The type of this and other similar variables should be `uint256`.
	// bytes32 public raffleEntropy;

	// #endregion
	// #region Gap

	/// @dev
	/// [Comment-202412142]
	/// This makes this upgradeable contract more future-proof.
	/// This technique is described at https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable .
	/// [/Comment-202412142]
	/// [Comment-202412148]
	/// Although it's probably not needed here that much
	/// because this contract is the last in the inheritance list.
	/// [/Comment-202412148]
	uint256[1 << 255] private __gap_persistent;

	// todo-1 Transient storage is not yet supported for reference types.
	// /// @dev Comment-202412142 applies.
	// /// Comment-202412148 applies.
	// uint256[1 << 255] private transient __gap_transient;

	// #endregion
}

// #endregion
