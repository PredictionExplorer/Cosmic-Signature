// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

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

/// @dev Avoid combining big arrays with `mapping`s or dynamic arrays in the same contract.
/// In this storage contract, mapping writes use the internal, monotonically increasing `roundNum`.
/// User-provided historical round numbers are used by read-only statistics methods.
/// Future write paths accepting an arbitrary `roundNum_` must validate that the index is within
/// the intended fixed-array domain before writing storage.
abstract contract CosmicSignatureGameStorage is ICosmicSignatureGameStorage {
	// #region System Management

	// Empty.

	// #endregion
	// #region ETH Donations

	/// @notice
	/// [Comment-202605181]
	/// Details about ETH donations with additional info made to the Game.
	/// [/Comment-202605181]
	/// @dev Comment-202503111 relates and/or applies.
	EthDonationWithInfoRecord[] public ethDonationWithInfoRecords;

	// #endregion
	// #region Bid Statistics

	/// @notice
	/// [Comment-202605182]
	/// The address of the account that placed the last bid.
	/// [/Comment-202605182]
	/// @dev
	/// [Comment-202502044]
	/// Design note. This is the same as the last `bidderAddresses` item. So it could make sense to eliminate this variable.
	/// But let's leave it alone.
	/// [/Comment-202502044]
	address public lastBidderAddress;

	/// @notice
	/// [Comment-202605183]
	/// The address of the account that placed the last CST bid.
	/// This will remain zero if nobody bids with CST.
	/// [/Comment-202605183]
	address public lastCstBidderAddress;

	/// @dev
	/// [Comment-202411098]
	/// Design note. One might want to not save info about past bidding rounds.
	/// But the project founders consider using this info for other purposes.
	/// Comment-202502045 relates.
	/// [/Comment-202411098]
	/// Comment-202502044 relates.
	mapping(uint256 roundNum => BidderAddresses) public bidderAddresses;

	/// @dev Comment-202411098 applies.
	mapping(uint256 roundNum => mapping(address bidderAddress => BidderInfo)) public biddersInfo;

	/// @notice
	/// [Comment-202605184]
	/// Endurance Champion is the participant who remained the last bidder for the longest single continuous duration
	/// during the bidding round.
	/// It makes no difference if they bid multiple times in a row. The durations do not get added up.
	/// [/Comment-202605184]
	/// [Comment-202511053]
	/// See `${workspaceFolder}/docs/endurance-chrono-README.md` for details and possibly better definitions
	/// of Endurance Champion and Chrono-Warrior.
	/// [/Comment-202511053]
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

	/// @notice
	/// [Comment-202605185]
	/// Chrono-Warrior is the participant who remained Endurance Champion for the longest continuous duration
	/// during the bidding round.
	/// [/Comment-202605185]
	/// Comment-202511053 applies.
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

	/// @notice
	/// [Comment-202605186]
	/// Bidding round counter.
	/// It starts with zero.
	/// [/Comment-202605186]
	/// @dev Comment-202503092 applies.
	uint256 public roundNum;

	/// @notice
	/// [Comment-202605187]
	/// Delay duration from when the main prize gets claimed until the next bidding round activates.
	/// [/Comment-202605187]
	/// [Comment-202411064]
	/// This is a configurable parameter.
	/// [/Comment-202411064]
	/// [Comment-202412312]
	/// We do not automatically increase this.
	/// Comment-202411067 relates.
	/// [/Comment-202412312]
	/// @dev
	/// [Comment-202503106]
	/// We allow the contract owner to change this even after a bid was placed in the current bidding round.
	/// Comment-202606235 relates.
	/// Comment-202411236 relates.
	/// [/Comment-202503106]
	/// Comment-202503092 applies.
	uint256 public delayDurationBeforeRoundActivation;

	/// @notice
	/// [Comment-202605188]
	/// The current bidding round activation time.
	/// Starting at this point in time, people will be allowed to place bids.
	/// [/Comment-202605188]
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
	/// Comment-202508288 relates.
	/// Comment-202411064 applies.
	/// See also: `halveEthDutchAuctionEndingBidPrice`.
	uint256 public ethDutchAuctionDurationDivisor;

	/// @notice
	/// [Comment-202503084]
	/// ETH Dutch auction beginning bid price.
	/// We calculate this based on `ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER`.
	/// [/Comment-202503084]
	/// [Comment-202605192]
	/// After contract deployment, this variable remains zero until we assign a valid value to it.
	/// On the first bid of each bidding round (which is required to be ETH), we assign a valid value to this variable.
	/// [/Comment-202605192]
	/// Comment-202501063 relates.
	uint256 public ethDutchAuctionBeginningBidPrice;

	/// @notice
	/// [Comment-202501063]
	/// We calculate ETH Dutch auction ending bid price by dividing `ethDutchAuctionBeginningBidPrice` by this.
	/// Note that, according to Comment-202503084, `ethDutchAuctionBeginningBidPrice` has already been multiplied by
	/// `CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER`.
	/// [/Comment-202501063]
	/// Comment-202411064 applies.
	/// See also: `halveEthDutchAuctionEndingBidPrice`.
	uint256 public ethDutchAuctionEndingBidPriceDivisor;

	/// @notice
	/// [Comment-202411065]
	/// Next ETH bid price.
	/// We increase this based on `ethBidPriceIncreaseDivisor`.
	/// [/Comment-202411065]
	/// [Comment-202501022]
	/// This value is valid only after the 1st ETH bid has been placed in the current bidding round.
	/// [/Comment-202501022]
	uint256 public nextEthBidPrice;

	/// @notice Comment-202411065 relates.
	/// Comment-202411064 applies.
	uint256 public ethBidPriceIncreaseDivisor;

	/// @notice Comment-202502052 applies.
	/// Comment-202411064 applies.
	uint256 public ethBidRefundAmountInGasToSwallowMaxLimit;

	/// @notice
	/// [Comment-202605194]
	/// When the current CST Dutch auction began.
	/// [/Comment-202605194]
	/// Comment-202501022 applies.
	uint256 public cstDutchAuctionBeginningTimeStamp;

	/// @notice
	/// [Comment-202501025]
	/// We divide `mainPrizeTimeIncrementInMicroSeconds` by this.
	/// [/Comment-202501025]
	/// Comment-202411064 applies.
	/// Comment-202508288 relates.
	/// @dev Comment-202606057 relates.
	uint256 public cstDutchAuctionDurationDivisor;

	/// @notice
	/// [Comment-202411066]
	/// CST Dutch auction beginning bid price.
	/// We calculate this based on `CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER`.
	/// We don't let this fall below `cstDutchAuctionBeginningBidPriceMinLimit`.
	/// [/Comment-202411066]
	/// [Comment-202605197]
	/// This variable becomes valid when someone places a CST bid in the current bidding round.
	/// [/Comment-202605197]
	/// @dev
	/// [Comment-202605199]
	/// This value is based on an actual price someone pays, therefore Comment-202412033 applies.
	/// [/Comment-202605199]
	uint256 public cstDutchAuctionBeginningBidPrice;

	/// @notice
	/// [Comment-202605201]
	/// Next bidding round first CST Dutch auction beginning bid price.
	/// [/Comment-202605201]
	/// Comment-202504212 applies.
	uint256 public nextRoundFirstCstDutchAuctionBeginningBidPrice;

	/// @notice Comment-202411066 relates.
	/// Comment-202411064 applies.
	/// Comment-202504212 relates.
	uint256 public cstDutchAuctionBeginningBidPriceMinLimit;

	/// @notice
	/// [Comment-202605202]
	/// Each Random Walk NFT is allowed to be used for bidding only once.
	/// If an item of this array at a particular index is a nonzero it means the NFT with that ID has already been used for bidding.
	/// [/Comment-202605202]
	/// See also: `StakingWalletNftBase.usedNfts`.
	mapping(uint256 nftId => uint256 nftWasUsed) public usedRandomWalkNfts;

	/// @notice
	/// [Comment-202605203]
	/// The maximum allowed length of a bid message.
	/// [/Comment-202605203]
	/// [Comment-202409143]
	/// This limits the number of bytes, which can be fewer UTF-8 characters.
	/// [/Comment-202409143]
	/// Comment-202411064 applies.
	/// @dev
	/// [Comment-202605204]
	/// One might want to make this non-configurable.
	/// But I feel that by keeping this configurable we leave the door open to change message format
	/// and the logic the Front End and the Back End employ to process the message.
	/// [/Comment-202605204]
	uint256 public bidMessageLengthMaxLimit;

	/// @notice We mint this CST amount as a bidder reward for placing a bid.
	/// Comment-202411064 applies.
	/// @dev Comment-202606053 relates.
	uint256 public bidCstRewardAmount;

	// #endregion
	// #region Secondary Prizes

	/// @notice
	/// [Comment-202605206]
	/// CST prize amount used to award: Main Prize Winner; the Last CST Bidder; Endurance Champion;
	/// Chrono-Warrior; a bidder who won CST and Cosmic Signature NFT raffle; a Random Walk NFT staker.
	/// [/Comment-202605206]
	/// Comment-202411064 applies.
	uint256 public cstPrizeAmount;

	/// @notice
	/// [Comment-202605207]
	/// The percentage of ETH in the Game contract account to be paid to Chrono-Warrior.
	/// [/Comment-202605207]
	/// Comment-202411064 applies.
	uint256 public chronoWarriorEthPrizeAmountPercentage;

	/// @notice
	/// [Comment-202605208]
	/// The percentage of ETH in the Game contract account to be used for raffle ETH prizes to be distributed to bidders.
	/// [/Comment-202605208]
	/// Comment-202411064 applies.
	uint256 public raffleTotalEthPrizeAmountForBiddersPercentage;

	/// @notice
	/// [Comment-202605209]
	/// The number of raffle ETH prizes to be distributed to bidders.
	/// [/Comment-202605209]
	/// Comment-202411064 applies.
	uint256 public numRaffleEthPrizesForBidders;

	/// @notice
	/// [Comment-202605212]
	/// The number of raffle Cosmic Signature NFTs to be minted and distributed to bidders.
	/// The same winners will also receive newly minted CST prizes.
	/// [/Comment-202605212]
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForBidders;

	/// @notice
	/// [Comment-202605213]
	/// The number of raffle Cosmic Signature NFTs to be minted and distributed to random Random Walk NFT stakers.
	/// The same winners will also receive newly minted CST prizes.
	/// [/Comment-202605213]
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForRandomWalkNftStakers;

	/// @notice
	/// [Comment-202605214]
	/// The percentage of ETH in the Game contract account to reward Cosmic Signature NFT stakers.
	/// [/Comment-202605214]
	/// Comment-202411064 applies.
	uint256 public cosmicSignatureNftStakingTotalEthRewardAmountPercentage;

	// #endregion
	// #region Main Prize

	/// @notice Comment-202501025 applies.
	/// Comment-202412152 relates.
	/// Comment-202508288 relates.
	/// Comment-202411064 applies.
	uint256 public initialDurationUntilMainPrizeDivisor;

	/// @notice
	/// [Comment-202412152]
	/// The time when the last bidder will be granted the premission to claim the main prize.
	/// On the first bid in a round, we set this based on `mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor`.
	/// On each subsequent bid, we increase this based on `mainPrizeTimeIncrementInMicroSeconds`.
	/// [/Comment-202412152]
	/// Comment-202501022 applies.
	/// @dev Comment-202606175 relates.
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

	/// @notice
	/// [Comment-202605216]
	/// If the main prize winner doesn't claim the prize within this timeout, anybody will be welcomed to claim it.
	/// [/Comment-202605216]
	/// Comment-202411064 applies.
	/// Comment-202412312 applies.
	/// See also: `PrizesWallet.timeoutDurationToWithdrawPrizes`.
	uint256 public timeoutDurationToClaimMainPrize;

	/// @notice
	/// [Comment-202605217]
	/// The percentage of ETH in the Game contract account to be paid to the main prize beneficiary.
	/// [/Comment-202605217]
	/// Comment-202411064 applies.
	uint256 public mainEthPrizeAmountPercentage;

	// #endregion
	// #region Cosmic Signature Token

	/// @notice
	/// [Comment-202605218]
	/// The `CosmicSignatureToken` contract address.
	/// [/Comment-202605218]
	/// Comment-202411064 applies.
	CosmicSignatureToken public token;

	// #endregion
	// #region Random Walk NFT

	/// @notice
	/// [Comment-202605219]
	/// The `RandomWalkNFT` contract address.
	/// [/Comment-202605219]
	/// Comment-202411064 applies.
	RandomWalkNFT public randomWalkNft;

	// #endregion
	// #region Cosmic Signature NFT

	/// @notice
	/// [Comment-202605221]
	/// The `CosmicSignatureNft` contract address.
	/// [/Comment-202605221]
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

	/// @notice
	/// [Comment-202605222]
	/// The `MarketingWallet` contract address.
	/// [/Comment-202605222]
	/// Comment-202411064 applies.
	/// @dev
	/// [Comment-202605224]
	/// It's unnecessary to make this variable strongly typed.
	/// [/Comment-202605224]
	address public marketingWallet;

	/// @notice
	/// [Comment-202605225]
	/// At the end of each bidding round, we mint this CST amount for `marketingWallet`.
	/// [/Comment-202605225]
	/// Comment-202411064 applies.
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

	/// @notice
	/// [Comment-202605226]
	/// The percentage of ETH in the Game contract account to be donated to charity.
	/// [/Comment-202605226]
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
	/// In fact, `BiddingOpenBid`, does introduce a new variable, but that's just a test contract.
	/// [/Comment-202412148]
	// solhint-disable-next-line var-name-mixedcase
	uint256[1 << 30] private __gap_persistent;

	// Solidity currently does not support transient storage for reference types.
	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	// uint256[1 << 30] private transient __gap_transient;
	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;

	// #endregion
}

// #endregion
