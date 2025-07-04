// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";
import { IAddressValidator } from "./IAddressValidator.sol";

/// @title Governance Interface for the Cosmic Signature Ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the governance mechanism for the Cosmic Signature ecosystem.
/// It extends various OpenZeppelin Governor modules to create a comprehensive DAO.
/// @dev It appears that we don't need `GovernorTimelockControl`.
interface ICosmicSignatureDao is IGovernor, IAddressValidator {
	// Empty.
}
