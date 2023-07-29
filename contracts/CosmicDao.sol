// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.21;

import { Governor,IGovernor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { GovernorCountingSimple } from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import { GovernorVotes,IVotes } from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import { GovernorVotesQuorumFraction } from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";

contract CosmicDAO is Governor, GovernorSettings, GovernorCountingSimple, GovernorVotes, GovernorVotesQuorumFraction {
    constructor(IVotes _token)
        Governor("CosmicDAO")
        GovernorSettings(7200 /* 1 day */, 216000 /* 1 month */, 100e18)
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4)
    {}

    // The following functions are overrides required by Solidity.

    function votingDelay()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }
}
