// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @notice Comment-202605251 applies.
interface IBidding2V3 {
	/// @notice Comment-202605276 applies.
	/// @param roundNum The current bidding round number.
	/// @param lastBidderAddress The address of the bidder who placed this bid.
	/// @param paidEthPrice Paid ETH price.
	/// Equals -1 if this is a CST bid.
	/// Comment-202503162 relates and/or applies.
	/// @param paidCstPrice Paid CST price.
	/// Equals -1 if this is an ETH bid.
	/// Comment-202503162 relates and/or applies.
	/// @param randomWalkNftId Provided Random Walk NFT ID.
	/// A negative value indicates that no Random Walk NFT was used.
	/// @param message Comment-202503155 applies.
	/// @param bidCstRewardAmount Comment-202607273 applies.
	/// It's guaranteed to be a nonzero.
	/// @param cstBidPriceDeclineMultiplier todo-0 Reference the comment from this storage variable.
	/// todo-0 What comments are referenced in V2?
	/// todo-0 Tell Nick that this replaced `cstDutchAuctionDuration` param.
	/// todo-0 The `getCstDutchAuctionDurations` function still exists. It now calculates the duration.
	/// @param mainPrizeTime Comment-202412152 applies.
	/// @dev
	/// todo-0 WRONG>>> There is no `cstBidPriceDeclineMultiplier` parameter here because we don't have a setter for it,
	/// todo-0 WRONG>>> and therefore no other event that to be emitted when it changes.
	/// todo-0 WRONG>>> The reasoning why `cstDutchAuctionDuration` needs to be settable does not apply -- find that comment and cross-ref
	/// todo-0 WRONG>>> here and near `cstBidPriceDeclineMultiplier`.
	event BidPlaced(
		uint256 indexed roundNum,
		address indexed lastBidderAddress,
		int256 paidEthPrice,
		int256 paidCstPrice,
		int256 indexed randomWalkNftId,
		string message,
		uint256 bidCstRewardAmount,
		uint256 cstBidPriceDeclineMultiplier,
		uint256 mainPrizeTime
	);
}
