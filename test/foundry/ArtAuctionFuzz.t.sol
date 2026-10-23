// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { CosmicSignatureArtAuction } from "../../contracts/production/CosmicSignatureArtAuction.sol";
import { ICosmicSignatureArtAuction } from "../../contracts/production/interfaces/ICosmicSignatureArtAuction.sol";
import { ArtAuctionTestGame, ArtAuctionTestNft } from "../../contracts/tests/ArtAuctionTestHarness.sol";

interface AuctionFuzzVm {
	function deal(address account_, uint256 balance_) external;
	function warp(uint256 timestamp_) external;
	function prank(address sender_) external;
	function expectRevert(bytes calldata revertData_) external;
}

/// @notice Guards the compiler fix for SOL-2026-7; this is a compiler probe, not auction logic.
contract ArtAuctionCompilerRegressionTest {
	uint256[8] private _values;

	function writeThroughReassignedIndex(uint256 initialSteps_, uint256 laterSteps_) external returns (uint256) {
		uint256 index_;
		for (uint256 step_; step_ < initialSteps_; ++step_) ++index_;
		uint256 savedIndex_ = index_ + 1;
		_values[savedIndex_] = 17;
		for (uint256 step_; step_ < laterSteps_; ++step_) ++index_;
		_values[index_] = 29;
		return _values[savedIndex_];
	}

	function test_ReassignedIndexMustInvalidateAliasedStorageKnowledge() public {
		require(this.writeThroughReassignedIndex(0, 1) == 29, "Compiler returned a stale aliased value");
		require(this.writeThroughReassignedIndex(0, 2) == 17, "Compiler confused distinct storage locations");
	}
}

/// @notice Independent EVM fuzz runner; no forge-std dependency or production-source preprocessing.
contract ArtAuctionFuzzTest {
	AuctionFuzzVm private constant _VM = AuctionFuzzVm(address(uint160(uint256(keccak256("hevm cheat code")))));
	ArtAuctionTestGame private _game;
	ArtAuctionTestNft private _nft;
	CosmicSignatureArtAuction private _auction;
	address private constant _ALICE = address(0xA11CE);
	address private constant _BOB = address(0xB0B);

	function setUp() public {
		_game = new ArtAuctionTestGame();
		_nft = new ArtAuctionTestNft(address(_game));
		_game.setNft(address(_nft));
		_auction = new CosmicSignatureArtAuction(address(_game), address(_nft));
		_game.mintAndRegister(address(_auction), 0, 123);
		_VM.warp(_auction.getAuction(0).eligibleAt);
	}

	function testFuzz_RoundingAndExactSelfRaise(uint128 bidInput_) public {
		uint256 firstBid_ = uint256(bidInput_) + _auction.MINIMUM_BID();
		_VM.deal(_ALICE, firstBid_ * 3);
		_VM.prank(_ALICE);
		_auction.bid{value: firstBid_}(0, firstBid_);
		uint256 increase_ = firstBid_ / 10 + (firstBid_ % 10 == 0 ? 0 : 1);
		uint256 nextBid_ = _auction.minimumNextBid(0);
		require(nextBid_ == firstBid_ + increase_, "Incorrect rounded minimum");
		_VM.prank(_ALICE);
		_auction.bid{value: increase_}(0, nextBid_);
		require(_auction.refundCredits(_ALICE) == 0, "Self-raise created refund");
		require(address(_auction).balance == nextBid_, "Incorrect self-raise funding");
		require(_auction.totalLiabilities() == nextBid_, "Incorrect liability");
	}

	function testFuzz_LateBidClock(uint32 arrivalInput_) public {
		uint256 firstBid_ = _auction.MINIMUM_BID();
		_VM.deal(_ALICE, 1 ether);
		_VM.deal(_BOB, 1 ether);
		_VM.prank(_ALICE);
		_auction.bid{value: firstBid_}(0, firstBid_);
		uint256 originalEnd_ = _auction.getAuction(0).endAt;
		uint256 arrival_ = block.timestamp + uint256(arrivalInput_) % _auction.AUCTION_DURATION();
		_VM.warp(arrival_);
		uint256 nextBid_ = _auction.minimumNextBid(0);
		_VM.prank(_BOB);
		_auction.bid{value: nextBid_}(0, nextBid_);
		uint256 expectedEnd_ = originalEnd_ - arrival_ < 600 ? arrival_ + 600 : originalEnd_;
		require(_auction.getAuction(0).endAt == expectedEnd_, "Incorrect close extension");
		require(_auction.refundCredits(_ALICE) == firstBid_, "Lost outbid funds");
	}

	function testFuzz_UnderfundedBidAlwaysRollsBack(uint128 priceInput_, uint128 deficitInput_) public {
		uint256 price_ = uint256(priceInput_) + _auction.MINIMUM_BID();
		uint256 deficit_ = uint256(deficitInput_) % price_ + 1;
		uint256 sent_ = price_ - deficit_;
		_VM.deal(_ALICE, price_);
		_VM.expectRevert(abi.encodeWithSelector(ICosmicSignatureArtAuction.IncorrectBidFunding.selector, price_, sent_));
		_VM.prank(_ALICE);
		_auction.bid{value: sent_}(0, price_);
		require(_auction.getAuction(0).endAt == 0, "Rejected bid started clock");
		require(_auction.totalLiabilities() == 0 && address(_auction).balance == 0, "Rejected bid changed accounting");
	}
}

