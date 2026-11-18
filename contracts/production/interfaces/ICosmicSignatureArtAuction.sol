// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

/// @notice Immutable English auctions for the eight additional Cosmic Signature NFTs created per cycle.
interface ICosmicSignatureArtAuction {
	struct Auction {
		uint256 roundNum;
		uint256 eligibleAt;
		uint256 endAt;
		address highestBidder;
		uint256 highestBid;
		bool registered;
		bool settled;
		bool delivered;
		bool proceedsForwarded;
	}

	error InvalidContractAddress(address account);
	error CollectionGameMismatch(address expectedGame, address actualGame);
	error OnlyGame(address caller);
	error InvalidArtAuctionOpeningBid();
	error RoundAlreadyRegistered(uint256 roundNum);
	error InvalidBatchRange(uint256 firstNftId, uint256 totalSupply);
	error NftAlreadyRegistered(uint256 nftId);
	error NftNotInCustody(uint256 nftId, address owner);
	error UnknownAuction(uint256 nftId);
	error AuctionNotEligible(uint256 nftId, uint256 eligibleAt);
	error AuctionNotStarted(uint256 nftId);
	error AuctionEnded(uint256 nftId, uint256 endAt);
	error AuctionNotEnded(uint256 nftId, uint256 endAt);
	error BidTooLow(uint256 minimumBid, uint256 proposedBid);
	error IncorrectBidFunding(uint256 requiredValue, uint256 suppliedValue);
	error AuctionAlreadySettled(uint256 nftId);
	error AuctionNotSettled(uint256 nftId);
	error OnlyWinner(uint256 nftId, address caller);
	error NftAlreadyDelivered(uint256 nftId);
	error ProceedsAlreadyForwarded(uint256 nftId);
	error InvalidRecipient(address recipient);
	error NoRefundCredit(address account);
	error RefundTransferFailed(address recipient, uint256 amount);
	error NoSurplus();

	event AuctionBatchRegistered(uint256 indexed roundNum, uint256 indexed firstNftId, uint256 count, uint256 eligibleAt, uint256 openingBid);
	event AuctionBidPlaced(uint256 indexed nftId, uint256 indexed roundNum, address indexed bidder, uint256 amount, uint256 ethPaid, uint256 endAt);
	event AuctionRefundCredited(address indexed bidder, uint256 indexed nftId, uint256 amount);
	event AuctionRefundWithdrawn(address indexed bidder, address indexed recipient, uint256 amount);
	event AuctionSettled(uint256 indexed nftId, uint256 indexed roundNum, address indexed winner, uint256 amount);
	event AuctionNftDelivered(uint256 indexed nftId, address indexed winner, address indexed recipient);
	event AuctionProceedsForwarded(uint256 indexed nftId, uint256 indexed roundNum, uint256 amount);
	event AuctionSurplusForwarded(uint256 amount);

	function game() external view returns (address);
	function nft() external view returns (address);
	function getAuction(uint256 nftId_) external view returns (Auction memory);
	function minimumNextBid(uint256 nftId_) external view returns (uint256);
	function totalLiabilities() external view returns (uint256);
	function refundCredits(address account_) external view returns (uint256);
	function totalBidEscrow() external view returns (uint256);
	function totalRefundCredits() external view returns (uint256);
	function totalPendingProceeds() external view returns (uint256);
	function registeredRounds(uint256 roundNum_) external view returns (bool);
	/// @notice Immutable opening price of all eight lots in this batch, or zero before registration.
	function openingBidByRound(uint256 roundNum_) external view returns (uint256);
	function registeredBatchCount() external view returns (uint256);
	function firstNftIdByBatchIndex(uint256 batchIndex_) external view returns (uint256);

	/// @notice Registers the latest eight freshly minted tokens. The game must mint and register atomically.
	function registerAuctionBatch(uint256 roundNum_, uint256 firstNftId_, uint256 openingBid_) external;

	/// @notice Places a direct offer at the total specified price, not an automatic maximum bid.
	/// @dev The current leader funds only the increase. Every other bidder funds the entire new bid.
	function bid(uint256 nftId_, uint256 totalBidAmount_) external payable;
	function settle(uint256 nftId_) external;
	function claimNft(uint256 nftId_, address recipient_) external;
	function withdrawRefund(address payable recipient_) external;
	function forwardProceeds(uint256 nftId_) external;
	function forwardSurplus() external;
}
