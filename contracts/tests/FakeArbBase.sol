// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

abstract contract FakeArbBase {
	uint256 public modeCode = 0;

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}
}
