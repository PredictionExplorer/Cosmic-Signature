// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

/// @notice Read-only market/source identities. There is deliberately no funding callback.
contract ChaosZeroBindingTestDouble {
	address public immutable game;
	address public immutable cst;
	address public immutable source;

	constructor(address game_, address cst_, address source_) {
		game = game_;
		cst = cst_;
		source = source_;
	}
}
