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
import { ICosmicSignatureGameStorageV3 } from "./interfaces/ICosmicSignatureGameStorageV3.sol";

// #endregion
// #region

/// @title The V3+ Game implementation contract storage.
/// @author The Cosmic Signature Development Team.
/// @notice
/// [Comment-202608243]
/// This contract declares, with `internal` visibility, the exact storage layout that the combination of
/// `CosmicSignatureGameStorageV2Base`, `CosmicSignatureGameStorageV3Base`, and `CosmicSignatureGameStorageV3` declares
/// with `public` visibility: the same variables, in the same order, with the same names and types,
/// and the same trailing storage gap. Variable visibility does not affect the storage layout,
/// so the two chassis are slot-for-slot identical, which `test/tests-src/CosmicSignatureGameV3-ModularEquality.js`
/// verifies on every test run.
///
/// The V3+ Game implementation contract (`CosmicSignatureGameV3`) inherits this contract, so the ~60 public variable
/// getters are not compiled into the implementation, which is one of the pillars of keeping its deployed bytecode
/// far below the EIP-170 limit. The delegatecall modules (Comment-202608245) inherit the original public chassis
/// instead, so the compiler regenerates the exact original getters there, and they remain externally callable
/// on the proxy, routed through the fallback chain (Comment-202608246).
///
/// The few variable documentation comments that the original chassis files carry are not duplicated here;
/// see `CosmicSignatureGameStorageV2Base` and `CosmicSignatureGameStorageV3Base` for them.
/// [/Comment-202608243]
abstract contract CosmicSignatureGameStorageV3Core is ICosmicSignatureGameStorageV3 {
	// #region ETH Donations

	EthDonationWithInfoRecord[] internal ethDonationWithInfoRecords;

	// #endregion
	// #region Bid Statistics

	address internal lastBidderAddress;
	address internal lastCstBidderAddress;
	mapping(uint256 roundNum => BidderAddresses) internal bidderAddresses;
	mapping(uint256 roundNum => mapping(address bidderAddress => BidderInfo)) internal biddersInfo;
	address internal enduranceChampionAddress;
	uint256 internal enduranceChampionStartTimeStamp;
	uint256 internal enduranceChampionDuration;
	uint256 internal prevEnduranceChampionDuration;
	address internal chronoWarriorAddress;
	uint256 internal chronoWarriorDuration;

	// #endregion
	// #region Bidding

	uint256 internal roundNum;
	uint256 internal delayDurationBeforeRoundActivation;
	uint256 internal roundActivationTime;
	uint256 internal ethDutchAuctionDurationDivisor;
	uint256 internal ethDutchAuctionBeginningBidPrice;
	uint256 internal ethDutchAuctionEndingBidPriceDivisor;
	uint256 internal nextEthBidPrice;
	uint256 internal ethBidPriceIncreaseDivisor;
	uint256 internal ethBidRefundAmountInGasToSwallowMaxLimit;
	uint256 internal cstDutchAuctionBeginningTimeStamp;

	/// @dev Comment-202606057 applies.
	/// Comment-202607169 applies.
	/// @custom:oz-renamed-from cstDutchAuctionDurationDivisor
	uint256 internal cstDutchAuctionDuration;

	uint256 internal cstDutchAuctionBeginningBidPrice;
	uint256 internal nextRoundFirstCstDutchAuctionBeginningBidPrice;
	uint256 internal cstDutchAuctionBeginningBidPriceMinLimit;
	mapping(uint256 nftId => uint256 nftWasUsed) internal usedRandomWalkNfts;
	uint256 internal bidMessageLengthMaxLimit;

	/// @dev Comment-202606053 applies.
	/// Comment-202607169 applies.
	/// @custom:oz-renamed-from bidCstRewardAmount
	uint256 internal bidCstRewardAmountMultiplier;

	// #endregion
	// #region Secondary Prizes

	uint256 internal cstPrizeAmount;
	uint256 internal chronoWarriorEthPrizeAmountPercentage;
	uint256 internal raffleTotalEthPrizeAmountForBiddersPercentage;
	uint256 internal numRaffleEthPrizesForBidders;
	uint256 internal numRaffleCosmicSignatureNftsForBidders;
	uint256 internal numRaffleCosmicSignatureNftsForRandomWalkNftStakers;
	uint256 internal cosmicSignatureNftStakingTotalEthRewardAmountPercentage;

	// #endregion
	// #region Main Prize

	uint256 internal initialDurationUntilMainPrizeDivisor;
	uint256 internal mainPrizeTime;
	uint256 internal mainPrizeTimeIncrementInMicroSeconds;
	uint256 internal mainPrizeTimeIncrementIncreaseDivisor;
	uint256 internal timeoutDurationToClaimMainPrize;
	uint256 internal mainEthPrizeAmountPercentage;

	// #endregion
	// #region External Contract And Wallet Addresses

	CosmicSignatureToken internal token;
	RandomWalkNFT internal randomWalkNft;
	CosmicSignatureNft internal nft;
	PrizesWallet internal prizesWallet;
	StakingWalletRandomWalkNft internal stakingWalletRandomWalkNft;
	StakingWalletCosmicSignatureNft internal stakingWalletCosmicSignatureNft;
	address internal marketingWallet;
	uint256 internal marketingWalletCstContributionAmount;
	address internal charityAddress;
	uint256 internal charityEthDonationAmountPercentage;

	// #endregion
	// #region Bidding V2

	uint256 internal cstDutchAuctionDurationChangeDivisor;

	// #endregion
	// #region Bid Statistics V3

	mapping(uint256 roundNum => ChampionDurations) internal championDurations;

	// #endregion
	// #region Bidding V3

	uint256 internal cstBidPriceDeclineMultiplier;
	uint256 internal cstBidPriceDeclineMultiplierChangeDivisor;
	uint256 internal roundLateBidDurationDivisor;
	uint256 internal roundLateBidPricePremiumAmountBaseMultiplier;
	uint256 internal roundLateBidPricePremiumAmountExponent;

	// #endregion
	// #region Main Prize V3

	uint256 internal mainPrizeNumCosmicSignatureNfts;

	// #endregion
	// #region Gap

	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	/// This is the same trailing gap that `CosmicSignatureGameStorageV3` declares. Comment-202608243 applies.
	// solhint-disable-next-line var-name-mixedcase
	uint256[(1 << 30) - 1 - 7] private __gap_persistent;

	/// @dev Comment-202412142 applies.
	/// Comment-202412148 applies.
	// solhint-disable-next-line var-name-mixedcase
	uint256 private transient __gap_transient;

	// #endregion
}

// #endregion