/// @notice Stateful handler records independent cash movements while interleaving every public workflow.
contract ArtAuctionInvariantHandler {
	AuctionFuzzVm private constant _VM = AuctionFuzzVm(address(uint160(uint256(keccak256("hevm cheat code")))));
	CosmicSignatureArtAuction public immutable auction;
	ArtAuctionTestGame public immutable game;
	uint256 public totalFunded;
	uint256 public totalRefunded;
	uint256 public totalForwarded;
	uint256 public totalForced;
	mapping(uint256 => address) public deliveredTo;

	constructor(CosmicSignatureArtAuction auction_, ArtAuctionTestGame game_) {
		auction = auction_;
		game = game_;
	}

	function actor(uint256 index_) public pure returns (address) {
		return address(uint160(0x1000 + index_ % 6));
	}

	function placeBid(uint256 actorInput_, uint256 tokenInput_, uint96 jumpInput_) external {
		uint256 token_ = tokenInput_ % 8;
		ICosmicSignatureArtAuction.Auction memory lot_ = auction.getAuction(token_);
		if (block.timestamp < lot_.eligibleAt || (lot_.endAt != 0 && block.timestamp >= lot_.endAt)) return;
		address bidder_ = actor(actorInput_);
		uint256 amount_ = auction.minimumNextBid(token_) + uint256(jumpInput_) % 3 ether;
		uint256 payment_ = lot_.highestBidder == bidder_ ? amount_ - lot_.highestBid : amount_;
		_VM.deal(bidder_, payment_);
		_VM.prank(bidder_);
		auction.bid{value: payment_}(token_, amount_);
		totalFunded += payment_;
	}

	function advanceTime(uint32 seconds_) external {
		_VM.warp(block.timestamp + uint256(seconds_) % 3 days);
	}

	function settle(uint256 tokenInput_) external {
		uint256 token_ = tokenInput_ % 8;
		ICosmicSignatureArtAuction.Auction memory lot_ = auction.getAuction(token_);
		if (lot_.settled || lot_.endAt == 0 || block.timestamp < lot_.endAt) return;
		auction.settle(token_);
	}

	function retrieve(uint256 actorInput_, uint256 recipientInput_) external {
		address bidder_ = actor(actorInput_);
		uint256 amount_ = auction.refundCredits(bidder_);
		if (amount_ == 0) return;
		_VM.prank(bidder_);
		auction.withdrawRefund(payable(actor(recipientInput_)));
		totalRefunded += amount_;
	}

	function receiveNft(uint256 tokenInput_, uint256 recipientInput_) external {
		uint256 token_ = tokenInput_ % 8;
		ICosmicSignatureArtAuction.Auction memory lot_ = auction.getAuction(token_);
		if (!lot_.settled || lot_.delivered) return;
		address recipient_ = actor(recipientInput_);
		_VM.prank(lot_.highestBidder);
		auction.claimNft(token_, recipient_);
		deliveredTo[token_] = recipient_;
	}

	function forward(uint256 tokenInput_, bool fail_) external {
		uint256 token_ = tokenInput_ % 8;
		ICosmicSignatureArtAuction.Auction memory lot_ = auction.getAuction(token_);
		if (!lot_.settled || lot_.proceedsForwarded) return;
		game.setRejectDonations(fail_);
		if (fail_) {
			try auction.forwardProceeds(token_) { revert("Rejected destination accepted proceeds"); }
			catch { require(!auction.getAuction(token_).proceedsForwarded, "Failed send consumed proceeds"); }
		} else {
			auction.forwardProceeds(token_);
			totalForwarded += lot_.highestBid;
		}
		game.setRejectDonations(false);
	}

	function forceEth(uint96 amountInput_) external {
		uint256 amount_ = uint256(amountInput_) % 1 ether;
		_VM.deal(address(auction), address(auction).balance + amount_);
		totalForced += amount_;
	}

	function forwardSurplus() external {
		uint256 amount_ = address(auction).balance - auction.totalLiabilities();
		if (amount_ == 0) return;
		auction.forwardSurplus();
		totalForwarded += amount_;
	}
}

