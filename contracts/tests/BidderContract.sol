// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { CosmicGame } from "../CosmicGame.sol";
import { CosmicSignature } from "../CosmicSignature.sol";
import { CosmicToken } from "../CosmicToken.sol";
import { RaffleWallet } from "../RaffleWallet.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract BidderContract is IERC721Receiver {
    CosmicGame public cosmicGameContract;
	address public creator;
	uint256[] collectedTokens;
	uint256 numCollectedTokens;
    constructor(address payable _cosmicGameContract) {
        cosmicGameContract = CosmicGame(_cosmicGameContract);
		creator = msg.sender;
    } 
	function do_bid() payable external {
		uint256 price = cosmicGameContract.getBidPrice();
		cosmicGameContract.bid{value:price}("contract bid");
	}  
    function do_claim() external {
        cosmicGameContract.claimPrize();
    }   
	function withdraw_all() external {
		RaffleWallet raffleWallet = cosmicGameContract.raffleWallet();
		uint bal = raffleWallet.balances(address(this));
		if (bal > 0) {
			raffleWallet.withdraw();
		}       
		CosmicSignature nft = cosmicGameContract.nft();
		(bool success,) = creator.call{value:address(this).balance}("");
		success = false;
		for (uint256 i = 0; i< numCollectedTokens; i++) {
			nft.safeTransferFrom(address(this),creator,collectedTokens[i]);
		}                                   
		delete collectedTokens;
		numCollectedTokens = 0;
		CosmicToken token = cosmicGameContract.token();
		uint ctokenBalance = token.balanceOf(address(this));
		if ( ctokenBalance > 0 ) {
			token.transfer(creator,ctokenBalance);
		}
	}
	receive() external payable { }
    function onERC721Received(address, address, uint256 tokenId, bytes calldata) public returns(bytes4) {
		collectedTokens.push(tokenId);
		numCollectedTokens++;
        return this.onERC721Received.selector;
    }
}

