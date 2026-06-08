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

abstract contract CosmicSignatureGameStorageV2 is ICosmicSignatureGameStorage {
	// #region System Management

	// Empty.

	// #endregion
	// #region ETH Donations

	/// @notice Comment-202605181 applies.
	/// @dev Comment-202503111 relates and/or applies.
	EthDonationWithInfoRecord[] public ethDonationWithInfoRecords;

	// #endregion
	// #region Bid Statistics

	// /// todo-9 Rename to `lastBidTypeCode`.
	// BidType public lastBidType;

	/// @notice Comment-202605182 applies.
	/// @dev Comment-202502044 applies.
	address public lastBidderAddress;

	/// @notice Comment-202605183 applies.
	address public lastCstBidderAddress;

	/// @dev Comment-202411098 applies.
	/// Comment-202502044 relates.
	mapping(uint256 roundNum => BidderAddresses) public bidderAddresses;

	/// @dev Comment-202411098 applies.
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
	/// [Comment-202606101]
	/// How long CST Dutch auction lasts.
	/// We reduce this on each ETH bid and increase on each CST bid,
	/// which encourages bidders to place the same number of ETH and CST bids, which, in turn, increases the value of CST.
	/// A consequence of the logic is that an ETH bid results in a small instant reduction of CST bid price, which is OK.
	/// We change this based on `cstDutchAuctionDurationChangeDivisor`.
	/// The change formulas are described in Comment-202606059.
	/// [/Comment-202606101]
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// @dev One might want to make this non-configurable. But when we increase `div` in the Comment-202606059 formula,
	/// we also must increase `var` if `var < div`.
	/// [Comment-202606057]
	/// This occupies the same storage slot as `CosmicSignatureGameStorage.cstDutchAuctionDurationDivisor`.
	/// [/Comment-202606057]
	/// @custom:oz-renamed-from cstDutchAuctionDurationDivisor
	uint256 public cstDutchAuctionDuration;

	/// @notice Comment-202411066 applies.
	/// Comment-202605197 applies.
	/// @dev Comment-202605199 applies.
	uint256 public cstDutchAuctionBeginningBidPrice;

	/// @notice Comment-202605201 applies.
	/// Comment-202504212 applies.
	uint256 public nextRoundFirstCstDutchAuctionBeginningBidPrice;

	/// @notice Comment-202411066 relates.
	/// Comment-202411064 applies.
	/// Comment-202504212 relates.
	uint256 public cstDutchAuctionBeginningBidPriceMinLimit;

	/// @notice Comment-202605202 applies.
	/// See also: `StakingWalletNftBase.usedNfts`.
	mapping(uint256 nftId => uint256 nftWasUsed) public usedRandomWalkNfts;

	/// @notice Comment-202605203 applies.
	/// Comment-202409143 applies.
	/// Comment-202411064 applies.
	/// @dev Comment-202605204 applies.
	uint256 public bidMessageLengthMaxLimit;

	/// @notice We use this to calculate the CST amount to mint as a bidder reward for placing a bid.
	/// Comment-202411064 applies.
	/// @dev
	/// [Comment-202606053]
	/// This occupies the same storage slot as `CosmicSignatureGameStorage.bidCstRewardAmount`.
	/// [/Comment-202606053]
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

	/// @notice Comment-202606101 relates.
	/// Comment-202411064 applies.
	uint256 public cstDutchAuctionDurationChangeDivisor;

	// #endregion
	// #region Gap

	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	// solhint-disable-next-line var-name-mixedcase
	uint256[(1 << 30) - 1] private __gap_persistent;

	// todo-1 Transient storage is not yet supported for reference types.
	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	// uint256[1 << 30] private transient __gap_transient;
	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;

	// #endregion
}

// #endregion
