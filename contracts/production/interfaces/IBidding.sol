// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { ICosmicGameStorage } from "./ICosmicGameStorage.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

interface IBidding is ICosmicGameStorage, IBidStatistics {
	/// @notice Emitted when a bid is placed
	/// @param lastBidder The address of the bidder
	/// @param round The current round number
	/// @param bidPrice The price of the bid
	/// @param randomWalkNFTId The ID of the RandomWalk NFT used (if any)
	/// @param numCSTTokens The number of CST tokens used (if any)
	/// @param prizeTime The time when the prize can be claimed
	/// @param message An optional message from the bidder
	event BidEvent(
		address indexed lastBidder,
		uint256 indexed round,
		int256 bidPrice,
		int256 randomWalkNFTId, // todo-1 Should this be `indexed`?
		int256 numCSTTokens,
		uint256 prizeTime,
		string message
	);
	
   /// @notice Place a bid in the current round 
	/// @dev This function handles ETH bids and RandomWalk NFT bids
	/// @param _data Encoded bid parameters including message and RandomWalk NFT ID
	function bid(bytes calldata _data) external payable;

	/// @notice Obtains the current price that a bidder is required to pay to place an ETH bid
	/// @return The ETH price, in Wei
   function getBidPrice() external view returns (uint256);

	/// @notice Get the address of a bidder at a specific position from the end in a given round
	/// @param _round The round number
	/// @param _positionFromEnd The position from the end of the bidders list
	/// @return The address of the bidder
   function bidderAddress(uint256 _round, uint256 _positionFromEnd) external view returns (address);

	/// @notice Place a bid using CST tokens
	/// @dev This function allows bidding with CST tokens, adjusting the CST price dynamically
	/// @param message The bidder's message
   function bidWithCST(string memory message) external;

	/// @notice Obtains the current price that a bidder is required to pay to place a CST bid
	/// In our game, the price decreases linearly over the auction duration
	/// @return The CST price, in Wei
   function getCurrentBidPriceCST() external view returns (uint256);

	/// @notice Get the current auction duration and elapsed time
	/// @dev This function is used by `getCurrentBidPriceCST`
	/// @return A tuple containing the seconds elapsed and total duration of the current auction
   function auctionDuration() external view returns (uint256, uint256);

	/// @notice Get the total number of bids in the current round
	/// @return The total number of bids in the current round
   function getTotalBids() external view returns (uint256);

	/// @notice Get the address of a bidder at a specific position in the current round
	/// @param position The position of the bidder (0-indexed)
	/// @return The address of the bidder at the specified position
   function getBidderAtPosition(uint256 position) external view returns (address);

	/// @notice Get the total amount spent by a bidder in the current round
	/// @param bidder The address of the bidder
	/// @return The total amount spent by the bidder in wei
   function getTotalSpentByBidder(address bidder) external view returns (uint256);

	/// @notice Check if a RandomWalk NFT has been used for bidding
	/// @param tokenId The ID of the RandomWalk NFT
	/// @return True if the NFT has been used, false otherwise
   function isRandomWalkNFTUsed(uint256 tokenId) external view returns (bool);
}
