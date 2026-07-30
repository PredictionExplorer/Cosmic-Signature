// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Comment-202605251 applies.
interface IBidding1V2 {
	/// @notice Comment-202605275 applies.
	/// @param roundNum The current bidding round number.
	/// @param blockTimeStamp The current block timestamp.
	event FirstBidPlacedInRound(
		uint256 indexed roundNum,
		uint256 blockTimeStamp
	);

	/// @notice Comment-202605253 applies.
	/// Comment-202503147 applies.
	/// See also: `ICosmicSignatureGameV2.fallback`, `IEthDonations.donateEth`.
	receive() external payable;

	/// @notice Comment-202605252 applies.
	/// Comment-202508102 applies.
	function halveEthDutchAuctionEndingBidPrice() external;

	/// @notice Comment-202605254 applies.
	/// Comment-202503149 applies.
	/// Comment-202503151 applies.
	function bidWithEthAndDonateToken(
		int256 randomWalkNftId_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC20 tokenAddress_,
		uint256 amount_
	) external payable;

	/// @notice Comment-202605255 applies.
	/// Comment-202503149 applies.
	/// Comment-202503153 applies.
	function bidWithEthAndDonateNft(
		int256 randomWalkNftId_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC721 nftAddress_,
		uint256 nftId_
	) external payable;

	/// @notice Comment-202605256 applies.
	/// Comment-202503147 relates.
	/// Comment-202503149 relates.
	/// @param randomWalkNftId_ Comment-202605257 applies.
	/// Comment-202412036 applies.
	/// @param message_ Comment-202503155 applies.
	/// @param bidCstRewardAmountMinLimit_ .
	/// [Comment-202605279]
	/// The minimum bid CST reward amount the bidder is willing to accept.
	/// It may be zero.
	/// In V3+, the previous bidder gets bid CST reward, so the new bidder might want to pass zero
	/// unless they placed the previous bid through the same or different account.
	/// todo-0 The above requires web site refactoring and updating user facing docs.
	/// [/Comment-202605279]
	function bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) external payable;

	/// @notice Comment-202605258 applies.
	function getNextEthBidPrice() external view returns (uint256);

	/// @notice Comment-202605259 applies.
	/// See also: `getNextEthBidPrice`.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return Comment-202605261 applies.
	/// @dev Comment-202503162 applies.
	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @notice Comment-202605262 applies.
	/// @dev Comment-202503162 applies.
	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) external pure returns (uint256);

	/// @return Comment-202605263 applies.
	function getEthDutchAuctionDurations() external view returns (uint256, int256);

	/// @notice Comment-202605264 applies.
	/// Comment-202503168 applies.
	/// Comment-202503151 applies.
	function bidWithCstAndDonateToken(
		uint256 priceMaxLimit_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC20 tokenAddress_,
		uint256 amount_
	) external;

	/// @notice Comment-202605265 applies.
	/// Comment-202503168 applies.
	/// Comment-202503153 applies.
	function bidWithCstAndDonateNft(
		uint256 priceMaxLimit_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC721 nftAddress_,
		uint256 nftId_
	) external;

	/// @notice Comment-202605266 applies.
	/// Comment-202503168 relates.
	/// @param priceMaxLimit_ Comment-202605268 applies.
	/// Comment-202503162 relates and/or applies.
	/// @param message_ Comment-202503155 applies.
	/// @param bidCstRewardAmountMinLimit_ Comment-202605279 applies.
	function bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) external;

	/// @notice Comment-202605269 applies.
	function getNextCstBidPrice() external view returns (uint256);

	/// @notice Comment-202605271 applies.
	/// See also: `getNextCstBidPrice`.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return Comment-202605272 applies.
	/// Comment-202501022 applies.
	/// @dev Comment-202503162 applies.
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) external view returns (uint256);

	/// @return Comment-202605273 applies.
	/// Comment-202501022 applies to the returned elapsed duration.
	function getCstDutchAuctionDurations() external view returns (uint256, int256);

	/// @notice Calls `getBidCstRewardAmountAdvanced` with `currentTimeOffset_ = 0`.
	/// Comments near `getBidCstRewardAmountAdvanced` apply.
	function getBidCstRewardAmount() external view returns (uint256);

	/// @notice Calculates and returns the current CST amount to be minted to a bidder as a reward for placing a bid.
	/// It can be zero.
	/// In V3+, Comment-202501022 applies.
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @dev This logic can, in theory, overflow, as detailed in Comment-202605295.
	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) external view returns (uint256);
}
