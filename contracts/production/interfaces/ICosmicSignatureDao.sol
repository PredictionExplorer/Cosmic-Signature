// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";
import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The Governance Interface for the Cosmic Signature Ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice This contract implements the governance mechanism for the Cosmic Signature ecosystem.
/// It extends various OpenZeppelin Governor modules to create a comprehensive DAO.
/// @dev Comment-202511039 applies.
/// It appears that we don't need to inherit `GovernorTimelockControl`.
interface ICosmicSignatureDao is IGovernor, IAddressValidator {
	// Empty.
}
