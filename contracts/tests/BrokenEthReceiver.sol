// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";

contract BrokenEthReceiver {
	/// @notice 1, 2, or any other value.
	uint256 public ethDepositAcceptanceModeCode = 0;

	constructor() {
		// Doing nothing.
	}

	receive() external payable {
		_checkIfEthDepositsAreAccepted();
	}

	function setEthDepositAcceptanceModeCode(uint256 newValue_) external {
		ethDepositAcceptanceModeCode = newValue_;
	}

	function surrenderMyEth() public {
		CosmicSignatureHelpers.transferEthTo(payable(msg.sender), address(this).balance);
	}

	function _checkIfEthDepositsAreAccepted() internal view {
		if (ethDepositAcceptanceModeCode == 1) {
			revert ("I am not accepting deposits.");
		} else {
			assert(ethDepositAcceptanceModeCode != 2);
		}
	}
}
