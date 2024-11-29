// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
// import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract ReClaim {
	CosmicSignatureGame public cosmicSignatureGame;
	uint public numIterations = 0;
	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
	}
	receive() external payable {
		if (numIterations == 0) {
			return;
		}
		numIterations--;
		cosmicSignatureGame.claimPrize();
	}
	function claimAndReset(uint256 pNumIterations) public {
		numIterations = pNumIterations;
		cosmicSignatureGame.claimPrize();
	}
}
