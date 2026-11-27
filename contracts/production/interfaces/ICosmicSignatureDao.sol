// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";
import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The Governance Interface for the Cosmic Signature Ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice This contract implements the governance mechanism for the Cosmic Signature ecosystem.
/// It extends various OpenZeppelin Governor modules to create a comprehensive DAO.
/// @dev Comment-202511039 applies.
/// It appears that we don't need to inherit `GovernorTimelockControl`.
/// todo-2 If we are to redeploy this contract, consider not deriving this interface from some others, at least from `IAddressValidator`.
interface ICosmicSignatureDao is IGovernor, IAddressValidator {
	// Empty.
}
