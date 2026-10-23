// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ICosmicSignatureNft } from "../production/interfaces/ICosmicSignatureNft.sol";
import { ICosmicSignatureArtAuction } from "../production/interfaces/ICosmicSignatureArtAuction.sol";

/// @notice Test-only receiver that records a hostile callback without requiring it to succeed.
abstract contract ArtAuctionTestCallback {
	address public callbackTarget;
	bytes public callbackData;
	uint256 public callbackValue;
	bool public requireCallbackSuccess;
	bool public callbackSucceeded;
	bytes public callbackResult;
	uint256 public callbackCount;

	function configureCallback(address target_, bytes calldata data_, uint256 value_, bool requireSuccess_) external {
		callbackTarget = target_;
		callbackData = data_;
		callbackValue = value_;
		requireCallbackSuccess = requireSuccess_;
		callbackSucceeded = false;
		delete callbackResult;
	}

	function _callback() internal {
		if (callbackTarget == address(0)) return;
		++callbackCount;
		(bool success_, bytes memory result_) = callbackTarget.call{value: callbackValue}(callbackData);
		callbackSucceeded = success_;
		callbackResult = result_;
		if (requireCallbackSuccess) require(success_, "Callback rejected");
	}
}

/// @notice Test-only game: explicit donations and accidental receive calls have distinct counters.
contract ArtAuctionTestGame is ArtAuctionTestCallback {
	address public nft;
	uint256 public donationCount;
	uint256 public totalDonations;
	uint256 public receiveCount;
	bool public rejectDonations;

	error DonationRejected();

	function setNft(address nft_) external {
		nft = nft_;
	}

	function setRejectDonations(bool value_) external {
		rejectDonations = value_;
	}

	function donateEth() external payable {
		if (rejectDonations) revert DonationRejected();
		++donationCount;
		totalDonations += msg.value;
		_callback();
	}

	receive() external payable {
		++receiveCount;
	}

	function mintAndRegister(address auction_, uint256 roundNum_, uint256 seed_) external returns (uint256 firstNftId_) {
		address[] memory recipients_ = new address[](8);
		for (uint256 index_ = 0; index_ < recipients_.length; ++index_) recipients_[index_] = auction_;
		firstNftId_ = ICosmicSignatureNft(nft).mintMany(roundNum_, recipients_, seed_);
		ICosmicSignatureArtAuction(auction_).registerAuctionBatch(roundNum_, firstNftId_);
	}

	function mintTo(address recipient_, uint256 count_, uint256 roundNum_) external returns (uint256) {
		address[] memory recipients_ = new address[](count_);
		for (uint256 index_ = 0; index_ < count_; ++index_) recipients_[index_] = recipient_;
		return ICosmicSignatureNft(nft).mintMany(roundNum_, recipients_, 123);
	}

	function registerExisting(address auction_, uint256 roundNum_, uint256 firstNftId_) external {
		ICosmicSignatureArtAuction(auction_).registerAuctionBatch(roundNum_, firstNftId_);
	}
}

/// @notice Test-only wallet and receiver, including ETH/NFT rejection and callback probes.
contract ArtAuctionTestActor is ArtAuctionTestCallback, IERC721Receiver {
	bool public rejectEth;
	bool public rejectNft;

	function setRejectEth(bool value_) external {
		rejectEth = value_;
	}

	function setRejectNft(bool value_) external {
		rejectNft = value_;
	}

	function execute(address target_, bytes calldata data_) external payable returns (bytes memory) {
		(bool success_, bytes memory result_) = target_.call{value: msg.value}(data_);
		if (!success_) {
			assembly ("memory-safe") { revert(add(result_, 32), mload(result_)) }
		}
		return result_;
	}

	receive() external payable {
		require(!rejectEth, "ETH rejected");
		_callback();
	}

	function onERC721Received(address, address, uint256, bytes calldata) external override returns (bytes4) {
		require(!rejectNft, "NFT rejected");
		_callback();
		return IERC721Receiver.onERC721Received.selector;
	}
}

/// @notice Test-only NFT used to make custody reads fail or transfer callbacks hostile.
contract ArtAuctionTestNft is ERC721, ArtAuctionTestCallback {
	address public immutable game;
	uint256 public totalSupply;
	bool public rejectOwnershipRead;
	bool public rejectTransfers;

	constructor(address game_) ERC721("Auction test NFT", "ATNFT") {
		game = game_;
	}

	function setRejectOwnershipRead(bool value_) external {
		rejectOwnershipRead = value_;
	}

	function setRejectTransfers(bool value_) external {
		rejectTransfers = value_;
	}

	function mintMany(uint256, address[] calldata recipients_, uint256) external returns (uint256 firstNftId_) {
		require(msg.sender == game, "Only test game");
		firstNftId_ = totalSupply;
		for (uint256 index_ = 0; index_ < recipients_.length; ++index_) {
			_mint(recipients_[index_], totalSupply);
			++totalSupply;
		}
	}

	function ownerOf(uint256 nftId_) public view override returns (address) {
		require(!rejectOwnershipRead, "Ownership read rejected");
		return super.ownerOf(nftId_);
	}

	function safeTransferFrom(address from_, address to_, uint256 nftId_, bytes memory data_) public override {
		require(!rejectTransfers, "Transfer rejected");
		_callback();
		super.safeTransferFrom(from_, to_, nftId_, data_);
	}
}

/// @notice Forces unexpected ETH into the auction without a receive function.
contract ArtAuctionTestForcedEth {
	constructor(address payable recipient_) payable {
		selfdestruct(recipient_);
	}
}
