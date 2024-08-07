// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Governor, IGovernor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { GovernorCountingSimple } from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import { GovernorVotes, IVotes } from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import { GovernorVotesQuorumFraction } from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";

/// @title CosmicDAO - Governance contract for the Cosmic ecosystem
/// @author Cosmic Game Development Team
/// @notice This contract implements the governance mechanism for the Cosmic ecosystem
/// @dev Extends various OpenZeppelin Governor modules to create a comprehensive DAO
contract CosmicDAO is Governor, GovernorSettings, GovernorCountingSimple, GovernorVotes, GovernorVotesQuorumFraction {
	/// @notice Initializes the CosmicDAO contract
	/// @dev Sets up the governance parameters and links the voting token
	/// @param _token The address of the token used for voting power
	constructor(
		IVotes _token
	)
		Governor("CosmicDAO")
		GovernorSettings(7200 /* 1 day */, 216000 /* 1 month */, 100e18)
		GovernorVotes(_token)
		GovernorVotesQuorumFraction(4)
	{}

	// The following functions are overrides required by Solidity.

	/// @notice Retrieves the voting delay
	/// @dev Overrides the Governor and GovernorSettings implementations
	/// @return The number of blocks between proposal creation and the start of voting
	function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
		return super.votingDelay();
	}

	/// @notice Retrieves the voting period
	/// @dev Overrides the Governor and GovernorSettings implementations
	/// @return The duration of voting on a proposal, in blocks
	function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
		return super.votingPeriod();
	}

	/// @notice Calculates the quorum for a specific block number
	/// @dev Overrides the Governor and GovernorVotesQuorumFraction implementations
	/// @param blockNumber The block number to check the quorum at
	/// @return The number of votes required for a quorum
	function quorum(
		uint256 blockNumber
	) public view override(IGovernor, GovernorVotesQuorumFraction) returns (uint256) {
		return super.quorum(blockNumber);
	}

	/// @notice Retrieves the proposal threshold
	/// @dev Overrides the Governor and GovernorSettings implementations
	/// @return The minimum number of votes an account must have to create a proposal
	function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
		return super.proposalThreshold();
	}
}
