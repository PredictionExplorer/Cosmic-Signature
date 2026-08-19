// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureGameStorageV2Base } from "./CosmicSignatureGameStorageV2Base.sol";
import { ICosmicSignatureGameStorageV3 } from "./interfaces/ICosmicSignatureGameStorageV3.sol";

// #endregion
// #region

abstract contract CosmicSignatureGameStorageV3Base is
	CosmicSignatureGameStorageV2Base,
	ICosmicSignatureGameStorageV3 {
	// #region Bid Statistics V3

	/// @dev Comment-202411098 applies.
	mapping(uint256 roundNum => ChampionDurations) public championDurations;

	// #endregion
	// #region Bidding V3

	/// @notice This controls the duration before `mainPrizeTime` during which a bid price is to be increased.
	/// The increase/premium accelerates exponentially as the current time approaches `mainPrizeTime`.
	/// Comment-202501025 applies.
	/// Comment-202508288 relates.
	/// Comment-202411064 applies.
	/// @dev Comment-202607117 applies.
	uint256 public roundLateBidDurationDivisor;

	/// @notice Comment-202411064 applies.
	/// @dev Comment-202607117 applies.
	uint256 public roundLateBidPricePremiumAmountBaseMultiplier;

	/// @notice Comment-202411064 applies.
	/// @dev Comment-202607117 applies.
	uint256 public roundLateBidPricePremiumAmountExponent;

	// #endregion
	// #region Main Prize V3

	/// @notice The number of Cosmic Signature NFTs to be minted to the main prize beneficiary.
	/// Comment-202411064 applies.
	uint256 public mainPrizeNumCosmicSignatureNfts;

	// #endregion
	// #region Secondary Prizes V3

	/// @notice Per bidding round, per bid: the cumulative sum of bid raffle weights through that bid.
	/// So the raffle weight of bid `bidNum` is
	/// `bidRaffleCumulativeWeights[roundNum][bidNum] - bidRaffleCumulativeWeights[roundNum][bidNum - 1]`
	/// (with an implicit zero before the first bid), and the round's total raffle weight is the last item.
	/// Comment-202608261 applies.
	/// Comment-202608262 applies.
	/// @dev `RaffleWeightHelpers` maintains and searches this. The bid indexes match `bidderAddresses` items.
	mapping(uint256 roundNum => mapping(uint256 bidNum => uint256 cumulativeWeight)) public bidRaffleCumulativeWeights;

	// #endregion
}

// #endregion
