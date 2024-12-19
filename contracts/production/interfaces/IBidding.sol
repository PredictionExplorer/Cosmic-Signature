// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./ISystemManagement.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

interface IBidding is ICosmicSignatureGameStorage, ISystemManagement, IBidStatistics {
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
	/// todo-1 Reorder the above to the beginning.
	/// @param bidPrice The price of the bid
	/// todo-1 Rename the above param to `ethBidPrice`.
	/// @param randomWalkNftId The ID of the RandomWalk NFT used (if any)
	/// @param numCSTTokens The number of CST tokens used (if any)
	/// todo-1 Rename the above param to `cstBidPrice`.
	/// todo-1 Maybe reorder the above param to after `bidPrice`.
	/// @param mainPrizeTime The time when the last bidder will be granted the premission to claim the main prize.
	/// todo-1 Rename the above param to how I am going to name the respective state variable.
	/// @param message An optional message from the bidder
	/// todo-1 Rename to `BidPlaced`.
	event BidEvent(
		address indexed lastBidderAddress,
		uint256 indexed roundNum,
		int256 bidPrice,
		int256 randomWalkNftId, // todo-1 Should this be `indexed`?
		int256 numCSTTokens,
		uint256 mainPrizeTime,
		string message
	);
	
	/// @notice Places an ETH plus optional RandomWalk NFT bid and donates an ERC-20 token amount in a single transaction.
	function bidAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable;

	/// @notice Places an ETH plus optional RandomWalk NFT bid and donates an NFT in a single transaction.
	/// @param nftAddress_ NFT contract address.
	/// @param nftId_ NFT ID.
	function bidAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable;

	/// @notice Places an ETH plus optional RandomWalk NFT bid.
	/// ---param data_ Encoded `BidParams`.
	/// @param randomWalkNftId_ The ID of the RandomWalk NFT to be used for bidding.
	/// Set to -1 if no RandomWalk NFT is to be used.
	/// Comment-202412036 applies.
	/// @param message_ The bidder's message associated with the bid.
	/// May be empty.
	/// Can be used to store additional information or comments from the bidder.
	/// todo-1 Rename this method to `bidWithEth`.
	/// todo-1 Then also rename methods like `bidAndDonate...`.
	function bid(/*bytes memory data_*/ int256 randomWalkNftId_, string memory message_) external payable;

	/// @notice Obtains the current price that a bidder is required to pay to place an ETH bid
	/// @return The ETH price, in Wei
	/// todo-1 Rename this to `getEthBidPrice`.
	function getBidPrice() external view returns(uint256);

	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external;

	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external;

	/// @notice Places a bid using CST tokens.
	/// @dev This function allows bidding with CST tokens, adjusting the CST price dynamically.
	/// @param priceMaxLimit_ The maximum price the bidder is willing to pay.
	/// @param message_ The bidder's message associated with the bid.
	/// May be empty.
	/// Can be used to store additional information or comments from the bidder.
	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external;

	/// @notice Calculates the current price that a bidder is required to pay to place a CST bid.
	/// In our game, the price decreases linearly over the Dutch auction duration, and can become zero.
	/// todo-1 Maybe don't let it to become zero. Require at least 1 Wei.
	/// @return The CST price, in Wei.
	/// @dev Comment-202409179 relates.
	/// todo-1 Rename this to `getCstBidPrice`.
	function getCurrentBidPriceCST() external view returns(uint256);

	/// @return A tuple containing the elapsed and total durations of the current auction.
	/// @dev This function is used by `getCurrentBidPriceCST`
	/// todo-1 I dislike it that this returns 2 numbers. This should return only seconds elapsed.
	/// todo-1 Rename to `getDurationSinceCstDutchAuctionStart` or `getCstDutchAuctionElapsedDuration`.
	function getCstAuctionDuration() external view returns(uint256, uint256);

	/// @notice Get the total number of bids in the current round
	/// @return The total number of bids in the current round
	/// todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	/// todo-1 Rename this to `getTotalNumBids`.
	function getTotalBids() external view returns(uint256);

	/// @notice Get the address of a bidder at a specific position in the current round
	/// @param position The position of the bidder (0-indexed)
	/// @return The address of the bidder at the specified position
	/// @dev todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	/// todo-1 Otherwise name this better.
	function getBidderAddressAtPosition(uint256 position) external view returns(address);

	/// @notice Get the address of a bidder at a specific position from the end in a given round
	/// @param roundNum_ The bidding round number.
	/// @param _positionFromEnd The position from the end of the bidders list
	/// @return The address of the bidder
	/// @dev todo-1 Rename to reflect the fact that this is position from end.
	/// todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	/// todo-1 Otherwise name this better.
	function bidderAddress(uint256 roundNum_, uint256 _positionFromEnd) external view returns(address);

	/// @notice Get the total amount spent by a bidder in the current round
	/// @param bidderAddress_ The address of the bidder
	/// @return The total amount spent by the bidder in wei
	/// @dev todo-1 Rename to `getBidderTotalSpentInRound`.
	/// todo-1 This is ETH, right? Rename to make it clear. Actually it's both ETH and CST, right? Make it clear in this comment.
	/// todo-1 Can I eliminate this method? All involved variables are public, right? So anybody can query them.
	/// todo-1 Otherwise name this better.
	function getTotalSpentByBidder(address bidderAddress_) external view returns(uint256, uint256);

	// /// @notice Checks if a RandomWalk NFT has ever been used for bidding.
	// /// @param nftId_ NFT ID.
	// /// @return `true` if the given NFT has been used; `false` otherwise.
	// /// @dev I have eliminated this method. All involved variables are `public`. So anybody can query them.
	// /// todo-9 It would be more efficient if this returns a number, like `IStakingWalletNftBase.wasNftUsed` does.
	// function wasRandomWalkNftUsed(uint256 nftId_) external view returns(bool);
}
