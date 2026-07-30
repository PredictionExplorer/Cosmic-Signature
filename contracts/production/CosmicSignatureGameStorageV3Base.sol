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

	/// In V3+.
	/// todo-0 Comments are similar to those near `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor`.
	/// todo-0 Review all occurrences of those, including their events, setters, etc.
	uint256 public cstBidPriceDeclineMultiplier;

	/// In V3+.
	/// todo-0 Comments are similar to those near `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor`.
	/// todo-0 Review all occurrences of those, including their events, setters, etc.
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

	// todo-ai-0 I have eliminated `bidCstRewardAmountPerMinute`. Using `bidCstRewardAmountMultiplier` instead.
	// todo-ai-0 Delete this garbage now.
	// todo-ai-0 Maybe delete Comment-202607161 as well. I have deleted references to it in Solidity code.
	// todo-ai-0 Rememeber that when a numbered comment gets deleted, all mentionings of it in all files, including tests and docs,
	// todo-ai-0 must be deleted as well.
	// todo-ai-0 If necessary, move the comment or some still valid parts of it elsewhere.
	// todo-ai-0 Generally, avoid writing verbose comments because they are hard to read and maintain.
	// todo-ai-0 Commnets themselves result a lot of complexity,
	// todo-ai-0 and no comment can eliminate the need for a human to read the code.
	// todo-ai-0 Write comments to explain unobvious intricacies, like what you did in Comment-202607163.
	// /// @notice In V3+, the bid CST reward accrues at this rate, expressed in CST Wei per minute,
	// /// since the last bid or, if no bids have been placed in the current bidding round yet, since the round activation.
	// /// Comment-202411064 applies.
	// /// @dev
	// /// [Comment-202607161]
	// /// In V3+, the bid CST reward is linearly proportional to the elapsed duration:
	// /// `bidCstRewardAmount = elapsedDuration * bidCstRewardAmountPerMinute / 1 minutes`.
	// /// When someone places a bid, `DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE` percent of the reward is minted to
	// /// the current last bidder (whose bid is being outbid), and the rest is minted to the new bidder.
	// /// If there is no last bidder (the new bid is the first one in the bidding round), only the new bidder share is minted.
	// /// todo-ai-0 The new bidder gets nothing now.
	// /// This replaces the V2 square root formula. `bidCstRewardAmountMultiplier` remains in storage, but V3+ ignores it.
	// /// [/Comment-202607161]
	// uint256 public bidCstRewardAmountPerMinute;

	// #endregion
	// #region Main Prize V3

	/// @notice The number of Cosmic Signature NFTs to be minted to the main prize beneficiary.
	/// Comment-202411064 applies.
	uint256 public mainPrizeNumCosmicSignatureNfts;

	// #endregion
}

// #endregion
