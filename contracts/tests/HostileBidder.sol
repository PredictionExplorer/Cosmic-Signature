// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { CryptographyHelpers } from "../production/libraries/CryptographyHelpers.sol";
import { CosmicSignatureGameV3 } from "../production/CosmicSignatureGameV3.sol";

/// @title A hostile bidder that tries to make itself impossible to pay the bid CST reward to.
/// @notice This contract attempts the attack discussed in Comment-202607163: it places a bid
/// and then behaves as hostile as possible towards any incoming call, attempting to make it impossible to pay
/// the bid CST reward to the last bidder. If that could succeed, nobody would be able to place further bids.
/// The attack cannot succeed because `CosmicSignatureToken` performs no call into the token recipient,
/// neither on a minting nor on a transfer.
contract HostileBidder {
	CosmicSignatureGameV3 public immutable game;

	/// @notice
	/// 1 = revert with a reason string;
	/// 2 = fail an assertion (panic);
	/// 3 = burn all remaining gas;
	/// 4 = reenter `game.bidWithEth`;
	/// any other value = accept incoming calls.
	uint256 public hostilityModeCode = 0;

	constructor(CosmicSignatureGameV3 game_) {
		game = game_;
	}

	receive() external payable {
		_takeHostileActionIfNeeded();
	}

	fallback() external payable {
		_takeHostileActionIfNeeded();
	}

	function setHostilityModeCode(uint256 newValue_) external {
		hostilityModeCode = newValue_;
	}

	function doBidWithEth(int256 randomWalkNftId_, string calldata message_, uint256 bidCstRewardAmountMinLimit_) external payable {
		game.bidWithEth{value: msg.value}(randomWalkNftId_, message_, bidCstRewardAmountMinLimit_);
	}

	function doBidWithCst(uint256 priceMaxLimit_, string calldata message_, uint256 bidCstRewardAmountMinLimit_) external {
		game.bidWithCst(priceMaxLimit_, message_, bidCstRewardAmountMinLimit_);
	}

	function _takeHostileActionIfNeeded() private {
		uint256 hostilityModeCode_ = hostilityModeCode;
		if (hostilityModeCode_ == 1) {
			revert ("HostileBidder rejects everything.");
		} else if (hostilityModeCode_ == 2) {
			assert(false);
		} else if (hostilityModeCode_ == 3) {
			// Burning all remaining gas.
			uint256 uselessValue_ = block.timestamp;
			for (;;) {
				uselessValue_ = CryptographyHelpers.calculateHashSumOf(uselessValue_);
			}
		} else if (hostilityModeCode_ == 4) {
			// This reentry attempt is expected to revert due to the reentrancy guard,
			// which would make the incoming ETH transfer that triggered it revert as well.
			game.bidWithEth(-1, "reentry", 0);
		}
	}
}
