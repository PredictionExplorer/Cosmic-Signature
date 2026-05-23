// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";
import { CosmicSignatureGameV2 } from "../production/CosmicSignatureGameV2.sol";

/// @notice Comment-202606031 applies.
/// Comment-202508065 applies.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract SelfDestructibleCosmicSignatureGameV2 is CosmicSignatureGameV2 {
	/// @notice Comment-202508065 applies.
	/// // @custom:oz-upgrades-unsafe-allow selfdestruct
	function finalizeTesting() external onlyOwner {
		// Comment-202606032 relates.

		// Comment-202509241 applies.
		CosmicSignatureHelpers.transferEthTo(payable(_msgSender()), address(this).balance);
	}
}
