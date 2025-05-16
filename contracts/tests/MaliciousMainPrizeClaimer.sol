// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract MaliciousMainPrizeClaimer {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	uint256 public numIterations = 0;

	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
	}

	receive() external payable {
		if (numIterations == 0) {
			return;
		}
		-- numIterations;
		cosmicSignatureGame.claimMainPrize();
	}

	function doBidWithEth() external payable {
		cosmicSignatureGame.bidWithEth{value: msg.value}(-1, "");
	}

	function resetAndClaimMainPrize(uint256 numIterations_) public {
		numIterations = numIterations_;
		cosmicSignatureGame.claimMainPrize();
	}
}
