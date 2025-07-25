// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// #endregion
// #region

import { IERC6372 } from "@openzeppelin/contracts/interfaces/IERC6372.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { IGovernor, Governor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { GovernorCountingSimple } from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import { GovernorVotes } from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import { GovernorVotesQuorumFraction } from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureDao } from "./interfaces/ICosmicSignatureDao.sol";

// #endregion
// #region

/// @dev todo-1 +++ Compare this code to what we had before I joined the project. Done on Feb 24 2025.
contract CosmicSignatureDao is
	Governor,
	GovernorSettings,
	GovernorCountingSimple,
	GovernorVotes,
	GovernorVotesQuorumFraction,
	AddressValidator,
	ICosmicSignatureDao {
	// #region `constructor`

	/// @notice Constructor.
	/// Sets up the governance parameters and links the voting token.
	/// @param tokenAddress_ The address of the token to be used for voting power.
	/// [Comment-202508031]
	/// Our contract deployment script passes the `CosmicSignatureToken` contract address for this parameter.
	/// [/Comment-202508031]
	constructor(IVotes tokenAddress_)
		// Comment-202502249 relates and/or applies.
		_providedAddressIsNonZero(address(tokenAddress_))

		Governor("CosmicSignatureDao")

		// [Comment-202501123]
		// By default, `Governor`'s `votingDelay()` and `votingPeriod()` are expessed in the number of blocks.
		// I changed those to be expressed in seconds.
		// OpenZellepin docs says:
		//    The internal clock used by the token to store voting balances will dictate the operating mode
		//    of the Governor contract attached to it. By default, block numbers are used. Since v4.9,
		//    developers can override the IERC6372 clock to use timestamps instead of block numbers.
		// [/Comment-202501123]
		GovernorSettings(
			CosmicSignatureConstants.DAO_DEFAULT_VOTING_DELAY,
			CosmicSignatureConstants.DAO_DEFAULT_VOTING_PERIOD,
			CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING
		)

		// [Comment-202502249]
		// Issue. Surprisingly, this doesn't validate that the provided address is a nonzero.
		// So we have to do it.
		// [/Comment-202502249]
		GovernorVotes(tokenAddress_)

		GovernorVotesQuorumFraction(CosmicSignatureConstants.DAO_DEFAULT_VOTES_QUORUM_PERCENTAGE) {
		// Doing nothing.
	}

	// #endregion
	// #region Overrides Required By Solidity

	function votingDelay() public view override (IGovernor, Governor, GovernorSettings) returns (uint256) {
		return super.votingDelay();
	}

	function votingPeriod() public view override (IGovernor, Governor, GovernorSettings) returns (uint256) {
		return super.votingPeriod();
	}

	function proposalThreshold() public view override (IGovernor, Governor, GovernorSettings) returns (uint256) {
		return super.proposalThreshold();
	}

	function quorum(uint256 timepoint_) public view override (IGovernor, Governor, GovernorVotesQuorumFraction) returns (uint256) {
		return super.quorum(timepoint_);
	}

	function CLOCK_MODE() public view override (IERC6372, Governor, GovernorVotes) returns (string memory) {
		return super.CLOCK_MODE();
	}

	function clock() public view override (IERC6372, Governor, GovernorVotes) returns (uint48) {
		return super.clock();
	}

	// #endregion
}

// #endregion
