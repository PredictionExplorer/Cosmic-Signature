// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

/// @notice This contract is responsible for bid price formation, processing arriving bids,
/// processing donated assets that accompany the bids.
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
	/// @param paidEthPrice Paid ETH price.
	/// Equals -1 if this is a CST bid.
	/// Comment-202503162 relates and/or applies.
	/// @param paidCstPrice Paid CST price.
	/// Equals -1 if this is an ETH bid.
	/// Comment-202503162 relates and/or applies.
	/// @param randomWalkNftId Provided Random Walk NFT ID.
	/// A negative value indicates that no Random Walk NFT was used.
	/// @param message Comment-202503155 applies.
	/// @param mainPrizeTime The time when the last bidder will be granted the premission to claim the main prize.
	event BidPlaced(
		uint256 indexed roundNum,
		address indexed lastBidderAddress,
		int256 paidEthPrice,
		int256 paidCstPrice,
		int256 indexed randomWalkNftId,
		string message,
		uint256 mainPrizeTime
	);

	/// @notice Handles an incoming ETH transfer.
	/// [Comment-202503147]
	/// Calling this method is equivalent to calling `bidWithEth` with default parameters.
	/// Comments there apply.
	/// [/Comment-202503147]
	/// See also: `ICosmicSignatureGame.fallback`, `IEthDonations.donateEth`.
	/// todo-1 +++ Do we have a test for this?
	receive() external payable;

	/// @notice This method gives the contract owner an option to encourage people to bid when the ETH Dutch auction has ended,
	/// but nobody is willing to bid -- by reducing ETH bid price.
	/// Only the contract owner is permitted to call this method.
	/// Comment-202508102 applies.
	/// See important details in comments in this method body.
	function halveEthDutchAuctionEndingBidPrice() external;

	/// @notice Places an ETH plus an optional Random Walk NFT bid and donates an ERC-20 token amount in a single transaction.
	/// [Comment-202503149]
	/// Comments near `bidWithEth` apply.
	/// [/Comment-202503149]
	/// [Comment-202503151]
	/// Comments near `IPrizesWallet.donateToken` apply.
	/// [/Comment-202503151]
	function bidWithEthAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable;

	/// @notice Places an ETH plus an optional Random Walk NFT bid and donates an NFT in a single transaction.
	/// Comment-202503149 applies.
	/// [Comment-202503153]
	/// Comments near `IPrizesWallet.donateNft` apply.
	/// [/Comment-202503153]
	function bidWithEthAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable;

	/// @notice Places an ETH plus an optional Random Walk NFT bid.
	/// This method would revert if the current bidding round is not active yet.
	/// Comment-202503147 relates.
	/// Comment-202503149 relates.
	/// @param randomWalkNftId_ The ID of the Random Walk NFT to be used for bidding.
	/// A Random Walk NFT may be used for bidding only once.
	/// Pass a negative value to not use a Random Walk NFT.
	/// Comment-202412036 applies.
	/// @param message_
	/// [Comment-202503155]
	/// The bidder's message.
	/// It may be empty.
	/// It lets the bidder to provide additional information or comments.
	/// [/Comment-202503155]
	function bidWithEth(int256 randomWalkNftId_, string memory message_) external payable;

	/// @notice Calls `getNextEthBidPriceAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getNextEthBidPriceAdvanced` apply.
	function getNextEthBidPrice() external view returns (uint256);

	/// @notice Calculates the current price that a bidder is required to pay to place an ETH bid.
	/// See also: `getNextEthBidPrice`.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return The next ETH bid price, in Wei.
	/// @dev
	/// [Comment-202503162]
	/// An ETH bid with or without a Random Walk NFT price is guaranteed to be a nonzero.
	/// `getEthPlusRandomWalkNftBidPrice` is guaranteed to return a nonzero, provided it's passed a nonzero.
	/// A CST bid price can potentially be zero.
	/// That said, given that we mint a nonzero CST reward for each bid, it's unlikely that the CST bid price will fall below that.
	/// todo-1 +++ Develop a test that makes ETH prices minimal.
	/// [/Comment-202503162]
	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @notice Calculates and returns an ETH + Random Walk NFT bid price, given an ETH only bid price.
	/// @dev Comment-202503162 applies.
	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) external pure returns (uint256);

	/// @return A tuple containing the total and elapsed durations of the current ETH Dutch auction.
	/// The elapsed duration counts since the current bidding round activation. It can be negative.
	/// It probably makes no sense to use it after the Dutch auction ends.
	function getEthDutchAuctionDurations() external view returns (uint256, int256);

	/// @notice Places a CST bid and donates an ERC-20 token amount in a single transaction.
	/// [Comment-202503168]
	/// Comments near `bidWithCst` apply.
	/// [/Comment-202503168]
	/// Comment-202503151 applies.
	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external;

	/// @notice Places a CST bid and donates an NFT in a single transaction.
	/// Comment-202503168 applies.
	/// Comment-202503153 applies.
	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external;

	/// @notice Places a bid using CST tokens.
	/// This method would revert if no ETH bids have been placed in the current bidding round yet.
	/// Comment-202503168 relates.
	/// @param priceMaxLimit_ The maximum price the bidder is willing to pay.
	/// It's OK if it's zero.
	/// Comment-202503162 relates and/or applies.
	/// @param message_ Comment-202503155 applies.
	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external;

	/// @notice Calls `getNextCstBidPriceAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getNextCstBidPriceAdvanced` apply.
	function getNextCstBidPrice() external view returns (uint256);

	/// @notice Calculates the current price that a bidder is required to pay to place a CST bid.
	/// The price decreases linearly over the Dutch auction duration.
	/// See also: `getNextCstBidPrice`.
	/// @param currentTimeOffset_
	/// [Comment-202501107]
	/// An offset to add to `block.timestamp`. It allows to find out what the price will be in the future or was in the past.
	/// The returned past price will not necessarily be correct for a timestamp before certain actions or time points.
	/// For the most up-to-date result, call this method in the context of the "pending" block.
	/// When deciding on this argument value, take into account that currently, on Arbitrum,
	/// consequitive blocks can have equal timestamps, which will not necessarily be the case
	/// after Arbitrum decentralizes their blockchain.
	/// Sensible values:
	///    0 when the result is to be used within the same transaction.
	///    0 when bidding programmatically from an external script,
	///      while calling this method in the context of the "pending" block.
	///      Although an external script can have a smarter time aware logic that conditionally passes 0 or 1.
	///    0 when bidding manually, like through our web site, 
	///      while calling this method in the context of the "pending" block.
	///      Alternatively, it could make sense to pass 1, assuming that human hands aren't that fast.
	///    1 for testing on Hardhat Network, provided this method is called in the context of the "latest" block
	///      and the next block timestamp in which the next transaction will be mined will increase by 1.
	///      Comment-202501193 relates.
	///    0 for testing on Hardhat Network, provided this method is called in the context of the "pending" block.
	/// [/Comment-202501107]
	/// @return The next CST bid price, in Wei.
	/// It can potentially be zero.
	/// Comment-202501022 applies.
	/// @dev Comment-202503162 applies.
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @return A tuple containing the total and elapsed durations of the current CST Dutch auction.
	/// Comment-202501022 applies to the returned elapsed duration.
	function getCstDutchAuctionDurations() external view returns (uint256, int256);
}
