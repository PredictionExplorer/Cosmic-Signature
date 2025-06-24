// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract MaliciousBidder {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	uint256 public modeCode = 0;

	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
	}

	receive() external payable {
		uint256 modeCodeCopy_ = modeCode;
		modeCode = 0;

		// [Comment-202507059]
		// This is not an exhaustive list of all non-reentrant methods.
		// But we have another test near Comment-202507057 that attempts to reenter all of them.
		// [/Comment-202507059]
		if (modeCodeCopy_ == 1) {
			doBidWithEth();
		} else if (modeCodeCopy_ == 2) {
			doBidWithCst(1);
		} else if (modeCodeCopy_ == 3) {
			doClaimMainPrize();
		}
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function doBidWithEth() public payable {
		cosmicSignatureGame.bidWithEth{value: msg.value}(-1, "");
	}

	function doBidWithCst(uint256 priceMaxLimit_) public {
		cosmicSignatureGame.bidWithCst(priceMaxLimit_, "");
	}

	function doClaimMainPrize() public {
		cosmicSignatureGame.claimMainPrize();
	}
}
