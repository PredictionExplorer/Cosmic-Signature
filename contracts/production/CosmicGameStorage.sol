// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #endregion
// #region

import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { EthPrizesWallet } from "./EthPrizesWallet.sol";
import { ICosmicGameStorage } from "./interfaces/ICosmicGameStorage.sol";

// #endregion
// #region

abstract contract CosmicGameStorage is ICosmicGameStorage {
	// #region External Contracts and Other Addresses

	RandomWalkNFT public randomWalkNft;
	CosmicSignature public nft;
	CosmicToken public token;
	EthPrizesWallet public ethPrizesWallet;
	StakingWalletCosmicSignatureNft public stakingWalletCosmicSignatureNft;
	// todo-0 Make this strongly typed.
	address public stakingWalletRandomWalkNft;
	// todo-0 Make this strongly typed.
	address public marketingWallet;

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
	// #region Game State

	/// @notice Bidding round counter.
	/// For the first round, this equals zero.
	uint256 public roundNum;

	/// @notice ETH.
	/// [Comment-202411065]
	/// We increase this based on `priceIncrease`.
	/// [/Comment-202411065]
	uint256 public bidPrice;

	/// @notice
	/// [Comment-202411064]
	/// This is a configurable parameter.
	/// [/Comment-202411064]
	/// Comment-202411065 relates.
	uint256 public priceIncrease;

	/// @notice
	/// [Comment-202411066]
	/// We don't let this fall below `startingBidPriceCSTMinLimit`.
	/// [/Comment-202411066]
	uint256 public startingBidPriceCST;

	/// @notice Comment-202411064 applies.
	/// Comment-202411066 relates.
	uint256 public startingBidPriceCSTMinLimit;

	/// @notice Comment-202411064 applies.
	/// [Comment-202411067]
	/// @dev We slightly exponentially increase this after every bidding round, based on `timeIncrease`.
	/// [/Comment-202411067]
	uint256 public nanoSecondsExtra;

	/// @notice Comment-202411064 applies.
	/// Comment-202411067 relates.
	uint256 public timeIncrease;

	/// @notice Comment-202411064 applies.
	uint256 public initialBidAmountFraction;

	address public lastBidder;
	CosmicGameConstants.BidType public lastBidType;

	/// @notice A RandomWalk NFT is allowed to be used for bidding only once.
	mapping(uint256 nftId => bool nftWasUsed) public usedRandomWalkNFTs;

	/// @notice Comment-202411064 applies.
	uint256 public initialSecondsUntilPrize;

	uint256 public prizeTime;

	/// @notice Comment-202411064 applies.
	uint256 public timeoutClaimPrize;

	/// @notice We add an item on each bid.
	/// @dev
	/// [ToDo-202411098-0]
	/// Is it really necessary to save info about past rounds?
	/// But Nick wrote at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729540799827169?thread_ts=1729208829.862549&cid=C02EDDE5UF8 :
	///    Taras wanted to keep this info per round because he has another project that will be giving rewards
	///    based on bidding statistics. This project is called Prisoner' Dillema in Game Theory, you can search for it on Slack history.
	/// [/ToDo-202411098-0]
	mapping(uint256 roundNum => mapping(uint256 bidNum => address bidderAddress)) public raffleParticipants;

	/// @dev ToDo-202411098-0 applies.
	mapping(uint256 roundNum => uint256 numBids) public numRaffleParticipants;

	uint256 public lastCstBidTimeStamp;

	/// @dev This is initialized with a constant and is then slightly exponentially increased after every bidding round.
	uint256 public cstAuctionLength;

	/// @notice Comment-202411064 applies.
	/// todo-0 https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729547013232989
	uint256 public roundStartCstAuctionLength;

	/// @dev ToDo-202411098-0 applies.
	mapping(uint256 roundNum => mapping(address bidderAddress => CosmicGameConstants.BidderInfo)) public bidderInfo;

	/// @dev This will remain zero if nobody bids with CST.
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

	// #endregion
	// #region Percentages

	/// @notice The percentage of ETH in the game account to be paid to the main prize winner.
	/// Comment-202411064 applies.
	uint256 public mainPrizePercentage;

	/// @notice Comment-202411064 applies.
	uint256 public chronoWarriorEthPrizePercentage;

	/// @notice Comment-202411064 applies.
	uint256 public rafflePercentage;

	/// @notice Comment-202411064 applies.
	uint256 public stakingPercentage;

	/// @notice Comment-202411064 applies.
	uint256 public charityPercentage;

	// #endregion
	// #region Prize Claim Variables

	/// @notice Bidding round winners.
	/// @dev ToDo-202411098-0 applies.
	/// todo-0 But we do need to allow the winner to claim donated NFTs afterwards.
	/// todo-0 But maybe allow it only during the next round?
	/// todo-0 For at least how long it will last?
	mapping(uint256 roundNum => address bidderAddress) public winners;

	/// @notice Comment-202411064 applies.
	uint256 public numRaffleETHWinnersBidding;

	/// @notice Comment-202411064 applies.
	uint256 public numRaffleNFTWinnersBidding;

	/// @notice Comment-202411064 applies.
	uint256 public numRaffleNFTWinnersStakingRWalk;

	bytes32 public raffleEntropy;
	mapping(uint256 index => CosmicGameConstants.DonatedNFT) public donatedNFTs;
	uint256 public numDonatedNFTs;

	// #endregion
	// #region System Variables

	uint256 public donateWithInfoNumRecords;
	mapping(uint256 index => CosmicGameConstants.DonationInfoRecord) public donationInfoRecords;

	/// @notice Comment-202411064 applies.
	uint256 public activationTime;

	/// @notice Comment-202411064 applies.
	uint256 public tokenReward;

	/// @notice Comment-202411064 applies.
	uint256 public erc20RewardMultiplier;

	/// @notice Comment-202411064 applies.
	uint256 public marketingReward;

	/// @notice Comment-202411064 applies.
	/// [Comment-202409143]
	/// This limits the number of bytes, which can be fewer UTF-8 characters.
	/// [/Comment-202409143]
	uint256 public maxMessageLength;

	/// @notice Comment-202411064 applies.
	uint256 public systemMode;

	// #endregion
}

// #endregion
