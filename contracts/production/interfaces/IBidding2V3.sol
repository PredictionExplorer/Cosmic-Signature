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
	/// In V3+, this is minted to the previous bidder, not to the bidder who placed this bid.
	/// This is zero on the first bid in a bidding round, because there is no previous bidder to reward.
	/// Comment-202608022 relates.
	/// @param cstBidPriceDeclineMultiplier Comment-202608181 applies.
	/// This is the value after this bid's adjustment.
	/// In the V2 version of this event, this parameter slot was `cstDutchAuctionDuration`;
	/// the event signature and therefore its topic hash are unchanged, so off-chain code
	/// must reinterpret this field after the V3 upgrade.
	/// The `getCstDutchAuctionDurations` function still exists; in V3+ it derives the duration
	/// from the auction beginning bid price and this multiplier.
	/// @param mainPrizeTime Comment-202412152 applies.
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
