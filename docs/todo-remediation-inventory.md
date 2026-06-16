# Deferred Work Inventory

This inventory is source-only. Generated `coverage/` HTML is excluded because it repeats comments from Solidity sources.

## Closed In The First Wave

- `test/src/fuzz/FuzzCampaign.js`: fixed seed-wrapper handling by using one monotonic seed wrapper across profile derivation, campaign execution, extra campaigns, and failure reproduction logging.
- `test/tests-src/FuzzTest.js`: replaced the speculative wraparound question with an explicit allowlist.
- `test/tests-src/CosmicSignatureGameV2-MainPrizeClaimDelayOverflow.js`: replaced the environment-only branch with assertions based on the helper return value.
- `docs/cosmic-signature-contracts-audit-considerations.md`: documented that V1 and V2 are covered by the unified fuzz campaign.
- `contracts/production/Bidding.sol`, `contracts/production/BiddingV2.sol`, `contracts/production/CosmicSignatureToken.sol`: made a zero signed `mintAndBurnMany` delta behave as a zero burn.
- `contracts/production/SystemManagement.sol`, `contracts/production/SystemManagementV2.sol`: raised `nextRoundFirstCstDutchAuctionBeginningBidPrice` when the owner raises the CST floor.
- `contracts/production/Bidding.sol`, `contracts/production/BiddingV2.sol`: swallowed ETH bid refunds when `tx.gasprice == 0`, matching Arbitrum gas-estimation behavior.
- `contracts/production/CosmicSignatureGameStorage.sol`: replaced the broad storage-collision warning with a concrete invariant for future write paths.

## Current State

There are no remaining explicit action markers in source code outside the marker-convention guide itself. Remaining deferred work is tracked as ordinary comments or formal-verification backlog notes.

## Deferred Areas

- Solidity transient-storage gaps remain scalar-only until Solidity supports transient reference types.
- RandomWalk NFT sources intentionally retain their original MIT license while most Cosmic Signature production sources use CC0-1.0.
- Hardhat 2 compatibility shims remain in `src/Helpers.js` and `src/ContractTestingHelpers.js`.
- The Open Bid upgrade prototype and `live-blockchain-testing/**` scripts are retained as legacy material; they should be revived or archived as a separate maintenance effort.
- Certora global conservation and staking randomness proofs remain pending in `certora/formal_verification_plan.md`.

## Remaining Issue Markers

`Issue.` comments are not all action items. The remaining production markers mostly document accepted design tradeoffs, deployed `RandomWalkNFT` legacy risks, redundant analytics state, or deferred feature ideas. Treat them as review prompts when touching the relevant module rather than as automatic cleanup candidates.
