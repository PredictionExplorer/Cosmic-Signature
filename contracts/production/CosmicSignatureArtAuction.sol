// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IEthDonations } from "./interfaces/IEthDonations.sol";
import { ICosmicSignatureArtAuction } from "./interfaces/ICosmicSignatureArtAuction.sol";

/// @notice Non-upgradeable, fully funded English auctions with no administrator or cancellation path.
/// @dev NFT identity and seed come from the existing collection. This contract does not attest to
/// media availability or remove the collection's existing metadata powers. The game remains upgradeable.
contract CosmicSignatureArtAuction is ReentrancyGuardTransient, ICosmicSignatureArtAuction {
	uint256 public constant NFTS_PER_BATCH = 8;
	uint256 public constant ELIGIBILITY_DELAY = 7 days;
	uint256 public constant AUCTION_DURATION = 48 hours;
	uint256 public constant MINIMUM_INCREASE_DIVISOR = 10;
	uint256 public constant EXTENSION_DURATION = 10 minutes;

	address public immutable override game;
	address public immutable override nft;

	mapping(uint256 => Auction) private _auctions;
	uint256[] private _firstNftIds;
	mapping(uint256 => uint256) public override openingBidByRound;
	mapping(address => uint256) public override refundCredits;
	uint256 public override totalBidEscrow;
	uint256 public override totalRefundCredits;
	uint256 public override totalPendingProceeds;

	constructor(address game_, address nft_) {
		if (game_.code.length == 0) revert InvalidContractAddress(game_);
		if (nft_.code.length == 0) revert InvalidContractAddress(nft_);
		address collectionGame_ = CosmicSignatureNft(nft_).game();
		if (collectionGame_ != game_) revert CollectionGameMismatch(game_, collectionGame_);
		game = game_;
		nft = nft_;
	}

	/// @inheritdoc ICosmicSignatureArtAuction
	function registerAuctionBatch(uint256 roundNum_, uint256 firstNftId_, uint256 openingBid_) external override nonReentrant {
		if (msg.sender != game) revert OnlyGame(msg.sender);
		if (openingBid_ == 0) revert InvalidArtAuctionOpeningBid();
		if (registeredRounds(roundNum_)) revert RoundAlreadyRegistered(roundNum_);
		uint256 totalSupply_ = CosmicSignatureNft(nft).totalSupply();
		if (totalSupply_ < NFTS_PER_BATCH || firstNftId_ != totalSupply_ - NFTS_PER_BATCH) {
			revert InvalidBatchRange(firstNftId_, totalSupply_);
		}
		uint256 eligibleAt_ = block.timestamp + ELIGIBILITY_DELAY;
		openingBidByRound[roundNum_] = openingBid_;
		for (uint256 index_ = 0; index_ < NFTS_PER_BATCH; ++index_) {
			uint256 nftId_ = firstNftId_ + index_;
			Auction storage auction_ = _auctions[nftId_];
			if (auction_.registered) revert NftAlreadyRegistered(nftId_);
			address owner_ = CosmicSignatureNft(nft).ownerOf(nftId_);
			if (owner_ != address(this)) revert NftNotInCustody(nftId_, owner_);
			auction_.roundNum = roundNum_;
			auction_.eligibleAt = eligibleAt_;
			auction_.registered = true;
		}
		_firstNftIds.push(firstNftId_);
		emit AuctionBatchRegistered(roundNum_, firstNftId_, NFTS_PER_BATCH, eligibleAt_, openingBid_);
	}

	/// @inheritdoc ICosmicSignatureArtAuction
	function registeredRounds(uint256 roundNum_) public view override returns (bool) {
		return openingBidByRound[roundNum_] != 0;
	}

	function registeredBatchCount() external view override returns (uint256) {
		return _firstNftIds.length;
	}

	function firstNftIdByBatchIndex(uint256 batchIndex_) external view override returns (uint256) {
		return _firstNftIds[batchIndex_];
	}

	function getAuction(uint256 nftId_) external view override returns (Auction memory) {
		return _getAuction(nftId_);
	}

	/// @dev This quotes the next price only. Eligibility and whether bidding has ended are separate facts.
	function minimumNextBid(uint256 nftId_) public view override returns (uint256) {
		Auction storage auction_ = _getAuction(nftId_);
		uint256 highestBid_ = auction_.highestBid;
		if (highestBid_ == 0) return openingBidByRound[auction_.roundNum];
		uint256 increase_ = highestBid_ / MINIMUM_INCREASE_DIVISOR;
		if (highestBid_ % MINIMUM_INCREASE_DIVISOR != 0) ++increase_;
		return highestBid_ + increase_;
	}

	/// @inheritdoc ICosmicSignatureArtAuction
	function bid(uint256 nftId_, uint256 totalBidAmount_) external payable override nonReentrant {
		Auction storage auction_ = _getAuction(nftId_);
		if (block.timestamp < auction_.eligibleAt) revert AuctionNotEligible(nftId_, auction_.eligibleAt);
		uint256 endAt_ = auction_.endAt;
		if (endAt_ != 0 && block.timestamp >= endAt_) revert AuctionEnded(nftId_, endAt_);
		uint256 minimumBid_ = minimumNextBid(nftId_);
		if (totalBidAmount_ < minimumBid_) revert BidTooLow(minimumBid_, totalBidAmount_);
		address prevBidder_ = auction_.highestBidder;
		uint256 prevBid_ = auction_.highestBid;
		uint256 requiredValue_ = (msg.sender == prevBidder_) ? totalBidAmount_ - prevBid_ : totalBidAmount_;
		if (msg.value != requiredValue_) revert IncorrectBidFunding(requiredValue_, msg.value);

		if (endAt_ == 0) {
			endAt_ = block.timestamp + AUCTION_DURATION;
		} else if (endAt_ - block.timestamp < EXTENSION_DURATION) {
			endAt_ = block.timestamp + EXTENSION_DURATION;
		}
		if (prevBidder_ != address(0) && prevBidder_ != msg.sender) {
			refundCredits[prevBidder_] += prevBid_;
			totalRefundCredits += prevBid_;
			emit AuctionRefundCredited(prevBidder_, nftId_, prevBid_);
		}
		totalBidEscrow = totalBidEscrow - prevBid_ + totalBidAmount_;
		auction_.highestBidder = msg.sender;
		auction_.highestBid = totalBidAmount_;
		auction_.endAt = endAt_;
		emit AuctionBidPlaced(nftId_, auction_.roundNum, msg.sender, totalBidAmount_, msg.value, endAt_);
	}

	/// @notice Records the result without calling the winner, NFT receiver, or funding recipient.
	function settle(uint256 nftId_) external override nonReentrant {
		Auction storage auction_ = _getAuction(nftId_);
		if (auction_.settled) revert AuctionAlreadySettled(nftId_);
		if (auction_.endAt == 0) revert AuctionNotStarted(nftId_);
		if (block.timestamp < auction_.endAt) revert AuctionNotEnded(nftId_, auction_.endAt);
		auction_.settled = true;
		totalBidEscrow -= auction_.highestBid;
		totalPendingProceeds += auction_.highestBid;
		emit AuctionSettled(nftId_, auction_.roundNum, auction_.highestBidder, auction_.highestBid);
	}

	/// @notice Only the winner chooses the receiving address. A failed delivery leaves the right intact.
	function claimNft(uint256 nftId_, address recipient_) external override nonReentrant {
		Auction storage auction_ = _getAuction(nftId_);
		if (!auction_.settled) revert AuctionNotSettled(nftId_);
		if (msg.sender != auction_.highestBidder) revert OnlyWinner(nftId_, msg.sender);
		if (auction_.delivered) revert NftAlreadyDelivered(nftId_);
		_checkRecipient(recipient_);
		auction_.delivered = true;
		CosmicSignatureNft(nft).safeTransferFrom(address(this), recipient_, nftId_);
		emit AuctionNftDelivered(nftId_, msg.sender, recipient_);
	}

	function withdrawRefund(address payable recipient_) external override nonReentrant {
		_checkRecipient(recipient_);
		uint256 amount_ = refundCredits[msg.sender];
		if (amount_ == 0) revert NoRefundCredit(msg.sender);
		refundCredits[msg.sender] = 0;
		totalRefundCredits -= amount_;
		(bool success_, ) = recipient_.call{value: amount_}("");
		if (!success_) revert RefundTransferFailed(recipient_, amount_);
		emit AuctionRefundWithdrawn(msg.sender, recipient_, amount_);
	}

	/// @notice Anyone can forward a settled lot's final price. Failure rolls back only this forwarding.
	function forwardProceeds(uint256 nftId_) external override nonReentrant {
		Auction storage auction_ = _getAuction(nftId_);
		if (!auction_.settled) revert AuctionNotSettled(nftId_);
		if (auction_.proceedsForwarded) revert ProceedsAlreadyForwarded(nftId_);
		auction_.proceedsForwarded = true;
		totalPendingProceeds -= auction_.highestBid;

		// Empty calldata would invoke the game's bidding receive function. The explicit contribution
		// endpoint changes no participation state. Its failure leaves this lot's proceeds retryable.
		IEthDonations(game).donateEth{value: auction_.highestBid}();
		emit AuctionProceedsForwarded(nftId_, auction_.roundNum, auction_.highestBid);
	}

	function totalLiabilities() public view override returns (uint256) {
		return totalBidEscrow + totalRefundCredits + totalPendingProceeds;
	}

	/// @notice Unexpected ETH can only fund the same game, never spend a bidder's or settled lot's money.
	/// @dev Ordinary unsolicited ETH and safe NFT transfers are rejected. Forced ETH is still possible;
	/// unsafe NFT transfers cannot create an auction and have no discretionary rescue path.
	function forwardSurplus() external override nonReentrant {
		uint256 amount_ = address(this).balance - totalLiabilities();
		if (amount_ == 0) revert NoSurplus();
		IEthDonations(game).donateEth{value: amount_}();
		emit AuctionSurplusForwarded(amount_);
	}

	function _getAuction(uint256 nftId_) private view returns (Auction storage auction_) {
		auction_ = _auctions[nftId_];
		if (!auction_.registered) revert UnknownAuction(nftId_);
	}

	function _checkRecipient(address recipient_) private view {
		if (recipient_ == address(0) || recipient_ == address(this)) revert InvalidRecipient(recipient_);
	}
}
