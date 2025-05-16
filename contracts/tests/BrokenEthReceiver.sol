// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

contract BrokenEthReceiver {
	/// @notice 0, 1, 2.
	uint256 internal _ethDepositAcceptanceModeCode = 0;

	constructor() {
		// Doing nothing.
	}

	receive() external payable {
		_checkIfEthDepositsAreAccepted();
	}

	function setEthDepositAcceptanceModeCode(uint256 newValue_) external {
		_ethDepositAcceptanceModeCode = newValue_;
	}

	function _checkIfEthDepositsAreAccepted() internal view {
		if (_ethDepositAcceptanceModeCode == 1) {
			revert("I am not accepting deposits.");
		} else {
			assert(_ethDepositAcceptanceModeCode == 0);
		}
	}
}
