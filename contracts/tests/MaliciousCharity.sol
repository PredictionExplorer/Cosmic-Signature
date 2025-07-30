// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

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
