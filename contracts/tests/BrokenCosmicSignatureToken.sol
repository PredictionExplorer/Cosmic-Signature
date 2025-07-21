// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { ICosmicSignatureToken } from "../production/interfaces/ICosmicSignatureToken.sol";

contract BrokenCosmicSignatureToken {
	uint256 private _counter;

	constructor(uint256 counter_) {
		_counter = counter_;
	}

	function setCounter(uint256 newValue_) external {
		_counter = newValue_;
	}

	function mint(address, uint256) external {
		_brokenMint();
	}

	function mintMany(ICosmicSignatureToken.MintSpec[] calldata specs_) external {
		if (specs_.length > 0) {
			_brokenMint();
		}
	}

	function mintAndBurnMany(ICosmicSignatureToken.MintOrBurnSpec[] calldata specs_) external {
		for ( uint256 index_ = 0; index_ < specs_.length; ++ index_ ) {
			ICosmicSignatureToken.MintOrBurnSpec calldata specReference_ = specs_[index_];
			int256 value_ = specReference_.value;
			if (value_ >= int256(0)) {
				_brokenMint();
				break;
			}
		}
	}

	function _brokenMint() private {
		require(_counter > 0, "Test mint failed.");
		-- _counter;
	}

	function burn(address, uint256) external {
		// Doing nothing.
	}
}
