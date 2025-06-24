// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";
import { MaliciousActorBase } from "./MaliciousActorBase.sol";

/// @notice This contract can be used where an ERC-20 or ERC-721 contract is needed.
contract MaliciousToken is MaliciousActorBase {
	constructor(PrizesWallet prizesWallet_, CosmicSignatureGame game_) MaliciousActorBase(prizesWallet_, game_) {
		// Doing nothing.
	}

	function transfer(address /*to_*/, uint256 /*value_*/) external {
		_reenterIfNeeded();
		// return true;
	}

	function transferFrom(address /*from_*/, address /*to_*/, uint256 /*value_*/) external {
		_reenterIfNeeded();
		// return true;
	}
}
