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

	/// @notice Information about a bidder.
	struct BidderInfo {
		// todo-1 Eliminate these total spens? It appears that they are not used in the logic.
		uint256 totalSpentEth;
		uint256 totalSpentCst;
		uint256 lastBidTimeStamp;
	}
}
