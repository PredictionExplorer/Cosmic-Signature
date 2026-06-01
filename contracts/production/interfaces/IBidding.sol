// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

/// @notice
/// [Comment-202605251]
/// This contract supports bid price formation, processing arriving bids,
/// as well as donated third party ERC-20 token amounts and ERC-721 NFTs that accompany the bids.
/// [/Comment-202605251]
interface IBidding is ICosmicSignatureGameStorage, IBiddingBase, IMainPrizeBase, IBidStatistics {
	/// @notice
	/// [Comment-202605275]
	/// Emitted when the first bid is placed in a bidding round.
	/// [/Comment-202605275]
	/// @param roundNum The current bidding round number.
	/// @param blockTimeStamp The current block timestamp.
	event FirstBidPlacedInRound(
		uint256 indexed roundNum,
		uint256 blockTimeStamp
	);

	/// @notice
	/// [Comment-202605276]
	/// Emitted when a bid is placed.
	/// [/Comment-202605276]
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
	/// @param mainPrizeTime Comment-202412152 applies.
	event BidPlaced(
		uint256 indexed roundNum,
		address indexed lastBidderAddress,
		int256 paidEthPrice,
		int256 paidCstPrice,
		int256 indexed randomWalkNftId,
		string message,
		uint256 mainPrizeTime
	);

	/// @notice
	/// [Comment-202605253]
	/// Handles an incoming ETH transfer.
	/// [/Comment-202605253]
	/// [Comment-202503147]
	/// Calling this method is equivalent to calling `bidWithEth` with default parameters.
	/// Comments there apply.
	/// [/Comment-202503147]
	/// See also: `ICosmicSignatureGame.fallback`, `IEthDonations.donateEth`.
	receive() external payable;

	/// @notice
	/// [Comment-202605252]
	/// This method gives the contract owner an option to encourage people to bid when the ETH Dutch auction has ended,
	/// but nobody is willing to bid -- by reducing ETH bid price.
	/// See important details in comments in this method body.
	/// Only the contract owner is permitted to call this method.
	/// [/Comment-202605252]
	/// Comment-202508102 applies.
	function halveEthDutchAuctionEndingBidPrice() external;

	/// @notice
	/// [Comment-202605254]
	/// Places an ETH plus an optional Random Walk NFT bid and donates an ERC-20 token amount in a single transaction.
	/// [/Comment-202605254]
	/// [Comment-202503149]
	/// Comments near `bidWithEth` apply.
	/// [/Comment-202503149]
	/// [Comment-202503151]
	/// Comments near `IPrizesWallet.donateToken` apply.
	/// [/Comment-202503151]
	function bidWithEthAndDonateToken(
		int256 randomWalkNftId_,
		string memory message_,
		IERC20 tokenAddress_,
		uint256 amount_
	) external payable;

	/// @notice
	/// [Comment-202605255]
	/// Places an ETH plus an optional Random Walk NFT bid and donates an NFT in a single transaction.
	/// [/Comment-202605255]
	/// Comment-202503149 applies.
	/// [Comment-202503153]
	/// Comments near `IPrizesWallet.donateNft` apply.
	/// [/Comment-202503153]
	function bidWithEthAndDonateNft(
		int256 randomWalkNftId_,
		string memory message_,
		IERC721 nftAddress_,
		uint256 nftId_
	) external payable;

	/// @notice
	/// [Comment-202605256]
	/// Places an ETH plus an optional Random Walk NFT bid.
	/// This method would revert if the current bidding round is not active yet.
	/// [/Comment-202605256]
	/// Comment-202503147 relates.
	/// Comment-202503149 relates.
	/// @param randomWalkNftId_ .
	/// [Comment-202605257]
	/// The ID of the Random Walk NFT to be used for bidding.
	/// A Random Walk NFT may be used for bidding only once.
	/// Pass a negative value to not use a Random Walk NFT.
	/// [/Comment-202605257]
	/// Comment-202412036 applies.
	/// @param message_ .
	/// [Comment-202503155]
	/// The bidder's message.
	/// It may be empty.
	/// It lets the bidder to provide additional information or comments.
	/// [/Comment-202503155]
	function bidWithEth(int256 randomWalkNftId_, string memory message_) external payable;

