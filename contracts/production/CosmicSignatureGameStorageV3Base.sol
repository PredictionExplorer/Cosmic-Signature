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

	/// @notice
	/// [Comment-202608317]
	/// In V2 only, `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor` are used.
	/// In V3+, `cstBidPriceDeclineMultiplier` and `cstBidPriceDeclineMultiplierChangeDivisor` are used instead.
	/// [/Comment-202608317]
	/// [Comment-202608181]
	/// By how much CST bid price declines per second.
	/// We increase this on each ETH bid and reduce on each CST bid, based on `cstBidPriceDeclineMultiplierChangeDivisor`.
	/// Comment-202608312 applies.
	/// [/Comment-202608181]
	/// Comment-202411064 applies.
	/// Comment-202411172 applies.
	/// @dev Comment-202608315 applies.
	uint256 public cstBidPriceDeclineMultiplier;

	/// @notice Comment-202608317 applies.
	/// Comment-202608181 relates.
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
}

// #endregion
