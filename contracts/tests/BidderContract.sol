// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
pragma abicoder v2;

import { CosmicGame } from "../production/CosmicGame.sol";
import { CosmicSignature } from "../production/CosmicSignature.sol";
import { CosmicToken } from "../production/CosmicToken.sol";
import { RaffleWallet } from "../production/RaffleWallet.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract BidderContract is IERC721Receiver {
	CosmicGame public cosmicGame;
	address public creator;
	uint256 public lastTokenIdChecked = 0;
	uint256[] public myDonatedNFTs;
	uint256 public numMyDonatedNFTs;
	bool blockDeposits = false;
	constructor(address payable _cosmicGame) {
		cosmicGame = CosmicGame(_cosmicGame);
		creator = msg.sender;
	}
	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}
	function doBid() external payable {
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicGame.bid{ value: price }(param_data);
	}
	function doBid2() external payable {
		CosmicGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicGame.bid{ value: msg.value }(param_data);
	}
	function doBidRWalk(int256 tokenId) external payable {
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNFTId = tokenId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bid{ value: price }(param_data);
	}
	function doBidRWalk2(int256 tokenId) external payable {
		RandomWalkNFT rwalk = RandomWalkNFT(cosmicGame.randomWalk());
		rwalk.setApprovalForAll(address(cosmicGame), true);
		rwalk.transferFrom(msg.sender, address(this), uint256(tokenId));
		CosmicGame.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNFTId = tokenId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bid{ value: msg.value }(param_data);
	}
	function doBidAndDonate(address nftAddress, uint256 tokenId) external payable {
		IERC721(nftAddress).setApprovalForAll(address(cosmicGame), true);
		uint256 donatedTokenNum = cosmicGame.numDonatedNFTs();
		myDonatedNFTs.push(donatedTokenNum);
		numMyDonatedNFTs++;
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory params;
		params.message = "contract bid with donation";
		params.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bidAndDonateNFT{ value: price }(param_data, IERC721(nftAddress), tokenId);
	}
	function doClaim() external {
		cosmicGame.claimPrize();
	}
	function withdrawAll() external {
		RaffleWallet raffleWallet = RaffleWallet(cosmicGame.raffleWallet());
		uint bal = raffleWallet.balances(address(this));
		if (bal > 0) {
			raffleWallet.withdraw();
		}
		CosmicSignature nft = CosmicSignature(cosmicGame.nft());
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
		CosmicToken token = cosmicGame.token();
		uint ctokenBalance = token.balanceOf(address(this));
		if (ctokenBalance > 0) {
			token.transfer(creator, ctokenBalance);
		}
		for (uint256 i = 0; i < numMyDonatedNFTs; i++) {
			uint256 num = myDonatedNFTs[i];
			cosmicGame.claimDonatedNFT(num);
			(IERC721 tokenAddr, uint256 tokenId, , ) = cosmicGame.donatedNFTs(num);

			tokenAddr.safeTransferFrom(address(this), creator, tokenId);
		}
		delete myDonatedNFTs;
		numMyDonatedNFTs = 0;
	}
	function doFailedBid() external payable {
		uint256 price = msg.value;
		CosmicGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		blockDeposits = true;
		cosmicGame.bid{ value: price }(param_data);
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
	CosmicGame public cosmicGame;
	address public creator;
	constructor(address payable _cosmicGame) {
		cosmicGame= CosmicGame(_cosmicGame);
		creator = msg.sender;
	}
	receive() external payable {}
	function doBid() external payable {
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory params;
		params.message = "non-erc721 receiver bid";
		params.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bid{ value: price }(param_data);
	}
	function doClaim() external {
		cosmicGame.claimPrize();
	}
}
