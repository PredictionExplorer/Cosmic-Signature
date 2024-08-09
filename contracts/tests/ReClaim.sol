// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// todo-1 Commented out to suppress a compile error.
/*

import { CosmicGameProxy } from "../CosmicGameProxy.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ReClaim {
	CosmicGameProxy public cosmicGameProxyContract;
	uint public numIterations = 0;
	constructor(address payable _cosmicGameProxyContract) {
		cosmicGameProxyContract = CosmicGameProxy(_cosmicGameProxyContract);
	}
	receive() external payable {
		if (numIterations == 0) {
			return;
		}
		numIterations--;
		cosmicGameProxyContract.claimPrize();
	}
	function claimAndReset(uint256 pNumIterations) public {
		numIterations = pNumIterations;
		cosmicGameProxyContract.claimPrize();
	}
}

*/
