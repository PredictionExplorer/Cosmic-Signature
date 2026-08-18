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

	/// @notice In V3+, the CST bid price declines by this many CST Wei per second
	/// since the beginning of the CST Dutch auction.
	/// [Comment-202608181]
	/// We increase this on each ETH bid and reduce on each CST bid, based on `cstBidPriceDeclineMultiplierChangeDivisor`,
	/// using the Comment-202606059 formulas.
	/// Like the V2 `cstDutchAuctionDuration` drift described in Comment-202606101 (whose change directions are
	/// the opposite, since a faster price decline acts like a shorter auction duration), this encourages bidders
	/// to place the same number of ETH and CST bids, which, in turn, increases the value of CST.
	/// Unlike in V2, the CST bid price decline speed is independent from the bid CST reward.
	/// [/Comment-202608181]
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// @dev The dev comment near `cstDutchAuctionDuration` about possibly not making it configurable applies here too.
	uint256 public cstBidPriceDeclineMultiplier;

	/// @notice In V3+, we change `cstBidPriceDeclineMultiplier` based on this.
	/// Comment-202608181 applies.
	/// Comment-202411064 applies.
	/// @dev Comment-202607301 relates and/or applies.
	uint256 public cstBidPriceDeclineMultiplierChangeDivisor;

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
