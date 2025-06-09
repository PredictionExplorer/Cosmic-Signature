// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

/// @notice
/// [Comment-202506236]
/// Multiple similar contracts exist.
/// Comment-202506234 relates.
/// [/Comment-202506236]
contract MaliciousToken is ERC20 {
	CosmicSignatureGame private immutable _game;

	/// @notice
	/// Possible values:
	///    1: reenter `_game.bidWithEthAndDonateToken`.
	///    2: reenter `_game.bidWithCstAndDonateToken`.
	///    any other: do none of the above.
	uint256 public modeCode = 0;

	uint256 private transient _counter;

	constructor(CosmicSignatureGame game_) ERC20("MaliciousToken", "MT") {
		_game = game_;
	}

	receive() external payable {
		// Doing nothing.	
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function transfer(address /*to_*/, uint256 value_) public override returns (bool) {
		return _transfer(value_);
	}

	function transferFrom(address /*from_*/, address /*to_*/, uint256 value_) public override returns (bool) {
		return _transfer(value_);
	}

	function _transfer(uint256 value_) private returns (bool) {
		if (_counter < 3 - 1) {
			++ _counter;
			if (modeCode == 1) {
				_game.bidWithEthAndDonateToken{value: 0.01 ether}(-1, "", this, value_);
			} else if (modeCode == 2) {
				_game.bidWithCstAndDonateToken(10000 ether, "", this, value_);
			}
			-- _counter;
		}
		return true;
	}
}
