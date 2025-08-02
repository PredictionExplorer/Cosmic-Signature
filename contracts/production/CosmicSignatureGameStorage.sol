// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { PrizesWallet } from "./PrizesWallet.sol";
import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { ICosmicSignatureGameStorage } from "./interfaces/ICosmicSignatureGameStorage.sol";

// #endregion
// #region

/// todo-1 +++ Avoid combining big arrays with `mapping`s or dynamic arrays in the same contract.
/// todo-1 +++ But where we do so, consider validating that a big array item index passed to a method,
/// todo-1 +++ such as `roundNum_`,  is not too big.
/// todo-1 +++ Otherwise a collision can create a vulnerability.
/// todo-1 +++ Really, `mapping`s and dynamic arrays (including strings) are evil. Avoid them!
/// todo-1 --- Write a better todo near each `mapping` and dynamic array to eliminate them and/or review the code.
///
/// todo-1 +++ Think of what params are currently not configurable, but might need to be configurable, such as `nextEthBidPrice`.
/// todo-1 +++ Consider making some params non-configurable.
abstract contract CosmicSignatureGameStorage is ICosmicSignatureGameStorage {
	// #region System Management

	// Empty.

	// #endregion
	// #region ETH Donations

	/// @notice Details about ETH donations with additional info made to the Game.
	/// @dev Comment-202503111 relates and/or applies.
	EthDonationWithInfoRecord[] public ethDonationWithInfoRecords;

	// #endregion
	// #region Bid Statistics

	// /// todo-9 Rename to `lastBidTypeCode`.
	// BidType public lastBidType;

	/// @notice The address of the account that placed the last bid.
	/// @dev
	/// [Comment-202502044]
	/// Issue. This is the same as the last `bidderAddresses` item. So it could make sense to eliminate this variable.
	/// But let's leave it alone.
	/// [/Comment-202502044]
	address public lastBidderAddress;

	/// @notice The address of the account that placed the last CST bid.
	/// This will remain zero if nobody bids with CST.
	address public lastCstBidderAddress;

	/// @dev
	/// [Comment-202411098]
	/// Issue. One might want to not save info about past bidding rounds.
	/// But the project founders consider using this info for other purposes.
	/// Comment-202502045 relates.
	/// [/Comment-202411098]
	/// Comment-202502044 relates.
	mapping(uint256 roundNum => BidderAddresses) public bidderAddresses;

	/// @dev Comment-202411098 applies.
	mapping(uint256 roundNum => mapping(address bidderAddress => BidderInfo)) public biddersInfo;

	/// @notice Endurance champion is the person who was the last bidder for the longest continuous period of time.
	/// [Comment-202411075]
	/// It makes no difference if they bid multiple times in a row. The durations do not get added up.
	/// [/Comment-202411075]
	/// Comment-202501308 relates.
	/// @dev
	/// [Comment-202411099]
	/// Relevant logic prototype:
	/// https://github.com/PredictionExplorer/cosmic-signature-logic-prototyping/blob/main/contracts/ChampionFinder.sol
	/// [/Comment-202411099]
	address public enduranceChampionAddress;

	/// @notice
	/// [Comment-202501308]
	/// This is valid only if `enduranceChampionAddress` is a nonzero.
	/// [/Comment-202501308]
	uint256 public enduranceChampionStartTimeStamp;

	/// @notice Comment-202501308 applies.
	uint256 public enduranceChampionDuration;

	uint256 public prevEnduranceChampionDuration;

	/// @notice Chrono-warrior is the person who was the endurance champion for the longest continuous period of time.
	/// Comment-202411075 applies.
	/// Comment-202503074 relates.
	/// @dev Comment-202411099 applies.
	address public chronoWarriorAddress;

	/// @notice
	/// [Comment-202503074]
	/// This is valid only if `chronoWarriorAddress` is a nonzero.
	/// [/Comment-202503074]
	uint256 public chronoWarriorDuration;

	// #endregion
	// #region Bidding

	/// @notice Bidding round counter.
	/// @dev Comment-202503092 applies.
	uint256 public roundNum;

	/// @notice Delay duration from when the main prize gets claimed until the next bidding round activates.
	/// [Comment-202411064]
	/// This is a configurable parameter.
	/// todo-1 +++ Review where this comment is referenced. Done on Mar 9.
	/// [/Comment-202411064]
	/// [Comment-202412312]
	/// We do not automatically increase this.
	/// Comment-202411067 relates.
	/// [/Comment-202412312]
	/// @dev
	/// [Comment-202503106]
	/// We allow the contract owner to change this even if the current bidding round is active.
	/// Comment-202411236 relates.
	/// todo-1 The backend and frontend must expect that `delayDurationBeforeRoundActivation` changes any time.
	/// [/Comment-202503106]
	/// Comment-202503092 applies.
	uint256 public delayDurationBeforeRoundActivation;

	/// @notice The current bidding round activation time.
	/// Starting at this point in time, people will be allowed to place bids.
	/// Comment-202411064 applies.
	/// [Comment-202411172]
	/// At the same time, this is a variable that the logic changes.
	/// [/Comment-202411172]
	/// @dev Comment-202503135 relates.
	/// [Comment-202411236]
	/// We allow the contract owner to change this under the conditions described in Comment-202503108.
	/// This design leaves the door open for the contract owner to change this to a point in the future,
	/// change some parameters, and then restore this.
	/// Comment-202508105 relates.
	/// Comment-202503106 relates.
	/// todo-1 The backend and frontend must expect that `roundActivationTime` changes any time.
	/// [/Comment-202411236]
	/// [Comment-202503092]
	/// Conceptually, every point in time is within a bidding round, which number or index is specified by `roundNum`.
	/// The first bidding round begins on the Game contract deployment, which is when `roundNum` is initialized with zero.
	/// Another bidding round begins when main prize gets claimed, which is when `roundNum` is incremented.
	/// However, each bidding round, including the first one, becomes active at some point after it begins,
	/// as specified by `roundActivationTime`.
	/// The delay duration from when another (not the first) bidding round begins and until it activates
	/// is specified by `delayDurationBeforeRoundActivation`.
	/// [/Comment-202503092]
	uint256 public roundActivationTime;

	/// @notice Comment-202501025 applies.
	/// Comment-202411064 applies.
	/// See also: `HalveEthDutchAuctionEndingBidPrice`.
	uint256 public ethDutchAuctionDurationDivisor;

	/// @notice ETH Dutch auction beginning bid price.
	/// [Comment-202503084]
	/// We increse this based on `ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER`.
	/// [/Comment-202503084]
	/// After contract deployment, this variable remains zero until we assign a valid value to it.
	/// On the first bid of each bidding round (which is required to be ETH), we assign a valid value to this variable.
	/// Comment-202501063 relates.
	uint256 public ethDutchAuctionBeginningBidPrice;

	/// @notice
	/// [Comment-202501063]
	/// We calculate ETH Dutch auction ending bid price by dividing `ethDutchAuctionBeginningBidPrice` by this.
	/// Note that, according to Comment-202503084, `ethDutchAuctionBeginningBidPrice` has already been multiplied by
	/// `CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER`.
	/// [/Comment-202501063]
	/// Comment-202411064 applies.
	/// See also: `HalveEthDutchAuctionEndingBidPrice`.
	uint256 public ethDutchAuctionEndingBidPriceDivisor;

	/// @notice Next ETH bid price.
	/// [Comment-202501022]
	/// This value is valid only after the 1st ETH bid has been placed in the current bidding round.
	/// [/Comment-202501022]
	/// [Comment-202411065]
	/// We increase this based on `ethBidPriceIncreaseDivisor`.
	/// [/Comment-202411065]
	uint256 public nextEthBidPrice;

	/// @notice Comment-202411065 relates.
	/// Comment-202411064 applies.
	uint256 public ethBidPriceIncreaseDivisor;

	/// @notice Comment-202502052 applies.
	/// Comment-202411064 applies.
	uint256 public ethBidRefundAmountInGasToSwallowMaxLimit;

	/// @notice When the current CST Dutch auction began.
	/// Comment-202501022 applies.
	uint256 public cstDutchAuctionBeginningTimeStamp;

	/// @notice
	/// [Comment-202501025]
	/// We divide `mainPrizeTimeIncrementInMicroSeconds` by this.
	/// [/Comment-202501025]
	/// Comment-202411064 applies.
	uint256 public cstDutchAuctionDurationDivisor;

	/// @notice CST Dutch auction beginning bid price.
	/// [Comment-202411066]
	/// We increse this based on `CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER`.
	/// We don't let this fall below `cstDutchAuctionBeginningBidPriceMinLimit`.
	/// [/Comment-202411066]
	/// This variable becomes valid when someone places a CST bid in the current bidding round.
	/// @dev This value is based on an actual price someone pays, therefore Comment-202412033 applies.
	uint256 public cstDutchAuctionBeginningBidPrice;

	/// @notice Next bidding round first CST Dutch auction beginning bid price.
	/// Comment-202504212 applies.
	uint256 public nextRoundFirstCstDutchAuctionBeginningBidPrice;

	/// @notice Comment-202411066 relates.
	/// Comment-202411064 applies.
	/// Comment-202504212 relates.
	uint256 public cstDutchAuctionBeginningBidPriceMinLimit;

	/// @notice Each Random Walk NFT is allowed to be used for bidding only once.
	/// If an item of this array at a particular index is a nonzero it means the NFT with that ID has already been used for bidding.
	/// See also: `StakingWalletNftBase.usedNfts`.
	mapping(uint256 nftId => uint256 nftWasUsed) public usedRandomWalkNfts;

	/// @notice The maximum allowed length of a bid message.
	/// [Comment-202409143]
	/// This limits the number of bytes, which can be fewer UTF-8 characters.
	/// [/Comment-202409143]
	/// Comment-202411064 applies.
	/// @dev One might want to make this non-configurable.
	/// But I feel that by keeping this configurable we leave the door open to change message format
	/// and the logic the Front End and the Back End employ to process the message.
	uint256 public bidMessageLengthMaxLimit;

	/// @notice We mint this CST amount as a bidder reward for each bid.
	/// We do it even for a CST bid.
	/// Comment-202411064 applies.
	uint256 public cstRewardAmountForBidding;

	// #endregion
	// #region Secondary Prizes

	/// @notice The last CST bidder and Endurance Champion CST prize amount multiplier.
	/// It multiplies the number of bids in the current bidding round.
	/// Comment-202411064 applies.
	uint256 public cstPrizeAmountMultiplier;

	/// @notice The percentage of ETH in the Game contract account to be paid to Crono-Warrior.
	/// Comment-202411064 applies.
	uint256 public chronoWarriorEthPrizeAmountPercentage;

	/// @notice The percentage of ETH in the Game contract account to be used for raffle ETH prizes to be distributed to bidders.
	/// Comment-202411064 applies.
	uint256 public raffleTotalEthPrizeAmountForBiddersPercentage;

	/// @notice The number of raffle ETH prizes to be distributed to bidders.
	/// Comment-202411064 applies.
	uint256 public numRaffleEthPrizesForBidders;

	/// @notice The number of raffle Cosmic Signature NFTs to be minted and distributed to bidders.
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForBidders;

	/// @notice The number of raffle Cosmic Signature NFTs to be minted and distributed to random Random Walk NFT stakers.
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForRandomWalkNftStakers;

	/// @notice The percentage of ETH in the Game contract account to reward Cosmic Signature NFT stakers.
	/// Comment-202411064 applies.
	uint256 public cosmicSignatureNftStakingTotalEthRewardAmountPercentage;

	// #endregion
	// #region Main Prize

	/// @notice Comment-202501025 applies.
	/// Comment-202411064 applies.
	uint256 public initialDurationUntilMainPrizeDivisor;

	/// @notice The time when the last bidder will be granted the premission to claim the main prize.
	/// Comment-202501022 applies.
	/// [Comment-202412152]
	/// On each bid, we increase this based on `mainPrizeTimeIncrementInMicroSeconds`.
	/// [/Comment-202412152]
	uint256 public mainPrizeTime;

	/// @notice Comment-202412152 relates.
	/// Comment-202501025 relates.
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// [Comment-202411067]
	/// We slightly exponentially increase this on every main prize claim, based on `mainPrizeTimeIncrementIncreaseDivisor`.
	/// Comment-202412312 relates.
	/// [/Comment-202411067]
	uint256 public mainPrizeTimeIncrementInMicroSeconds;

	/// @notice Comment-202501025 applies.
	/// Comment-202411067 relates.
	/// Comment-202411064 applies.
	uint256 public mainPrizeTimeIncrementIncreaseDivisor;

	/// @notice If the main prize winner doesn't claim the prize within this timeout, anybody will be welcomed to claim it.
	/// Comment-202411064 applies.
	/// Comment-202412312 applies.
	/// See also: `PrizesWallet.timeoutDurationToWithdrawPrizes`.
	uint256 public timeoutDurationToClaimMainPrize;

	/// @notice The percentage of ETH in the Game contract account to be paid to the main prize beneficiary.
	/// Comment-202411064 applies.
	uint256 public mainEthPrizeAmountPercentage;

	// #endregion
	// #region Cosmic Signature Token

	/// @notice The `CosmicSignatureToken` contract address.
	/// Comment-202411064 applies.
	CosmicSignatureToken public token;

	// #endregion
	// #region Random Walk NFT

	/// @notice The `RandomWalkNFT` contract address.
	/// Comment-202411064 applies.
	RandomWalkNFT public randomWalkNft;

	// #endregion
	// #region Cosmic Signature NFT

	/// @notice The `CosmicSignatureNft` contract address.
	/// Comment-202411064 applies.
	CosmicSignatureNft public nft;

	// #endregion
	// #region Prizes Wallet

	/// @notice Comment-202411064 applies.
	PrizesWallet public prizesWallet;

	// #endregion
	// #region NFT Staking

	/// @notice Comment-202411064 applies.
	StakingWalletRandomWalkNft public stakingWalletRandomWalkNft;

	/// @notice Comment-202411064 applies.
	StakingWalletCosmicSignatureNft public stakingWalletCosmicSignatureNft;

	// #endregion
	// #region Marketing

	/// @notice The `MarketingWallet` contract address.
	/// Comment-202411064 applies.
	/// @dev It's unnecessary to make this variable strongly typed.
	address public marketingWallet;

	/// @notice At the end of each bidding round, we mint this CST amount for `marketingWallet`.
	/// Comment-202411064 applies.
	/// @dev
	/// todo-1 Ask Taras if he is eventually going to set this to zero.
	/// todo-1 Asked at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1735320400279989?thread_ts=1731872794.061669&cid=C02EDDE5UF8
	/// todo-1 If so, before making the mint call check that this is a nonzero.
	/// todo-1 But maybe this should not be zero because the DAO will keep doing something.
	/// todo-1 Besides, rounds will keep getting longer.
	uint256 public marketingWalletCstContributionAmount;

	// #endregion
	// #region Charity

	/// @notice Comment-202411064 applies.
	/// @dev
	/// [Comment-202411078]
	/// On main prize claim, we transfer ETH directly to this address.
	/// This is intended to be our own `CharityWallet`.
	/// But even if this was a 3rd party address, it could be safe to assume that it doesn't host a malitios contract.
	/// A malitios contract can inflict damage, such as use an excessive amount of gas.
	/// Therefore if this is a 3rd party address it's important that someone conducted due-diligence on it.
	/// Comment-202411077 relates.
	/// [/Comment-202411078]
	address public charityAddress;

	/// @notice The percentage of ETH in the Game contract account to be donated to charity.
	/// Comment-202411064 applies.
	uint256 public charityEthDonationAmountPercentage;

	// #endregion
	// #region DAO

	// Empty.

	// #endregion
	// #region Gap

	/// @dev
	/// [Comment-202412142]
	/// This reserved storage space makes this upgradeable contract more future-proof.
	/// This technique is described at https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable .
	/// [/Comment-202412142]
	/// [Comment-202412148]
	/// Although it's probably not needed here that much because this contract is the last in the inheritance list
	/// among those containing storage variables.
	/// [/Comment-202412148]
	// solhint-disable-next-line var-name-mixedcase
	uint256[1 << 255] private __gap_persistent;

	// todo-1 Transient storage is not yet supported for reference types.
	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	// uint256[1 << 255] private transient __gap_transient;
	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;

	// #endregion
}

// #endregion
