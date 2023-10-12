// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { CosmicGame } from "../CosmicGame.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract BidderContract is IERC721Receiver {
    CosmicGame public cosmicGameContract;
    constructor(address payable _cosmicGameContract) {
        cosmicGameContract = CosmicGame(_cosmicGameContract);
    } 
	function do_bid() payable external {
		uint256 price = cosmicGameContract.getBidPrice();
		cosmicGameContract.bid{value:price}("contract bid");
	}
    function do_claim() external {
        cosmicGameContract.claimPrize();
    }   
    function onERC721Received(address, address, uint256, bytes calldata) public pure returns(bytes4) {
        return this.onERC721Received.selector;
    }
	receive() external payable { }
}

