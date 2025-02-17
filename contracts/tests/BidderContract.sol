// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;
pragma abicoder v2;

import { IERC721, ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureToken } from "../production/CosmicSignatureToken.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
import { PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract BidderContract {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	// address public immutable creator;
	uint256 public lastTokenIdChecked = 0;
	uint256[] public myDonatedNfts;
	bool public blockDeposits = false;
	
	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
		// creator = msg.sender;
	}

	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}

	function doBidWithEth() external payable {
		uint256 price = cosmicSignatureGame.getNextEthBidPrice(int256(0));
		cosmicSignatureGame.bidWithEth{value: price}((-1), "contract bid");
	}

	function doBidWithEth2() external payable {
		cosmicSignatureGame.bidWithEth{value: msg.value}((-1), "contract bid");
	}

	function doBidWithEthRWalk(int256 nftId) external payable {
		uint256 price = cosmicSignatureGame.getEthPlusRandomWalkNftBidPrice(cosmicSignatureGame.getNextEthBidPrice(int256(0)));
		cosmicSignatureGame.bidWithEth{value: price}(nftId, "contract bid rwalk");
	}

	function doBidWithEthRWalk2(int256 nftId) external payable {
		RandomWalkNFT rwalk = cosmicSignatureGame.randomWalkNft();
		rwalk.setApprovalForAll(address(cosmicSignatureGame), true);
		rwalk.transferFrom(msg.sender, address(this), uint256(nftId));
		cosmicSignatureGame.bidWithEth{value: msg.value}(nftId, "contract bid rwalk");
	}

	function doBidWithEthAndDonateNft(IERC721 nftAddress_, uint256 nftId_) external payable {
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		// nftAddress_.setApprovalForAll(address(cosmicSignatureGame), true);
		nftAddress_.setApprovalForAll(address(prizesWallet_), true);
		// uint256 numDonatedNfts_ = cosmicSignatureGame.numDonatedNfts();
		uint256 numDonatedNfts_ = prizesWallet_.numDonatedNfts();
		myDonatedNfts.push(numDonatedNfts_);
		uint256 price = cosmicSignatureGame.getNextEthBidPrice(int256(0));
		cosmicSignatureGame.bidWithEthAndDonateNft{value: price}((-1), "contract bid with donation", nftAddress_, nftId_);
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
		uint256 bal_ = prizesWallet_.getEthBalanceInfo().amount;
		if (bal_ > 0) {
			prizesWallet_.withdrawEth();
		}
	
		CosmicSignatureNft nft_ = cosmicSignatureGame.nft();

		// Comment-202502043 applies.
		// (bool isSuccess_, ) = creator.call{value: address(this).balance}("");
		(bool isSuccess_, ) = msg.sender.call{value: address(this).balance}("");

		if ( ! isSuccess_ ) {
			// revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to creator failed.", creator, address(this).balance);
			revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to msg.sender failed.", msg.sender, address(this).balance);
		}
		uint256 totalSupply = nft_.totalSupply();
		for (uint256 i = lastTokenIdChecked; i < totalSupply; i++) {
			address tokenOwner = nft_.ownerOf(i);
			if (tokenOwner == address(this)) {
				// Comment-202501145 applies.
				// nft_.transferFrom(address(this), creator, i);
				nft_.transferFrom(address(this), msg.sender, i);
			}
		}
		if (totalSupply > 0) {
			lastTokenIdChecked = totalSupply - 1;
		}
		CosmicSignatureToken token_ = cosmicSignatureGame.token();
	
		// Issue. Making multiple external calls to `token_`.
		uint256 ctokenBalance = token_.balanceOf(address(this));
		if (ctokenBalance > 0) {
			// token_.transfer(creator, ctokenBalance);
			token_.transfer(msg.sender, ctokenBalance);
		}
	
		for (uint256 i = 0; i < myDonatedNfts.length; i++) {
			uint256 num = myDonatedNfts[i];
			//(IERC721 tokenAddr, uint256 nftId, , ) = cosmicSignatureGame.donatedNfts(num);
			( , IERC721 tokenAddr, uint256 nftId) = prizesWallet_.donatedNfts(num);
			// cosmicSignatureGame.claimDonatedNft(num);

			// Issue. Making multiple external calls to `prizesWallet_`.
			prizesWallet_.claimDonatedNft(num);

			// tokenAddr.transferFrom(address(this), creator, nftId);
			tokenAddr.transferFrom(address(this), msg.sender, nftId);
		}
		delete myDonatedNfts;
	}

	function doFailedBidWithEth() external payable {
		uint256 price = msg.value;
		blockDeposits = true;
		cosmicSignatureGame.bidWithEth{value: price}((-1), "contract bid");
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
	// address public immutable creator;

	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
		// creator = msg.sender;
	}

	receive() external payable {}

	function doBidWithEth() external payable {
		uint256 price = cosmicSignatureGame.getNextEthBidPrice(int256(0));
		cosmicSignatureGame.bidWithEth{value: price}((-1), "non-IERC721Receiver bid");
	}
	
	function doClaim() external {
		cosmicSignatureGame.claimMainPrize();
	}
}
