// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

interface IBidding is ICosmicSignatureGameStorage, IBidStatistics {
	/// @notice Emitted when the first bid is placed in a bidding round.
	/// @param roundNum The current bidding round number.
	/// @param blockTimeStamp The current block timestamp.
	event FirstBidPlacedInRound(
		uint256 indexed roundNum,
		uint256 blockTimeStamp
	);

	/// @notice Emitted when a bid is placed
	/// @param lastBidderAddress The address of the bidder who placed this bid.
	/// @param roundNum The current bidding round number.
	/// @param bidPrice The price of the bid
	/// @param randomWalkNftId The ID of the RandomWalk NFT used (if any)
	/// @param numCSTTokens The number of CST tokens used (if any)
	/// @param prizeTime The time when the prize can be claimed
	/// @param message An optional message from the bidder
	/// todo-1 Rename to `BidPlaced`.
	event BidEvent(
		address indexed lastBidderAddress,
		uint256 indexed roundNum,
		int256 bidPrice,
		int256 randomWalkNftId, // todo-1 Should this be `indexed`?
		int256 numCSTTokens,
		uint256 prizeTime,
		string message
	);
	
	/// @notice Place a bid in the current round 
	/// @dev This function handles ETH bids and RandomWalk NFT bids
	/// todo-1 Rename to `bidWithEth`?
	/// todo-1 Then also rename methods like `bidAndDonate...`.
	/// @param _data Encoded bid parameters including message and RandomWalk NFT ID
	function bid(bytes calldata _data) external payable;

	/// @notice Obtains the current price that a bidder is required to pay to place an ETH bid
	/// @return The ETH price, in Wei
	function getBidPrice() external view returns (uint256);

	/// @notice Places a bid using CST tokens.
	/// @dev This function allows bidding with CST tokens, adjusting the CST price dynamically.
	/// @param priceMaxLimit_ The maximum price the bidder is willing to pay.
	/// @param message_ The bidder's message, if any.
	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external;

	/// @notice Calculates the current price that a bidder is required to pay to place a CST bid.
	/// In our game, the price decreases linearly over the Dutch auction duration, and can become zero.
	/// todo-1 Maybe don't let it to become zero. Require at least 1 Wei.
	/// @return The CST price, in Wei.
	/// @dev Comment-202409179 relates.
	function getCurrentBidPriceCST() external view returns (uint256);

	/// @return A tuple containing the elapsed and total durations of the current auction.
	/// @dev This function is used by `getCurrentBidPriceCST`
	/// todo-1 I dislike it that this returns 2 numbers. This should return only seconds elapsed.
	/// todo-1 Rename to `getDurationSinceCstDutchAuctionStart` or `getCstDutchAuctionElapsedDuration`.
	function getCstAuctionDuration() external view returns (uint256, uint256);

	/// @notice Get the total number of bids in the current round
	/// @return The total number of bids in the current round
	/// todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	function getTotalBids() external view returns (uint256);

	/// @notice Get the address of a bidder at a specific position from the end in a given round
	/// @param roundNum_ The bidding round number.
	/// @param _positionFromEnd The position from the end of the bidders list
	/// @return The address of the bidder
	/// @dev todo-1 Reorder this function to after `getBidderAtPosition`?
	/// todo-1 Rename to reflect the fact that this is position from end.
	/// todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	function bidderAddress(uint256 roundNum_, uint256 _positionFromEnd) external view returns (address);

	/// @notice Get the address of a bidder at a specific position in the current round
	/// @param position The position of the bidder (0-indexed)
	/// @return The address of the bidder at the specified position
	/// @dev todo-1 Rename to `getBidderAddressAtPosition`.
	/// todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	function getBidderAtPosition(uint256 position) external view returns (address);

	/// @notice Get the total amount spent by a bidder in the current round
	/// @param bidderAddress_ The address of the bidder
	/// @return The total amount spent by the bidder in wei
	/// @dev todo-1 Rename to `getBidderTotalSpentInRound`.
	/// todo-1 This is ETH, right? Rename to make it clear. Actually it's both ETH and CST, right? Make it clear in this comment.
	/// todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	function getTotalSpentByBidder(address bidderAddress_) external view returns (uint256, uint256);

	// /// @notice Checks if a RandomWalk NFT has ever been used for bidding.
	// /// @param nftId_ NFT ID.
	// /// @return `true` if the given NFT has been used; `false` otherwise.
	// /// @dev I have eliminated this method. All involved variables are `public`. So anybody can query them.
	// /// todo-9 It would be more efficient if this returns a number, like `IStakingWalletNftBase.wasNftUsed` does.
	// function wasRandomWalkNftUsed(uint256 nftId_) external view returns (bool);
}
