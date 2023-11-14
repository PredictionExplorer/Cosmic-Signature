// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { CosmicGame } from "../CosmicGame.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ReClaim {
    CosmicGame public cosmicGameContract;
    uint public numIterations = 0;
    constructor(address payable _cosmicGameContract) {
        cosmicGameContract = CosmicGame(_cosmicGameContract);
    }   
    receive() external payable {
		if (numIterations == 0) {
			return;
		}
        numIterations--;
        cosmicGameContract.claimPrize();
    }   
    function claimAndReset(uint256 pNumIterations) public {
        numIterations = pNumIterations;
        cosmicGameContract.claimPrize();
    }   
}

