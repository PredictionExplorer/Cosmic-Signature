// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

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
	// 	/// @notice Bid using Ether + a RandomWalk NFT.
	// 	/// todo-9 Rename to `EthPlusRandomWalkNft`.
	// 	RandomWalk,
	//
	// 	/// @notice Bid using Cosmic Signature Tokens.
	// 	/// todo-9 Rename to `Cst`.
	// 	CST
	// }

	/// @notice Contains each bid's bidder address.
	struct BidderAddresses {
		uint256 numItems;
		mapping(uint256 bidNum => address bidderAddress) items;
	}

	/// @notice Details about a bidder.
	struct BidderInfo {
		/// @dev
		/// [Comment-202502045]
		/// Issue. One might want to eliminate this variable.
		/// But the project founders consider using this info for other purposes.
		/// Comment-202411098 relates.
		/// [/Comment-202502045]
		uint256 totalSpentEthAmount;

		/// @notice
		/// [Comment-202503139]
		/// Given Comment-202409179, this can potentially be zero, even if the given bidder did place CST bids.
		/// Given that `BidStatistics.getBidderTotalSpentAmounts` returns this, its return value can potentially be zero.
		/// [/Comment-202503139]
		/// @dev Comment-202502045 applies.
		uint256 totalSpentCstAmount;

		uint256 lastBidTimeStamp;
	}
}