contract ArtAuctionInvariantTest {
	AuctionFuzzVm private constant _VM = AuctionFuzzVm(address(uint160(uint256(keccak256("hevm cheat code")))));
	ArtAuctionTestGame private _game;
	ArtAuctionTestNft private _nft;
	CosmicSignatureArtAuction private _auction;
	ArtAuctionInvariantHandler private _handler;

	function setUp() public {
		_game = new ArtAuctionTestGame();
		_nft = new ArtAuctionTestNft(address(_game));
		_game.setNft(address(_nft));
		_auction = new CosmicSignatureArtAuction(address(_game), address(_nft));
		_game.mintAndRegister(address(_auction), 0, 321);
		_handler = new ArtAuctionInvariantHandler(_auction, _game);
		_VM.warp(_auction.getAuction(0).eligibleAt);
	}

	struct FuzzSelector { address addr; bytes4[] selectors; }
	struct FuzzArtifactSelector { string artifact; bytes4[] selectors; }
	struct FuzzInterface { address addr; string[] artifacts; }

	// Foundry reads these configuration getters; empty lists retain its default selection policies.
	function targetArtifactSelectors() public pure returns (FuzzArtifactSelector[] memory) { return new FuzzArtifactSelector[](0); }
	function targetArtifacts() public pure returns (string[] memory) { return new string[](0); }
	function excludeArtifacts() public pure returns (string[] memory) { return new string[](0); }
	function targetSenders() public pure returns (address[] memory) { return new address[](0); }
	function excludeSenders() public pure returns (address[] memory) { return new address[](0); }
	function excludeContracts() public pure returns (address[] memory) { return new address[](0); }
	function targetInterfaces() public pure returns (FuzzInterface[] memory) { return new FuzzInterface[](0); }
	function targetSelectors() public pure returns (FuzzSelector[] memory) { return new FuzzSelector[](0); }
	function excludeSelectors() public pure returns (FuzzSelector[] memory) { return new FuzzSelector[](0); }

	function targetContracts() public view returns (address[] memory result_) {
		result_ = new address[](1);
		result_[0] = address(_handler);
	}

	function invariant_AllLiabilitiesAndCustodyAreConserved() public view {
		uint256 escrow_;
		uint256 proceeds_;
		uint256 refunds_;
		for (uint256 token_ = 0; token_ < 8; ++token_) {
			ICosmicSignatureArtAuction.Auction memory lot_ = _auction.getAuction(token_);
			if (!lot_.settled) escrow_ += lot_.highestBid;
			else if (!lot_.proceedsForwarded) proceeds_ += lot_.highestBid;
			require(_nft.ownerOf(token_) == (lot_.delivered ? _handler.deliveredTo(token_) : address(_auction)), "Custody mismatch");
			if (lot_.delivered || lot_.proceedsForwarded) require(lot_.settled, "Action before settlement");
		}
		for (uint256 index_ = 0; index_ < 6; ++index_) refunds_ += _auction.refundCredits(_handler.actor(index_));
		require(escrow_ == _auction.totalBidEscrow(), "Bid escrow mismatch");
		require(proceeds_ == _auction.totalPendingProceeds(), "Proceeds mismatch");
		require(refunds_ == _auction.totalRefundCredits(), "Refund mismatch");
		require(address(_auction).balance >= escrow_ + proceeds_ + refunds_, "Insolvent");
		require(address(_auction).balance == _handler.totalFunded() + _handler.totalForced() - _handler.totalRefunded() - _handler.totalForwarded(), "Cash conservation mismatch");
		require(_game.totalDonations() == _handler.totalForwarded(), "Forwarding mismatch");
		require(_game.receiveCount() == 0, "Raw receive called");
	}
}
