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

		/// @notice This is populated in V3+.
		/// It is the sum of the raffle weights of this bid and all preceding bids in the same bidding round.
		uint256 raffleCumulativeWeight;
	}

	/// @notice Details about all bids in one bidding round.
	struct BidsInfo {
		uint256 numItems;
		mapping(uint256 bidNum => BidInfo) items;

		/// @notice Round outcome flags, populated on main prize claim in V3+.
		/// @dev todo-0 Revisit this variable type.
		/// todo-0 Revisit the above comment. Some bits could be populated not on main prize claim. Maybe don't mention that.
		/// todo-0 Consider combining this variable with other variables in the same storage slot.
		uint8 flags;
	}

	/// @notice Details about a bidder.
	struct BidderInfo {
		/// @dev Comment-202503162 relates and/or applies.
		uint256 totalSpentEthAmount;

		/// @dev Comment-202503162 relates and/or applies.
		uint256 totalSpentCstAmount;

		uint256 lastBidTimeStamp;
	}
}
