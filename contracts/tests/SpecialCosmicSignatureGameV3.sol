// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { CosmicSignatureGameV3 } from "../production/CosmicSignatureGameV3.sol";

/// @notice A test-only V3 Game implementation that disables the same-second bid throttle.
/// Comment-202608265 applies: tests upgrade the proxy to this contract to prove that
/// the weighted bidder raffle (Comment-202608261) keeps working unchanged with multiple bids
/// placed within a single second. It declares no storage and changes nothing else.
/// @custom:oz-upgrades-unsafe-allow missing-initializer state-variable-immutable
contract SpecialCosmicSignatureGameV3 is CosmicSignatureGameV3 {
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor(address viewsModuleAddress_, address prizesModuleAddress_)
		CosmicSignatureGameV3(viewsModuleAddress_, prizesModuleAddress_) {
		// Doing nothing.
	}

	/// @notice Comment-202608265 applies.
	function _checkIfNoBidPlacedWithinCurrentSecond() internal view override {
		// Doing nothing.
	}
}
