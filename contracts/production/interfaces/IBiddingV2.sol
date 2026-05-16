// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { IBidStatistics } from "./IBidStatistics.sol";

/// @notice V2 bidding interface with time-based bid CST rewards and front-running slippage protection.
/// @dev V2 replaces the V1 bid function signatures (it does not extend `IBidding`); each bid function
/// gains a `bidCstRewardMinLimit_` parameter so the bidder can require a minimum CST reward.
/// Pass 0 to disable the slippage check.
interface IBiddingV2 is ICosmicSignatureGameStorage, IBiddingBase, IMainPrizeBase, IBidStatistics {
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
	/// @param bidCstRewardAmount The CST reward amount minted to the bidder, in wei.
	/// @param mainPrizeTime The time when the last bidder will be granted the premission to claim the main prize.
	event BidPlaced(
		uint256 indexed roundNum,
		address indexed lastBidderAddress,
		int256 paidEthPrice,
		int256 paidCstPrice,
		int256 indexed randomWalkNftId,
		string message,
		uint256 bidCstRewardAmount,
		uint256 mainPrizeTime
	);

	/// @notice Handles an incoming ETH transfer.
	/// [Comment-V2-RECEIVE]
	/// Equivalent to `bidWithEth(-1, "", 0)`. Bare-ETH transfers receive NO CST reward
	/// slippage protection because they have no parameter slot for `bidCstRewardMinLimit_`.
	/// Callers requiring protection must call `bidWithEth` directly.
	/// [/Comment-V2-RECEIVE]
	/// See also: `ICosmicSignatureGame.fallback`, `IEthDonations.donateEth`.
	receive() external payable;

	/// @notice This method gives the contract owner an option to encourage people to bid when the ETH Dutch auction has ended,
	/// but nobody is willing to bid -- by reducing ETH bid price.
	/// Only the contract owner is permitted to call this method.
	/// Comment-202508102 applies.
	/// See important details in comments in this method body.
	function halveEthDutchAuctionEndingBidPrice() external;

	/// @notice Places an ETH plus an optional Random Walk NFT bid and donates an ERC-20 token amount in a single transaction.
	/// Comment-202503149 applies.
	/// Comment-202503151 applies.
	/// @param bidCstRewardMinLimit_ Comment-V2-CST-MIN-LIMIT applies.
	function bidWithEthAndDonateToken(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardMinLimit_, IERC20 tokenAddress_, uint256 amount_) external payable;

	/// @notice Places an ETH plus an optional Random Walk NFT bid and donates an NFT in a single transaction.
	/// Comment-202503149 applies.
	/// Comment-202503153 applies.
	/// @param bidCstRewardMinLimit_ Comment-V2-CST-MIN-LIMIT applies.
	function bidWithEthAndDonateNft(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardMinLimit_, IERC721 nftAddress_, uint256 nftId_) external payable;

	/// @notice Places an ETH plus an optional Random Walk NFT bid.
	/// This method would revert if the current bidding round is not active yet.
	/// Comment-V2-RECEIVE relates.
	/// Comment-202503149 relates.
	/// @param randomWalkNftId_ The ID of the Random Walk NFT to be used for bidding.
	/// A Random Walk NFT may be used for bidding only once.
	/// Pass a negative value to not use a Random Walk NFT.
	/// Comment-202412036 applies.
	/// @param message_ .
	/// Comment-202503155 applies.
	/// @param bidCstRewardMinLimit_ .
	/// [Comment-V2-CST-MIN-LIMIT]
	/// Minimum CST reward in wei the bidder is willing to accept for placing this bid.
	/// If the actual reward (computed at execution time as `floor(sqrt(elapsed duration in seconds * configured multiplier))`)
	/// is less than this value, the call reverts with `BidCstRewardMinLimitNotReached`.
	/// Pass 0 to disable the slippage check (the bid succeeds regardless of the reward amount).
	/// This protects bidders against front-running that resets the elapsed-time window.
	/// [/Comment-V2-CST-MIN-LIMIT]
	function bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardMinLimit_) external payable;

	/// @notice Calls `getNextEthBidPriceAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getNextEthBidPriceAdvanced` apply.
	function getNextEthBidPrice() external view returns (uint256);

	/// @notice Calculates the current price that a bidder is required to pay to place an ETH bid.
	/// See also: `getNextEthBidPrice`.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return The next ETH bid price, in Wei.
	/// @dev Comment-202503162 applies.
	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @notice Calculates and returns an ETH + Random Walk NFT bid price, given an ETH only bid price.
	/// @dev Comment-202503162 applies.
	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) external pure returns (uint256);

	/// @return A tuple containing the total and elapsed durations of the current ETH Dutch auction.
	/// The elapsed duration counts since the current bidding round activation. It can be negative.
	/// It probably makes no sense to use it after the Dutch auction ends.
	function getEthDutchAuctionDurations() external view returns (uint256, int256);

	/// @notice Places a CST bid and donates an ERC-20 token amount in a single transaction.
	/// Comment-202503168 applies.
	/// Comment-202503151 applies.
	/// @param bidCstRewardMinLimit_ Comment-V2-CST-MIN-LIMIT applies.
	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardMinLimit_, IERC20 tokenAddress_, uint256 amount_) external;

	/// @notice Places a CST bid and donates an NFT in a single transaction.
	/// Comment-202503168 applies.
	/// Comment-202503153 applies.
	/// @param bidCstRewardMinLimit_ Comment-V2-CST-MIN-LIMIT applies.
	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardMinLimit_, IERC721 nftAddress_, uint256 nftId_) external;

	/// @notice Places a bid using CST tokens.
	/// This method would revert if no ETH bids have been placed in the current bidding round yet.
	/// Comment-202503168 relates.
	/// @param priceMaxLimit_ The maximum price the bidder is willing to pay.
	/// It's OK if it's zero.
	/// Comment-202503162 relates and/or applies.
	/// @param message_ Comment-202503155 applies.
	/// @param bidCstRewardMinLimit_ Comment-V2-CST-MIN-LIMIT applies.
	function bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardMinLimit_) external;

	/// @notice Calls `getNextCstBidPriceAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getNextCstBidPriceAdvanced` apply.
	function getNextCstBidPrice() external view returns (uint256);

	/// @notice Calculates the current price that a bidder is required to pay to place a CST bid.
	/// The price decreases linearly over the Dutch auction duration.
	/// See also: `getNextCstBidPrice`.
	/// @param currentTimeOffset_ .
	/// Comment-202501107 applies.
	/// @return The next CST bid price, in Wei.
	/// It can potentially be zero.
	/// Comment-202501022 applies.
	/// @dev Comment-202503162 applies.
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @return A tuple containing the total and elapsed durations of the current CST Dutch auction.
	/// Comment-202501022 applies to the returned elapsed duration.
	function getCstDutchAuctionDurations() external view returns (uint256, int256);

	/// @notice Returns the CST reward that would be minted for a bid at the current timestamp.
	function getBidCstRewardAmount() external view returns (uint256);

	/// @notice Calculates the CST reward that would be minted for a bid with a timestamp offset.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) external view returns (uint256);
}
