// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal mintable ERC-20 for Hardhat fuzz tests (`FuzzTest.js`). Not used in production.
contract FuzzTestMockErc20 is ERC20 {
	constructor() ERC20("FuzzTest ERC20", "FZ20") {
		// Doing nothing.
	}

	/// @notice Mints tokens to any address (test-only).
	function mint(address to_, uint256 amount_) external {
		_mint(to_, amount_);
	}
}
