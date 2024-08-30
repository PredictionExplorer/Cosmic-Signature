// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { CosmicGame } from "../production/CosmicGame.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ReClaim {
	CosmicGame public cosmicGame;
	uint public numIterations = 0;
	constructor(address payable _cosmicGame) {
		cosmicGame = CosmicGame(_cosmicGame);
	}
	receive() external payable {
		if (numIterations == 0) {
			return;
		}
		numIterations--;
		cosmicGame.claimPrize();
	}
	function claimAndReset(uint256 pNumIterations) public {
		numIterations = pNumIterations;
		cosmicGame.claimPrize();
	}
}
