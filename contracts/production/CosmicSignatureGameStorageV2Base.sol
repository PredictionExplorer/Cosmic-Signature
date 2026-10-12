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

abstract contract CosmicSignatureGameStorageV2Base is ICosmicSignatureGameStorage {
	// #region System Management

	// Empty.

	// #endregion
	// #region ETH Donations

	/// @notice Comment-202605181 applies.
	/// @dev Comment-202503111 relates and/or applies.
	EthDonationWithInfoRecord[] public ethDonationWithInfoRecords;

	// #endregion
	// #region Bid Statistics

	// /// @dev todo-9 Rename to `lastBidTypeCode`.
	// BidType public lastBidType;

	/// @notice Comment-202605182 applies.
	/// @dev Comment-202502044 applies.
	address public lastBidderAddress;

	/// @notice Comment-202605183 applies.
	address public lastCstBidderAddress;

	/// @dev Comment-202411098 applies.
	/// Comment-202502044 relates.
	/// Comment-202610054 applies.
	/// ToDo-202607169-1 applies.
	/// [Comment-202611032]
	/// OpenZeppelin storage layout validation compares the layout that the deployment manifest records
	/// for the deployed implementation with the layout of the new implementation. For each variable, it reports
	/// a rename unless the new variable's `oz-renamed-from` names the recorded variable, and, when the names are equal,
	/// it also reports a rename if the new variable's `oz-renamed-from` differs from the recorded one.
	/// It reports a type change unless the new variable's `oz-retyped-from` names the recorded type.
	/// The manifest records each deployed implementation together with its annotations.
	/// So the annotations below must stay in the sources forever. Removing one is harmless for the next deployment,
	/// but the deployment after that would be rejected with an error like "Renamed `x` to `x`",
	/// because its annotation would no longer match the recorded one.
	/// The tests upgrade from the V1 sources in this repository, which were refactored to V3 names,
	/// so those sources carry the same `oz-renamed-from` annotations where the deployed V1 names differ.
	/// Details and evidence: `docs/cosmic-signature-game-upgrade-storage-annotations.md`.
	/// [/Comment-202611032]
	/// @custom:oz-renamed-from bidderAddresses
	/// @custom:oz-retyped-from mapping(uint256 => ICosmicSignatureGameStorage.BidderAddresses)
	mapping(uint256 roundNum => RoundStats) public roundStats;

	/// @dev Comment-202411098 applies.
	/// Comment-202610054 applies.
	mapping(uint256 roundNum => mapping(address bidderAddress => BidderInfo)) public biddersInfo;

	/// @notice Comment-202605184 applies.
	/// Comment-202511053 applies.
	/// Comment-202501308 relates.
	/// @dev Comment-202411099 applies.
	address public enduranceChampionAddress;

	/// @notice Comment-202501308 applies.
	uint256 public enduranceChampionStartTimeStamp;

	/// @notice Comment-202501308 applies.
	uint256 public enduranceChampionDuration;

	uint256 public prevEnduranceChampionDuration;

	/// @notice Comment-202605185 applies.
	/// Comment-202511053 applies.
	/// Comment-202503074 relates.
	/// @dev Comment-202411099 applies.
	address public chronoWarriorAddress;

	/// @notice Comment-202503074 applies.
	uint256 public chronoWarriorDuration;

	// #endregion
	// #region Bidding

	/// @notice Comment-202605186 applies.
	/// @dev Comment-202503092 applies.
	uint256 public roundNum;

	/// @notice Comment-202605187 applies.
	/// Comment-202411064 applies.
	/// Comment-202412312 applies.
	/// @dev Comment-202503106 applies.
	/// Comment-202503092 applies.
	uint256 public delayDurationBeforeRoundActivation;

	/// @notice Comment-202605188 applies.
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// @dev Comment-202503135 relates.
	/// Comment-202411236 applies.
	/// Comment-202503092 applies.
	uint256 public roundActivationTime;

	/// @notice Comment-202501025 applies.
	/// Comment-202508288 relates.
	/// Comment-202411064 applies.
	/// See also: `halveEthDutchAuctionEndingBidPrice`.
	uint256 public ethDutchAuctionDurationDivisor;

	/// @notice Comment-202503084 applies.
	/// Comment-202605192 applies.
	/// Comment-202501063 relates.
	uint256 public ethDutchAuctionBeginningBidPrice;

	/// @notice Comment-202501063 applies.
	/// Comment-202411064 applies.
	/// See also: `halveEthDutchAuctionEndingBidPrice`.
	uint256 public ethDutchAuctionEndingBidPriceDivisor;

	/// @notice Comment-202411065 applies.
	/// Comment-202501022 applies.
	uint256 public nextEthBidPrice;

	/// @notice Comment-202411065 relates.
	/// Comment-202411064 applies.
	uint256 public ethBidPriceIncreaseDivisor;

	/// @notice Comment-202502052 applies.
	/// Comment-202411064 applies.
	uint256 public ethBidRefundAmountInGasToSwallowMaxLimit;

	/// @notice Comment-202605194 applies.
	/// Comment-202501022 applies.
	uint256 public cstDutchAuctionBeginningTimeStamp;

	/// @notice
	/// [Comment-202608317]
	/// In V2 only, `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor` are used.
	/// In V3+, the CST bid price declines at the bid CST reward rate instead, as explained in Comment-202611023,
	/// so V3+ neither reads nor writes these variables.
	/// [/Comment-202608317]
	/// [Comment-202606101]
	/// How long CST Dutch auction lasts.
	/// We reduce this on each ETH bid and increase on each CST bid, based on `cstDutchAuctionDurationChangeDivisor`.
	/// [Comment-202608312]
	/// As a result, bidders are encouraged to place the same number of ETH and CST bids.
	/// But an unintended consequence is that an ETH bid causes a small instant reduction of CST bid price, which is OK.
	/// [/Comment-202608312]
	/// [/Comment-202606101]
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// @dev
	/// [Comment-202608315]
	/// One might want to make this non-configurable. But when we increase `div` in the Comment-202606059 formula,
	/// we also must increase `var` if `var < div`.
	/// [/Comment-202608315]
	/// [Comment-202606057]
	/// This occupies the same storage slot as `CosmicSignatureGameStorage.cstDutchAuctionDurationDivisor`.
	/// [/Comment-202606057]
	/// [ToDo-202607169-1]
	/// Before upgrading to the next contract version, revisit OpenZeppelin annotations
	/// that acknowledge storage variable renames or type changes.
	/// [/ToDo-202607169-1]
	/// Comment-202611032 applies.
	/// @custom:oz-renamed-from cstDutchAuctionDurationDivisor
	uint256 public cstDutchAuctionDuration;

	/// @notice Comment-202411066 applies.
	/// In V3+, Comment-202611024 applies instead of the minimum limit part of Comment-202411066.
	/// Comment-202605197 applies.
	/// @dev Comment-202605199 applies.
	uint256 public cstDutchAuctionBeginningBidPrice;

	/// @notice Comment-202605201 applies.
	/// Comment-202504212 applies.
	/// In V3+, this is neither read nor written. Comment-202611025 applies.
	uint256 public nextRoundFirstCstDutchAuctionBeginningBidPrice;

	/// @notice Comment-202411066 relates.
	/// Comment-202411064 applies.
	/// Comment-202504212 relates.
	/// In V3+, this is neither read nor written. Comment-202611025 applies.
	uint256 public cstDutchAuctionBeginningBidPriceMinLimit;

	/// @notice Comment-202605202 applies.
	/// See also: `StakingWalletNftBase.usedNfts`.
	mapping(uint256 nftId => uint256 nftWasUsed) public usedRandomWalkNfts;

	/// @notice Comment-202605203 applies.
	/// Comment-202409143 applies.
	/// Comment-202411064 applies.
	/// @dev Comment-202605204 applies.
	uint256 public bidMessageLengthMaxLimit;

	/// @notice In V2+, we use this to calculate the CST amount to mint as a bidder reward for placing a bid.
	/// In V2 vs. V3+, the formulas are different.
	/// Comment-202411064 applies.
	/// @dev
	/// [Comment-202606053]
	/// This occupies the same storage slot as `CosmicSignatureGameStorage.bidCstRewardAmount`.
	/// [/Comment-202606053]
	/// ToDo-202607169-1 applies.
	/// Comment-202611032 applies.
	/// // @custom:oz-renamed-from cstRewardAmountForBidding
	/// @custom:oz-renamed-from bidCstRewardAmount
	uint256 public bidCstRewardAmountMultiplier;

	// #endregion
	// #region Secondary Prizes

	/// @notice Comment-202605206 applies.
	/// Comment-202411064 applies.
	uint256 public cstPrizeAmount;

	/// @notice Comment-202605207 applies.
	/// Comment-202411064 applies.
	uint256 public chronoWarriorEthPrizeAmountPercentage;

	/// @notice Comment-202605208 applies.
	/// Comment-202411064 applies.
	uint256 public raffleTotalEthPrizeAmountForBiddersPercentage;

	/// @notice Comment-202605209 applies.
	/// Comment-202411064 applies.
	uint256 public numRaffleEthPrizesForBidders;

	/// @notice Comment-202605212 applies.
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForBidders;

	/// @notice Comment-202605213 applies.
	/// Comment-202411064 applies.
	uint256 public numRaffleCosmicSignatureNftsForRandomWalkNftStakers;

	/// @notice Comment-202605214 applies.
	/// Comment-202411064 applies.
	uint256 public cosmicSignatureNftStakingTotalEthRewardAmountPercentage;

	// #endregion
	// #region Main Prize

	/// @notice Comment-202501025 applies.
	/// Comment-202412152 relates.
	/// Comment-202508288 relates.
	/// Comment-202411064 applies.
	/// [Comment-202611031]
	/// In V3+, this also sets the maximum CST Dutch auction beginning bid price,
	/// which is the bid CST reward of the initial duration until main prize. Comment-202611025 applies.
	/// [/Comment-202611031]
	uint256 public initialDurationUntilMainPrizeDivisor;

	/// @notice Comment-202412152 applies.
	/// Comment-202501022 applies.
	/// @dev Comment-202606175 relates.
	uint256 public mainPrizeTime;

	/// @notice Comment-202412152 relates.
	/// Comment-202501025 relates.
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// Comment-202411067 applies.
	uint256 public mainPrizeTimeIncrementInMicroSeconds;

	/// @notice Comment-202501025 applies.
	/// Comment-202411067 relates.
	/// Comment-202411064 applies.
	uint256 public mainPrizeTimeIncrementIncreaseDivisor;

	/// @notice Comment-202605216 applies.
	/// Comment-202411064 applies.
	/// Comment-202412312 applies.
	/// See also: `PrizesWallet.timeoutDurationToWithdrawPrizes`.
	uint256 public timeoutDurationToClaimMainPrize;

	/// @notice Comment-202605217 applies.
	/// Comment-202411064 applies.
	uint256 public mainEthPrizeAmountPercentage;

	// #endregion
	// #region Cosmic Signature Token

	/// @notice Comment-202605218 applies.
	/// Comment-202411064 applies.
	CosmicSignatureToken public token;

	// #endregion
	// #region Random Walk NFT

	/// @notice Comment-202605219 applies.
	/// Comment-202411064 applies.
	RandomWalkNFT public randomWalkNft;

	// #endregion
	// #region Cosmic Signature NFT

	/// @notice Comment-202605221 applies.
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

	/// @notice Comment-202605222 applies.
	/// Comment-202411064 applies.
	/// @dev Comment-202605224 applies.
	address public marketingWallet;

	/// @notice Comment-202605225 applies.
	/// Comment-202411064 applies.
	uint256 public marketingWalletCstContributionAmount;

	// #endregion
	// #region Charity

	/// @notice Comment-202411064 applies.
	/// @dev Comment-202411078 applies.
	address public charityAddress;

	/// @notice Comment-202605226 applies.
	/// Comment-202411064 applies.
	uint256 public charityEthDonationAmountPercentage;

	// #endregion
	// #region DAO

	// Empty.

	// #endregion
	// #region Bidding V2

	/// @notice Comment-202608317 applies.
	/// Comment-202606101 relates.
	/// Comment-202411064 applies.
	uint256 public cstDutchAuctionDurationChangeDivisor;

	// #endregion
}

// #endregion
