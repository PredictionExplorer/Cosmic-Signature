// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract MaliciousBidder {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	uint256 public modeCode = 0;
	uint256 public transient reentryDepth;

	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
	}

	receive() external payable {
		_reenterIfNeeded();
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function doBidWithEth(int256 randomWalkNftId_, string memory message_) external payable {
		_doBidWithEth(randomWalkNftId_, message_);
	}

	function _doBidWithEth(int256 randomWalkNftId_, string memory message_) private {
		cosmicSignatureGame.bidWithEth{value: msg.value}(randomWalkNftId_, message_);
	}

	function doBidWithCst(uint256 priceMaxLimit_, string memory message_) public {
		cosmicSignatureGame.bidWithCst(priceMaxLimit_, message_);
	}

	function doClaimMainPrize() public {
		cosmicSignatureGame.claimMainPrize();
	}

	function _reenterIfNeeded() internal {
		if (reentryDepth <= 0) {
			++ reentryDepth;

			// [Comment-202507059]
			// This is not an exhaustive list of all non-reentrant methods.
			// But we have another test near Comment-202507057 that attempts to reenter all of them.
			// [/Comment-202507059]
			if (modeCode == 1) {
				_doBidWithEth(-1, "");
			} else if (modeCode == 2) {
				doBidWithCst(1, "");
			} else if (modeCode == 3) {
				doClaimMainPrize();
			}

			-- reentryDepth;
		}
	}
}
