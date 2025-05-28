// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract MaliciousNft is ERC721 {
	CosmicSignatureGame private immutable _game;

	/// 1: reenter `_game.bidWithEthAndDonateNft`.
	/// 2: reenter `_game.bidWithCstAndDonateNft`.
	uint256 public modeCode = 0;

	uint256 private transient _counter;

	constructor(CosmicSignatureGame game_) ERC721("MaliciousNft", "MN2") {
		_game = game_;
	}

	receive() external payable {
		// Doing nothing.	
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function transferFrom(address /*from_*/, address /*to_*/, uint256 nftId_) public override {
		if (_counter < 3 - 1) {
			++ _counter;

			if (modeCode == 1) {
				_game.bidWithEthAndDonateNft{value: 0.01 ether}(-1, "", this, nftId_ + 1);
			} else if (modeCode == 2) {
				_game.bidWithCstAndDonateNft(10000 ether, "", this, nftId_ + 1);
			}

			-- _counter;
		}
	}
}
