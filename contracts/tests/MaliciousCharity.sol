// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";
import { CharityWallet } from "../production/CharityWallet.sol";

contract MaliciousCharity {
	CharityWallet public immutable charityWallet;
	uint256 public modeCode = 0;
	uint256 public transient reentryDepth;

	constructor(CharityWallet charityWallet_) {
		charityWallet = charityWallet_;
	}

	receive() external payable {
		_reenterIfNeeded();
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function _reenterIfNeeded() internal {
		if (reentryDepth <= 0) {
			++ reentryDepth;

			// [Comment-202507129]
			// todo-0 This comment is not referenced anywhere yet.
			// Similar magic numbers are hardcoded in multiple places.
			// [/Comment-202507131]
			if (modeCode == 1) {
				CosmicSignatureHelpers.transferEthTo(payable(address(charityWallet)), msg.value);
			} else if (modeCode == 2) {
				charityWallet.send();
			} else if (modeCode == 3) {
				charityWallet.send(0);
			}

			-- reentryDepth;
		}
	}
}
