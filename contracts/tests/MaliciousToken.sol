// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";
import { MaliciousActorBase } from "./MaliciousActorBase.sol";

/// @notice This contract can be used where an ERC-20 or ERC-721 contract is needed.
contract MaliciousToken is MaliciousActorBase {
	// mapping(address => uint256 balanceAmount) public balanceAmounts; 

	constructor(PrizesWallet prizesWallet_, CosmicSignatureGame game_) MaliciousActorBase(prizesWallet_, game_) {
		// Doing nothing.
	}

	// function balanceOf(address /*account_*/) external /*view*/ pure returns (uint256) {
	// 	// revert ("Not implemented.");
	// 	return balanceAmounts[account_];
	// }

	function approve(address /*spender_*/, uint256 /*value_*/) public /*returns (bool)*/ {
		// _reenterIfNeeded();
		// return true;
	}

	function transfer(address to_, uint256 value_) external /*returns (bool)*/ {
		transferFrom(msg.sender, to_, value_);
		// return true;
	}

	/// @notice
	/// [Comment-202507177]
	/// This won't revert if `from_` is zero.
	/// Comment-202507151 relates.
	/// [/Comment-202507177]
	function transferFrom(address /*from_*/, address /*to_*/, uint256 /*value_*/) public /*returns (bool)*/ {
		_reenterIfNeeded();
		// unchecked {
		// 	balanceAmounts[from_] -= value_;
		// 	balanceAmounts[to_] += value_;
		// }
		// return true;
	}
}
