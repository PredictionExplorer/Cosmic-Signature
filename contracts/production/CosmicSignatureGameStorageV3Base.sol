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

	/// @notice In V3+, this percentage of the bid CST reward is minted to the current last bidder
	/// (if there were bids in the current bidding round); the rest is minted to the new bidder.
	/// Comment-202411064 applies.
	/// @dev
	/// [Comment-202607161]
	/// In V3+, the bid CST reward is linearly proportional to the duration elapsed since the last bid
	/// or, if no bids have been placed in the current bidding round yet, since the round activation:
	/// `bidCstRewardAmount = elapsedDuration * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds`.
	/// This replaces the V2 square root formula.
	/// When someone places a bid, this percentage of the reward is minted to the current last bidder
	/// (whose bid is being outbid), and the rest is minted to the new bidder.
	/// If there is no last bidder (the new bid is the first one in the bidding round), only the new bidder share is minted.
	/// Comment-202607165 relates.
	/// [/Comment-202607161]
	uint256 public lastBidderBidCstRewardAmountPercentage;

	// #endregion
	// #region Main Prize V3

	/// @notice The number of Cosmic Signature NFTs to be minted to the main prize beneficiary.
	/// Comment-202411064 applies.
	uint256 public mainPrizeNumCosmicSignatureNfts;

	// #endregion
}

// #endregion
