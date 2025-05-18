// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract MaliciousBidder {
	CosmicSignatureGame public immutable cosmicSignatureGame;

	/// @notice
	/// Possible values:
	///    1: Reenter `bidWithEth`.
	///    2: Reenter `bidWithCst`.
	///    3: Reenter `claimMainPrize`.
	///    Any other: don't reener.
	uint256 public modeCode = 0;

	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
	}

	receive() external payable {
		uint256 modeCodeCopy_ = modeCode;
		modeCode = 0;
		if (modeCodeCopy_ == 1) {
			doBidWithEth();
		} if (modeCodeCopy_ == 2) {
			doBidWithCst(1);
		} if (modeCodeCopy_ == 3) {
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
