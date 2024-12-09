// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { Governor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { GovernorCountingSimple } from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import { IVotes, GovernorVotes } from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import { GovernorVotesQuorumFraction } from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { ICosmicSignatureDao } from "./interfaces/ICosmicSignatureDao.sol";

contract CosmicSignatureDao is
	Governor,
	GovernorSettings,
	GovernorCountingSimple,
	GovernorVotes,
	GovernorVotesQuorumFraction,
	ICosmicSignatureDao {
	/// @notice Constructor.
	/// @notice Sets up the governance parameters and links the voting token.
	/// @param tokenAddress_ The address of the token to be used for voting power.
	constructor(
		IVotes tokenAddress_
	)
		Governor("CosmicSignatureDao")
		// todo-0 By default, Governor` `votingDelay` and `votingPeriod` are expessed in the number of blocks.
		// todo-0 I changed those to be expressed in seconds.
		// todo-0 OpenZellepin docs says:
		// todo-0    The internal clock used by the token to store voting balances will dictate the operating mode
		// todo-0    of the Governor contract attached to it. By default, block numbers are used. Since v4.9,
		// todo-0    developers can override the IERC6372 clock to use timestamps instead of block numbers.
		// todo-0 Tell the guys.
		//
		// todo-0 OpenZellepin recommends to set voting period to 1 week. In our code, it was set to 30 days,
		// todo-0 which seems to be unnecessarily long. So I have reduced it to 2 weeks. Tell the guys.
		// todo-1 There are setters for these settings. Develop tests that change them. Unnecesary?
		// todo-1 Write comments near these constants in `CosmicSignatureConstants`.
		GovernorSettings(
			CosmicSignatureConstants.GOVERNOR_DEFAULT_VOTING_DELAY,
			CosmicSignatureConstants.GOVERNOR_DEFAULT_VOTING_PERIOD,
			CosmicSignatureConstants.DEFAULT_TOKEN_REWARD
		)
		GovernorVotes(tokenAddress_)
		// todo-0 I changed this from the recommended 4% to 2% -- to increase the chance that there will be a sufficient quorum.
		// todo-0 Another reason is because the marketing wallet can hold a lot of tokens, and it's not going to vote.
		// todo-0 Tell the guys.
		// todo-1 There are setters for these settings. Develop tests that change them. Unnecesary?
		// todo-1 Write comments near these constants in `CosmicSignatureConstants`.
		GovernorVotesQuorumFraction(CosmicSignatureConstants.GOVERNOR_DEFAULT_VOTES_QUORUM_PERCENTAGE) {
	}

	// The following functions are overrides required by Solidity.

	// todo-1 Test what these return: votingDelay, votingPeriod, proposalThreshold, quorum. Done in part.
	function proposalThreshold() public view override(Governor, GovernorSettings) returns(uint256) {
		return super.proposalThreshold();
	}
}
