// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { ICosmicSignatureGame } from "./ICosmicSignatureGame.sol";
import { IBiddingV2 } from "./IBiddingV2.sol";

/// @title The Cosmic Signature Game V2.
/// @notice Adds sqrt time-based CST bid rewards.
interface ICosmicSignatureGameV2 is IBiddingV2, ICosmicSignatureGame {
	/// @notice Emitted when the proxy is upgraded to this implementation.
	event ContractUpgradedToV2();

	/// @notice Initializes V2-specific behavior after the UUPS upgrade.
	function initialize2() external;
}
