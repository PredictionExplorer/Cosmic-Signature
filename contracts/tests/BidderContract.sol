// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { CosmicGame } from "../CosmicGame.sol";
import { CosmicSignature } from "../CosmicSignature.sol";
import { CosmicToken } from "../CosmicToken.sol";
import { RaffleWallet } from "../RaffleWallet.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract BidderContract is IERC721Receiver {
    CosmicGame public cosmicGame;
	address public creator;
	uint256[] public collectedTokens;
	uint256 public numCollectedTokens;
	uint256[] public myDonatedNFTs;
	uint256 public numMyDonatedNFTs;
    constructor(address payable _cosmicGame) {
        cosmicGame= CosmicGame(_cosmicGame);
		creator = msg.sender;
    } 
	receive() external payable { }
	function doBid() external payable  {
		uint256 price = cosmicGame.getBidPrice();
		cosmicGame.bid{value:price}("contract bid");
	}
	function doBidAndDonate(address nftAddress,uint256 tokenId) external payable {
		IERC721(nftAddress).setApprovalForAll(address(cosmicGame),true);
		uint256 donatedTokenNum = cosmicGame.numDonatedNFTs();
		myDonatedNFTs.push(donatedTokenNum);
		numMyDonatedNFTs++;
		uint256 price = cosmicGame.getBidPrice();
		cosmicGame.bidAndDonateNFT{value:price}("contract bid with donation",IERC721(nftAddress),tokenId);
	}
    function doClaim() external {
        cosmicGame.claimPrize();
    }   
	function withdrawAll() external {
		RaffleWallet raffleWallet = cosmicGame.raffleWallet();
		uint bal = raffleWallet.balances(address(this));
		if (bal > 0) {
			raffleWallet.withdraw();
		}       
		CosmicSignature nft = cosmicGame.nft();
		(bool success,) = creator.call{value:address(this).balance}("");
		success = false;
		for (uint256 i = 0; i< numCollectedTokens; i++) {
			nft.safeTransferFrom(address(this),creator,collectedTokens[i]);
		}                                   
		delete collectedTokens;
		numCollectedTokens = 0;
		CosmicToken token = cosmicGame.token();
		uint ctokenBalance = token.balanceOf(address(this));
		if ( ctokenBalance > 0 ) {
			token.transfer(creator,ctokenBalance);
		}
		for (uint256 i = 0; i< numMyDonatedNFTs; i++) {
			uint256 num = myDonatedNFTs[i];
			cosmicGame.claimDonatedNFT(num);
			(IERC721  tokenAddr,uint256 tokenId,,) = cosmicGame.donatedNFTs(num);
		   
			tokenAddr.safeTransferFrom(address(this),creator,tokenId);
		}
		delete myDonatedNFTs;
		numMyDonatedNFTs = 0;
	}
    function onERC721Received(address operator, address , uint256 tokenId, bytes calldata) public returns(bytes4) {
		CosmicSignature nft = cosmicGame.nft();
		if (address(nft) == operator) { // only track CosmicSignature tokens
			collectedTokens.push(tokenId);
			numCollectedTokens++;
		}
        return this.onERC721Received.selector;
    }
}

