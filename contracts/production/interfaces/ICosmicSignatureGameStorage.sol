// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

interface ICosmicSignatureGameStorage {
	/// @notice Details about an ETH donation with additional info made to the Game.
	struct EthDonationWithInfoRecord {
		uint256 roundNum;
		address donorAddress;

		/// @notice It's OK if this is zero.
		uint256 amount;

		/// @notice Additional info in JSON format.
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

	/// @notice Stores each bid's bidder address.
	struct BidderAddresses {
		uint256 numItems;
		mapping(uint256 bidNum => address bidderAddress) items;
	}

	/// @notice Details about a bidder.
	struct BidderInfo {
		/// @dev
		/// [Comment-202502045]
		/// Issue. It could make sense to eliminate this variable. It's not used in the logic, right?
		/// But the project founders consider using the info for other purposes.
		/// Comment-202411098 relates.
		/// [/Comment-202502045]
		uint256 totalSpentEthAmount;

		/// @dev Comment-202502045 applies.
		uint256 totalSpentCstAmount;

		uint256 lastBidTimeStamp;
	}
}
