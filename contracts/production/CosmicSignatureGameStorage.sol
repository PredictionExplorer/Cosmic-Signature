// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #endregion
// #region

import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { PrizesWallet } from "./PrizesWallet.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { MarketingWallet } from "./MarketingWallet.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { ICosmicSignatureGameStorage } from "./interfaces/ICosmicSignatureGameStorage.sol";

// #endregion
// #region

abstract contract CosmicSignatureGameStorage is ICosmicSignatureGameStorage {
	// #region System Parameters and Variables

	// /// @notice Comment-202411064 applies.
	// uint256 public systemMode;

	/// @notice Bidding round activation time. Starting at this point, people will be allowed to place bids.
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

	/// @notice Delay duration before the next bidding round.
	/// Specifies for how long to wait after main prize has been claimed to start the next bidding round.
	/// Comment-202411064 applies.
	uint256 public delayDurationBeforeNextRound;

	/// @notice On each bid, we mint this CST amount for `marketingWallet`.
	/// Comment-202411064 applies.
	/// @dev ToDo-202411182-1 relates.
	/// todo-0 Rename to `marketingCstRewardAmount`.
	/// todo-0 Even better, rename to `marketingWaletCstContributionAmount`.
	uint256 public marketingReward;

	/// @notice The maximum allowed length of a bid message.
	/// [Comment-202409143]
	/// This limits the number of bytes, which can be fewer UTF-8 characters.
	/// [/Comment-202409143]
	/// Comment-202411064 applies.
	uint256 public maxMessageLength;

	// #endregion
	// #region External Contract and Other Addresses

	/// @notice Comment-202411064 applies.
	PrizesWallet public prizesWallet;

	/// @notice Comment-202411064 applies.
	CosmicToken public token;

	/// @notice Comment-202411064 applies.
	/// todo-0 Make this strongly typed.
	address public marketingWallet;

	/// @notice Comment-202411064 applies.
	CosmicSignature public nft;

	/// @notice Comment-202411064 applies.
	RandomWalkNFT public randomWalkNft;

	/// @notice Comment-202411064 applies.
	StakingWalletCosmicSignatureNft public stakingWalletCosmicSignatureNft;

	/// @notice Comment-202411064 applies.
	/// todo-0 Make this strongly typed.
	address public stakingWalletRandomWalkNft;

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
	address public charity;

	// #endregion
	// #region Donation Variables

	uint256 public numDonationInfoRecords;
	mapping(uint256 index => CosmicGameConstants.DonationInfoRecord) public donationInfoRecords;
	/// todo-0 Eliminate this. Now this functionality lives in `IPrizesWallet` and `PrizesWallet`.
	uint256 public numDonatedNFTs;
	/// todo-0 Eliminate this. Now this functionality lives in `IPrizesWallet` and `PrizesWallet`.
	mapping(uint256 index => CosmicGameConstants.DonatedNFT) public donatedNFTs;

	// #endregion
	// #region Game Parameters and Variables

	/// @notice Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// [Comment-202411174]
	/// But in that case the logic does not emit an event.
	/// Comment-202411173 relates.
	/// [/Comment-202411174]
	/// [Comment-202411067]
	/// We slightly exponentially increase this on every bid, based on `timeIncrease`.
	/// [/Comment-202411067]
	uint256 public nanoSecondsExtra;

	/// @notice Comment-202411064 applies.
	/// Equals the number of microseonds per second plus a small fraction of it.
	/// Comment-202411067 relates.
	/// Rename to `nanoSecondsExtraIncreaseParam`.
	uint256 public timeIncrease;

	/// @notice Comment-202411064 applies.
	/// todo-0 Rename to `roundInitialDuration`.
	uint256 public initialSecondsUntilPrize;

	/// todo-0 Rename to `roundEndTime`.
	uint256 public prizeTime;

	/// @notice Bidding round counter.
	/// For the first round, this equals zero.
	uint256 public roundNum;

	/// @notice ETH bid price.
	/// [Comment-202411065]
	/// We increase this based on `priceIncrease`.
	/// [/Comment-202411065]
	/// todo-1 Rename to `ethBidPrice`.
	/// todo-1 Add a setter to change this? We don't currently have one, right? Because the price can be too high for anybody to bid.
	uint256 public bidPrice;

	/// @notice Comment-202411064 applies.
	/// Rename to `firstEthBidPriceDivisor`.
	uint256 public initialBidAmountFraction;

	/// @notice Comment-202411064 applies.
	/// Comment-202411065 relates.
	// Equals a million plus a small fraction of it.
	// todo-0 Rename to `ethBidPriceIncreaseParam`.
	uint256 public priceIncrease;

	/// @dev This is initialized with a constant and is then slightly exponentially increased after every bidding round.
	/// todo-0 Rename to `cstAuctionDuration`.
	uint256 public cstAuctionLength;

	/// @notice Comment-202411064 applies.
	/// todo-0 https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729547013232989
	/// todo-0 Rename to `roundStartCstAuctionDuration`.
	uint256 public roundStartCstAuctionLength;

	/// @notice Last CST bid timestamp.
	/// A.k.a. CST Dutch auction start time.
	/// @dev Comment-202411168 relates.
	uint256 public lastCstBidTimeStamp;

	/// @notice
	/// [Comment-202411066]
	/// We don't let this fall below `startingBidPriceCSTMinLimit`.
	/// [/Comment-202411066]
	uint256 public startingBidPriceCST;

	/// @notice Comment-202411064 applies.
	/// Comment-202411066 relates.
	uint256 public startingBidPriceCSTMinLimit;

	/// @notice Comment-202411064 applies.
	/// This number of CSTs is minted as a reward for each bid.
	/// rename to `cstRewardAmountForBidding`.
	uint256 public tokenReward;

	/// @notice A RandomWalk NFT is allowed to be used for bidding only once.
	mapping(uint256 nftId => bool nftWasUsed) public usedRandomWalkNFTs;

	address public lastBidder;

	/// todo-0 Do we really need this?
	/// todo-0 Rename to `lastBidTypeCode`.
	CosmicGameConstants.BidType public lastBidType;

	/// @dev ToDo-202411098-0 applies.
	/// Rename to `numBids`.
	mapping(uint256 roundNum => uint256 numBids) public numRaffleParticipants;

	/// @notice We add an item on each bid.
	/// @dev
	/// [ToDo-202411098-0]
	/// Is it really necessary to save info about past rounds?
	/// But Nick wrote at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729540799827169?thread_ts=1729208829.862549&cid=C02EDDE5UF8 :
	///    Taras wanted to keep this info per round because he has another project that will be giving rewards
	///    based on bidding statistics. This project is called Prisoner' Dillema in Game Theory, you can search for it on Slack history.
	/// [/ToDo-202411098-0]
	/// Rename to `bids`.
	mapping(uint256 roundNum => mapping(uint256 bidNum => address bidderAddress)) public raffleParticipants;

	/// @dev ToDo-202411098-0 applies.
	/// todo-0 Rename to `biddersInfo`.
	mapping(uint256 roundNum => mapping(address bidderAddress => CosmicGameConstants.BidderInfo)) public bidderInfo;

	// #endregion
	// #region Game Prize Percentage Parameters

	/// @notice The percentage of ETH in the game account to be paid to the main prize winner.
	/// Comment-202411064 applies.
	uint256 public mainPrizePercentage;

	/// @notice ETH.
	/// Comment-202411064 applies.
	uint256 public chronoWarriorEthPrizePercentage;

	/// @notice ETH.
	/// Comment-202411064 applies.
	uint256 public rafflePercentage;

	/// @notice ETH.
	/// Comment-202411064 applies.
	uint256 public stakingPercentage;

	/// @notice ETH.
	/// Comment-202411064 applies.
	uint256 public charityPercentage;

	// #endregion
	// #region Game Prize Other Parameters and Variables

	/// @notice Comment-202411064 applies.
	uint256 public timeoutDurationToClaimMainPrize;

	/// @notice Bidding round winners.
	/// @dev ToDo-202411098-0 applies.
	/// todo-0 But we do need to allow the winner to claim donated NFTs afterwards.
	/// todo-0 But maybe allow it only during the next round?
	/// todo-0 For at least how long it will last?
	mapping(uint256 roundNum => address bidderAddress) public winners;

	/// @dev This will remain zero if nobody bids with CST or everybody bids with a zero CST price.
	/// Comment-202409179 relates.
	address public stellarSpender;

	uint256 public stellarSpenderTotalSpentCst;

	/// @notice Endurance champion is the person who was the last bidder for the longest continuous period of time.
	/// [Comment-202411075]
	/// It makes no difference if they bid multiple times in a row. The durations do not get added up.
	/// [/Comment-202411075]
	/// @dev
	/// [Comment-202411099]
	/// Relevant logic prototype:
	/// https://github.com/PredictionExplorer/cosmic-signature-logic-prototyping/blob/main/contracts/ChampionFinder.sol
	/// [/Comment-202411099]
	address public enduranceChampion;

	uint256 public enduranceChampionStartTimeStamp;
	uint256 public enduranceChampionDuration;
	uint256 public prevEnduranceChampionDuration;

	/// @notice Chrono-warrior is the person who was the endurance champion for the longest continuous period of time.
	/// Comment-202411075 applies.
	/// Comment-202411099 applies.
	address public chronoWarrior;

	uint256 public chronoWarriorDuration;

	/// @notice Stellar Spender and Endurance Champion CST reward amount multiplier.
	/// Comment-202411064 applies.
	/// todo-0 Rename to `cstRewardAmountMultiplier`.
	uint256 public erc20RewardMultiplier;

	/// @notice Comment-202411064 applies.
	uint256 public numRaffleETHWinnersBidding;

	/// @notice Comment-202411064 applies.
	uint256 public numRaffleNFTWinnersBidding;

	/// @notice Comment-202411064 applies.
	uint256 public numRaffleNFTWinnersStakingRWalk;

	bytes32 public raffleEntropy;

	// #endregion
}

// #endregion
