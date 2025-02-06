// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

interface IBidding is ICosmicSignatureGameStorage, IBiddingBase, IMainPrizeBase, IBidStatistics {
	/// @notice Emitted when the first bid is placed in a bidding round.
	/// @param roundNum The current bidding round number.
	/// @param blockTimeStamp The current block timestamp.
	event FirstBidPlacedInRound(
		uint256 indexed roundNum,
		uint256 blockTimeStamp
	);

	/// @notice Emitted when a bid is placed.
	/// @param roundNum The current bidding round number.
	/// @param lastBidderAddress The address of the bidder who placed this bid.
	/// @param ethBidPrice Paid ETH price.
	/// Equals -1 if this is a CST bid.
	/// @param cstBidPrice Paid CST price.
	/// Equals -1 if this is an ETH bid.
	/// @param randomWalkNftId Provided RandomWalk NFT ID.
	/// A negative value indicates that no RandomWalk NFT was used.
	/// @param message A message from the bidder. May be empty.
	/// @param mainPrizeTime The time when the last bidder will be granted the premission to claim the main prize.
	event BidPlaced(
		uint256 indexed roundNum,
		address indexed lastBidderAddress,
		int256 ethBidPrice,
		int256 cstBidPrice,
		int256 indexed randomWalkNftId,
		string message,
		uint256 mainPrizeTime
	);
	
	/// @notice Handles an incoming ETH transfer.
	/// See also: `ICosmicSignatureGame.fallback`, `IEthDonations.donateEth`.
	/// todo-1 +++ Do we have a test for this?
	receive() external payable;

	/// @notice Places an ETH plus optional RandomWalk NFT bid and donates an ERC-20 token amount in a single transaction.
	function bidWithEthAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable;

	/// @notice Places an ETH plus optional RandomWalk NFT bid and donates an NFT in a single transaction.
	/// @param nftAddress_ NFT contract address.
	/// @param nftId_ NFT ID.
	function bidWithEthAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable;

	/// @notice Places an ETH plus optional RandomWalk NFT bid.
	/// @param randomWalkNftId_ The ID of the RandomWalk NFT to be used for bidding.
	/// Pass a negative value to not use a RandomWalk NFT.
	/// Comment-202412036 applies.
	/// @param message_ The bidder's message associated with the bid.
	/// May be empty.
	/// Can be used to store additional information or comments from the bidder.
	function bidWithEth(int256 randomWalkNftId_, string memory message_) external payable;

	/// @notice Calculates the current price that a bidder is required to pay to place an ETH bid.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return The next ETH bid price, in Wei.
	function getNextEthBidPrice(int256 currentTimeOffset_) external view returns(uint256);

	/// @notice Calculates and returns an ETH + RandomWalk NFT bid price, given an ETH only bid price.
	/// The result is guaranteed to be a nonzero, provided `ethBidPrice_` is a nonzero.
	/// This method doesn't check for overflow, which implies that `ethBidPrice_` must not be close to overflow.
	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) external pure returns(uint256);

	/// @return A tuple containing the total and elapsed durations of the current ETH Dutch auction.
	/// The elapsed duration counts since the current bidding round activation. It can be negative. It makes no sense to use it
	/// after the end of the Dutch auction.
	function getEthDutchAuctionDurations() external view returns(uint256, int256);

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
	/// The price decreases linearly over the Dutch auction duration, and can become zero.
	/// todo-1 +++ Confirmed: zero price is OK.
	/// @param currentTimeOffset_ .
	/// [Comment-202501107]
	/// An offset to add to `block.timestamp`.
	/// Currently, consequitive blocks can have equal timestamps, which will likely no longer be the case
	/// after Arbitrum decentralizes their blockchain.
	/// Sensible values:
	///    0 when the result is to be used within the same transaction.
	///    0 when bidding programmatically from an external script.
	///       But the script developer will probably need to change it to 1 after the decentalization.
	///       Although an external script can have a smarter time aware logic that conditionally passes different values.
	///    1 when bidding manually, like through our web site, assuming that human hands aren't too fast.
	///       todo-2 But in the front end change it to 1 after the decentalization.
	///    1 for testing on the Hardhat Network.
	/// [/Comment-202501107]
	/// @return The next CST bid price, in Wei.
	/// Comment-202501022 applies to the return value.
	/// @dev Comment-202409179 relates.
	function getNextCstBidPrice(int256 currentTimeOffset_) external view returns(uint256);

	/// @return A tuple containing the total and elapsed durations of the current CST Dutch auction.
	/// Comment-202501022 applies to the returned elapsed duration.
	function getCstDutchAuctionDurations() external view returns(uint256, int256);

	// /// @notice Checks if a RandomWalk NFT has ever been used for bidding.
	// /// @param nftId_ NFT ID.
	// /// @return `true` if the given NFT has been used; `false` otherwise.
	// /// @dev I have eliminated this method. All involved variables are `public`. So anybody can query them.
	// /// todo-9 It would be more efficient if this returns a number, like `IStakingWalletNftBase.wasNftUsed` does.
	// function wasRandomWalkNftUsed(uint256 nftId_) external view returns(bool);
}
