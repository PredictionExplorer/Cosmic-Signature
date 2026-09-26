// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @notice This contract contains all state variables that `CosmicSignatureGame` and the contracts that it inherits access.
interface ICosmicSignatureGameStorage {
	/// @notice Details about an ETH donation with additional info made to the Game.
	/// @dev Comment-202503111 relates and/or applies.
	struct EthDonationWithInfoRecord {
		uint256 roundNum;
		address donorAddress;

		/// @notice This can be zero.
		/// Comment-202503113 applies.
		uint256 amount;

		/// @notice Additional info in JSON format.
		/// This can be empty.
		string data;
	}

	// /// @notice Types of bids that can be made in the Game.
	// /// todo-9 Rename to `BidTypeCode`.
	// enum BidType {
	// 	/// @notice Bid using Ether.
	// 	/// todo-9 Rename to `Eth`.
	// 	ETH,
	//
	// 	/// @notice Bid using Ether + a Random Walk NFT.
	// 	/// todo-9 Rename to `EthPlusRandomWalkNft`.
	// 	RandomWalk,
	//
	// 	/// @notice Bid using Cosmic Signature Tokens.
	// 	/// todo-9 Rename to `Cst`.
	// 	CST
	// }

	/// @notice Details about a bid.
	struct BidInfo {
		/// @notice Who placed the bid.
		address bidderAddress;

		/// @notice In V3+, the sum of the raffle weights of this bid and all preceding bids in the same bidding round.
		uint256 raffleCumulativeWeight;
	}

	/// @notice Bidding round stats.
	/// @dev Comment-202610054 relates.
	struct RoundStats {
		uint256 numBids;
		mapping(uint256 bidNum => BidInfo) bidsInfo;

		/// @notice In V3+, the number of CST bids placed during the bidding round.
		/// It can potentially be zero.
		/// The number of ETH bids can be calculated as `numBids - numCstBids`.
		uint256 numCstBids;

		/// @notice In V3+, the sum of all ETH bid prices paid.
		/// [Comment-202610059]
		/// Paid amounts include late bid premiums and swallowed ETH overpayments, but exclude ETH refunds and donations.
		/// [/Comment-202610059]
		/// Given Comment-202501045, the number of ETH bids in a bidding round is guaranteed to be nonzero.
		/// In addition, given Comment-202503162, if this is nonzero and the given bidding round has already ended,
		/// all variables after `bidsInfo` are guaranteed to be populated.
		uint256 totalSpentEthAmount;

		/// @notice In V3+, the sum of all CST bid prices paid (burned).
		/// Comment-202610059 applies.
		/// There is at least one reason why this cannot be reliably calculated based on CST total supply change,
		/// which is because CST holders can burn own CST.
		/// Comment-202503162 relates and/or applies.
		uint256 totalSpentCstAmount;

		/// @notice In V3+, the maximum ETH bid price paid.
		/// Comment-202610059 applies.
		/// Note that this can be greater than the last ETH bid price, because the late bid premium logic can result in
		/// an earlier bid price being higher.
		/// Comment-202503162 relates and/or applies.
		uint256 maxEthBidPrice;

		/// @notice In V3+, the maximum CST bid price paid (burned).
		/// Comment-202610059 applies.
		/// Comment-202503162 relates and/or applies.
		uint256 maxCstBidPrice;

		/// @notice In V3+, the final Endurance Champion duration, saved on main prize claim.
		uint256 enduranceChampionDuration;

		/// @notice In V3+, the final Chrono-Warrior duration, saved on main prize claim.
		uint256 chronoWarriorDuration;

		/// @notice In V3+, bidding round outcome flags.
		/// Comment-202610069 relates.
		uint256 flags;
	}

	/// @notice Details about a bidder.
	/// @dev Comment-202610054 relates.
	struct BidderInfo {
		/// @notice Comment-202503162 relates and/or applies.
		uint256 totalSpentEthAmount;

		/// @notice Comment-202503162 relates and/or applies.
		uint256 totalSpentCstAmount;

		uint256 lastBidTimeStamp;
	}
}
