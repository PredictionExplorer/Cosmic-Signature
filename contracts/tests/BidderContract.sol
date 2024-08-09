// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
pragma abicoder v2;

// todo-1 Commented out to suppress a compile error.
/*

import { CosmicGameProxy } from "../CosmicGameProxy.sol";
import { CosmicSignature } from "../CosmicSignature.sol";
import { CosmicToken } from "../CosmicToken.sol";
import { CosmicGameImplementation } from "../CosmicGameImplementation.sol";
import { RaffleWallet } from "../RaffleWallet.sol";
import { RandomWalkNFT } from "../RandomWalkNFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract BidderContract is IERC721Receiver {
	CosmicGameProxy public cosmicGameProxy;
	address public creator;
	uint256 public lastTokenIdChecked = 0;
	uint256[] public myDonatedNFTs;
	uint256 public numMyDonatedNFTs;
	bool blockDeposits = false;
	constructor(address payable _cosmicGameProxy) {
		cosmicGameProxy = CosmicGameProxy(_cosmicGameProxy);
		creator = msg.sender;
	}
	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}
	function doBid() external payable {
		uint256 price = cosmicGameProxy.getBidPrice();
		CosmicGameImplementation.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicGameProxy.bid{ value: price }(param_data);
	}
	function doBid2() external payable {
		CosmicGameImplementation.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicGameProxy.bid{ value: msg.value }(param_data);
	}
	function doBidRWalk(int256 tokenId) external payable {
		uint256 price = cosmicGameProxy.getBidPrice();
		CosmicGameImplementation.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNFTId = tokenId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGameProxy.bid{ value: price }(param_data);
	}
	function doBidRWalk2(int256 tokenId) external payable {
		RandomWalkNFT rwalk = cosmicGameProxy.randomWalk();
		rwalk.setApprovalForAll(address(cosmicGameProxy), true);
		rwalk.transferFrom(msg.sender, address(this), uint256(tokenId));
		CosmicGameImplementation.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNFTId = tokenId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGameProxy.bid{ value: msg.value }(param_data);
	}
	function doBidAndDonate(address nftAddress, uint256 tokenId) external payable {
		IERC721(nftAddress).setApprovalForAll(address(cosmicGameProxy), true);
		uint256 donatedTokenNum = cosmicGameProxy.numDonatedNFTs();
		myDonatedNFTs.push(donatedTokenNum);
		numMyDonatedNFTs++;
		uint256 price = cosmicGameProxy.getBidPrice();
		CosmicGameImplementation.BidParams memory params;
		params.message = "contract bid with donation";
		params.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGameProxy.bidAndDonateNFT{ value: price }(param_data, IERC721(nftAddress), tokenId);
	}
	function doClaim() external {
		cosmicGameProxy.claimPrize();
	}
	function withdrawAll() external {
		RaffleWallet raffleWallet = cosmicGameProxy.raffleWallet();
		uint bal = raffleWallet.balances(address(this));
		if (bal > 0) {
			raffleWallet.withdraw();
		}
		CosmicSignature nft = cosmicGameProxy.nft();
		(bool success, ) = creator.call{ value: address(this).balance }("");
		success = false;
		uint256 totalSupply = nft.totalSupply();
		for (uint256 i = lastTokenIdChecked; i < totalSupply; i++) {
			address tokenOwner = nft.ownerOf(i);
			if (tokenOwner == address(this)) {
				nft.safeTransferFrom(address(this), creator, i);
			}
		}
		if (totalSupply > 0) {
			lastTokenIdChecked = totalSupply - 1;
		}
		CosmicToken token = cosmicGameProxy.token();
		uint ctokenBalance = token.balanceOf(address(this));
		if (ctokenBalance > 0) {
			token.transfer(creator, ctokenBalance);
		}
		for (uint256 i = 0; i < numMyDonatedNFTs; i++) {
			uint256 num = myDonatedNFTs[i];
			cosmicGameProxy.claimDonatedNFT(num);
			(IERC721 tokenAddr, uint256 tokenId, , ) = cosmicGameProxy.donatedNFTs(num);

			tokenAddr.safeTransferFrom(address(this), creator, tokenId);
		}
		delete myDonatedNFTs;
		numMyDonatedNFTs = 0;
	}
	function doFailedBid() external payable {
		uint256 price = msg.value;
		CosmicGameImplementation.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		blockDeposits = true;
		cosmicGameProxy.bid{ value: price }(param_data);
		blockDeposits = false;
	}
	function startBlockingDeposits() external {
		blockDeposits = true;
	}
	function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
		return this.onERC721Received.selector;
	}
}
contract BidCNonRecv {
	// Bidder Contract but not ERC721 receiver
	CosmicGameProxy public cosmicGameProxy;
	address public creator;
	constructor(address payable _cosmicGameProxy) {
		cosmicGameProxy = CosmicGameProxy(_cosmicGameProxy);
		creator = msg.sender;
	}
	receive() external payable {}
	function doBid() external payable {
		uint256 price = cosmicGameProxy.getBidPrice();
		CosmicGameImplementation.BidParams memory params;
		params.message = "non-erc721 receiver bid";
		params.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGameProxy.bid{ value: price }(param_data);
	}
	function doClaim() external {
		cosmicGameProxy.claimPrize();
	}
}

*/