	/// @notice
	/// [Comment-202605258]
	/// Calls `getNextEthBidPriceAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getNextEthBidPriceAdvanced` apply.
	/// [/Comment-202605258]
	function getNextEthBidPrice() external view returns (uint256);

	/// @notice
	/// [Comment-202605259]
	/// Calculates the current price that a bidder is required to pay to place an ETH bid.
	/// [/Comment-202605259]
	/// See also: `getNextEthBidPrice`.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return
	/// [Comment-202605261]
	/// The next ETH bid price.
	/// [/Comment-202605261]
	/// @dev
	/// [Comment-202503162]
	/// An ETH bid with or without a Random Walk NFT price is guaranteed to be a nonzero.
	/// `getEthPlusRandomWalkNftBidPrice` is guaranteed to return a nonzero, provided it's passed a nonzero.
	/// A CST bid price can potentially be zero.
	/// [/Comment-202503162]
	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @notice
	/// [Comment-202605262]
	/// Calculates and returns an ETH + Random Walk NFT bid price, given an ETH only bid price.
	/// [/Comment-202605262]
	/// @dev Comment-202503162 applies.
	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) external pure returns (uint256);

	/// @return
	/// [Comment-202605263]
	/// A tuple containing the total and elapsed durations of the current ETH Dutch auction.
	/// The elapsed duration counts since the current bidding round activation. It can be negative.
	/// It probably makes no sense to use it after ETH Dutch auction ends.
	/// [/Comment-202605263]
	function getEthDutchAuctionDurations() external view returns (uint256, int256);

	/// @notice
	/// [Comment-202605264]
	/// Places a CST bid and donates an ERC-20 token amount in a single transaction.
	/// [/Comment-202605264]
	/// [Comment-202503168]
	/// Comments near `bidWithCst` apply.
	/// [/Comment-202503168]
	/// Comment-202503151 applies.
	function bidWithCstAndDonateToken(
		uint256 priceMaxLimit_,
		string memory message_,
		IERC20 tokenAddress_,
		uint256 amount_
	) external;

	/// @notice
	/// [Comment-202605265]
	/// Places a CST bid and donates an NFT in a single transaction.
	/// [/Comment-202605265]
	/// Comment-202503168 applies.
	/// Comment-202503153 applies.
	function bidWithCstAndDonateNft(
		uint256 priceMaxLimit_,
		string memory message_,
		IERC721 nftAddress_,
		uint256 nftId_
	) external;

	/// @notice
	/// [Comment-202605266]
	/// Places a bid using a CST token amount.
	/// This method would revert if no bids have been placed in the current bidding round yet.
	/// [/Comment-202605266]
	/// Comment-202503168 relates.
	/// @param priceMaxLimit_ .
	/// [Comment-202605268]
	/// The maximum price the bidder is willing to pay.
	/// It's OK if it's zero.
	/// [/Comment-202605268]
	/// Comment-202503162 relates and/or applies.
	/// @param message_ Comment-202503155 applies.
	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external;

	/// @notice
	/// [Comment-202605269]
	/// Calls `getNextCstBidPriceAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getNextCstBidPriceAdvanced` apply.
	/// [/Comment-202605269]
	function getNextCstBidPrice() external view returns (uint256);

	/// @notice
	/// [Comment-202605271]
	/// Calculates the current price that a bidder is required to pay to place a CST bid.
	/// The price declines linearly over CST Dutch auction duration.
	/// In V2+, it also slightly declines on each ETH bid, as mentioned in Comment-202606101.
	/// [/Comment-202605271]
	/// See also: `getNextCstBidPrice`.
	/// @param currentTimeOffset_ .
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
	/// @return
	/// [Comment-202605272]
	/// The next CST bid price.
	/// It can potentially be zero.
	/// [/Comment-202605272]
	/// Comment-202501022 applies.
	/// @dev Comment-202503162 applies.
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @return
	/// [Comment-202605273]
	/// A tuple containing the total and elapsed durations of the current CST Dutch auction.
	/// [/Comment-202605273]
	/// Comment-202501022 applies to the returned elapsed duration.
	function getCstDutchAuctionDurations() external view returns (uint256, int256);
}
