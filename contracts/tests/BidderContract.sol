// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;
pragma abicoder v2;

import { IERC721, ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { CosmicSignatureToken } from "../production/CosmicSignatureToken.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
import { PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract BidderContract {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	address public immutable creator;
	uint256 public lastTokenIdChecked = 0;
	uint256[] public myDonatedNfts;
	bool public blockDeposits = false;
	
	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
		creator = msg.sender;
	}

	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}

	function doBid() external payable {
		uint256 price = cosmicSignatureGame.getNextEthBidPrice(int256(0));
		cosmicSignatureGame.bid{ value: price }((-1), "contract bid");
	}

	function doBid2() external payable {
		cosmicSignatureGame.bid{ value: msg.value }((-1), "contract bid");
	}

	function doBidRWalk(int256 nftId) external payable {
		uint256 price = cosmicSignatureGame.getEthPlusRandomWalkNftBidPrice(cosmicSignatureGame.getNextEthBidPrice(int256(0)));
		cosmicSignatureGame.bid{ value: price }(nftId, "contract bid rwalk");
	}

	function doBidRWalk2(int256 nftId) external payable {
		RandomWalkNFT rwalk = cosmicSignatureGame.randomWalkNft();
		rwalk.setApprovalForAll(address(cosmicSignatureGame), true);
		rwalk.transferFrom(msg.sender, address(this), uint256(nftId));
		cosmicSignatureGame.bid{ value: msg.value }(nftId, "contract bid rwalk");
	}

	function doBidAndDonateNft(IERC721 nftAddress_, uint256 nftId_) external payable {
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		// nftAddress_.setApprovalForAll(address(cosmicSignatureGame), true);
		nftAddress_.setApprovalForAll(address(prizesWallet_), true);
		// uint256 numDonatedNfts_ = cosmicSignatureGame.numDonatedNfts();
		uint256 numDonatedNfts_ = prizesWallet_.numDonatedNfts();
		myDonatedNfts.push(numDonatedNfts_);
		uint256 price = cosmicSignatureGame.getNextEthBidPrice(int256(0));
		cosmicSignatureGame.bidAndDonateNft{value: price}((-1), "contract bid with donation", nftAddress_, nftId_);
	}

	function doClaim() external {
		cosmicSignatureGame.claimMainPrize();
	}

	// function withdrawEthPrize(address destination) external {
	// 	PrizesWallet prizesWallet_ = PrizesWallet(destination);
	// 	prizesWallet_.withdrawEth();
	// }

	/// @dev Issue. Should this method now call `PrizesWallet.withdrawEverything`?
	function withdrawAll() external {
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
	
		// Issue. `PrizesWallet.withdrawEth` won't revert on zero balance any more.
		// So it could make sense to call it without checking balance.
		// But it would cost more gas if the balance amount is zero.
		// Comment-202409215 relates.
		uint256 bal_ = prizesWallet_.getEthBalanceInfo().amount;
		if (bal_ > 0) {
			prizesWallet_.withdrawEth();
		}
	
		CosmicSignatureNft nft_ = cosmicSignatureGame.nft();
		// todo-1 Review all calls to `call`.
		// todo-1 I didn't replace those with high level calls when it's used simply to send funds.
		// todo-1 Think if it's still possible to communicate to SMTChecker which specific contract we send funds to.
		// todo-1 Maybe in the mode in which SMTChecker is enabled make high level calls.
		// todo-1 In any case, write comments.
		(bool isSuccess_, ) = creator.call{value: address(this).balance}("");
		// todo-1 Why we do this?
		// todo-1 We don't evaluate this.
		isSuccess_ = false;
		uint256 totalSupply = nft_.totalSupply();
		for (uint256 i = lastTokenIdChecked; i < totalSupply; i++) {
			address tokenOwner = nft_.ownerOf(i);
			if (tokenOwner == address(this)) {
				// Comment-202501145 applies.
				nft_.transferFrom(address(this), creator, i);
			}
		}
		if (totalSupply > 0) {
			lastTokenIdChecked = totalSupply - 1;
		}
		CosmicSignatureToken token_ = cosmicSignatureGame.token();
	
		// Issue. Making multiple external calls to `token_`.
		uint256 ctokenBalance = token_.balanceOf(address(this));
		if (ctokenBalance > 0) {
			token_.transfer(creator, ctokenBalance);
		}
	
		for (uint256 i = 0; i < myDonatedNfts.length; i++) {
			uint256 num = myDonatedNfts[i];
			//(IERC721 tokenAddr, uint256 nftId, , ) = cosmicSignatureGame.donatedNfts(num);
			( , IERC721 tokenAddr, uint256 nftId) = prizesWallet_.donatedNfts(num);
			// cosmicSignatureGame.claimDonatedNft(num);

			// Issue. Making multiple external calls to `prizesWallet_`.
			prizesWallet_.claimDonatedNft(num);

			tokenAddr.transferFrom(address(this), creator, nftId);
		}
		delete myDonatedNfts;
	}

	function doFailedBid() external payable {
		uint256 price = msg.value;
		blockDeposits = true;
		cosmicSignatureGame.bid{ value: price }((-1), "contract bid");
		blockDeposits = false;
	}

	function startBlockingDeposits() external {
		blockDeposits = true;
	}

	function stopBlockingDeposits() external {
		blockDeposits = false;
	}
}

/// @notice Bidder Contract but not an `IERC721Receiver`.
/// ToDo-202412176-1 relates and/or applies.
contract BidCNonRecv {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	address public immutable creator;

	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
		creator = msg.sender;
	}

	receive() external payable {}

	function doBid() external payable {
		uint256 price = cosmicSignatureGame.getNextEthBidPrice(int256(0));
		cosmicSignatureGame.bid{ value: price }((-1), "non-IERC721Receiver bid");
	}
	
	function doClaim() external {
		cosmicSignatureGame.claimMainPrize();
	}
}
