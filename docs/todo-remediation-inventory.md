# TODO Remediation Inventory

This inventory is source-only. Generated `coverage/` HTML is excluded because it repeats comments from Solidity sources.

The project priority scheme is documented in `docs/numbered-comments.md`:

- `todo-0`: immediate.
- `todo-1`: before the next release.
- `todo-2`: soon after the next release.
- `todo-3`: low priority.
- `todo-9`: legacy, commented-out, or only relevant if revived.

## First Wave Closed

- `test/src/fuzz/FuzzCampaign.js`: removed the `todo-ai-1` seed-wrapper TODO by using one monotonic seed wrapper across profile derivation, campaign execution, extra campaigns, and failure reproduction logging.
- `test/tests-src/FuzzTest.js`: replaced the speculative wraparound TODO with an explicit allowlist.
- `test/tests-src/CosmicSignatureGameV2-MainPrizeClaimDelayOverflow.js`: replaced the environment-only branch TODO with assertions based on the helper return value.
- `docs/cosmic-signature-contracts-audit-considerations.md`: closed the stale `todo-0` about `FuzzTestV2.js`; V1 and V2 are covered by the unified fuzz campaign.
- `contracts/production/Bidding.sol`, `contracts/production/BiddingV2.sol`, `contracts/production/CosmicSignatureToken.sol`: closed Comment-202606074 by treating a zero signed `mintAndBurnMany` delta as a zero burn.
- `contracts/production/SystemManagement.sol`, `contracts/production/SystemManagementV2.sol`: closed the Comment-202504212 CST-floor drift by raising `nextRoundFirstCstDutchAuctionBeginningBidPrice` when the owner raises the minimum.
- `contracts/production/Bidding.sol`, `contracts/production/BiddingV2.sol`: handled Comment-202606216 by swallowing ETH bid refunds when `tx.gasprice == 0`, matching Arbitrum gas-estimation behavior.
- `contracts/production/CosmicSignatureGameStorage.sol`: replaced the broad storage-collision TODO with a concrete invariant for future write paths.

## Remaining Explicit TODOs

### Priority 1

- `contracts/production/OwnableUpgradeableWithReservedStorageGaps.sol`: transient storage gap remains scalar-only until Solidity supports transient reference types.
- `contracts/production/CosmicSignatureGameStorage.sol` and `contracts/production/CosmicSignatureGameStorageV2.sol`: same transient storage-gap limitation.
- `contracts/production/libraries/CosmicSignatureErrors.sol`: commented staking errors are intentionally preserved.
- `contracts/production/interfaces/IRandomWalkNFT.sol`: SPDX consistency check remains.
- `docs/QUICKSTART.md`: Certora compile flow should be reconciled with `contracts-compiling/docs/contracts-compiling.md`.
- `eslint/eslint-1.bash`: operational reminder to run ESLint.
- `hardhat.config.js`: periodic Solidity compiler security-alert review.
- `test/tests-src/PrizesWallet-1.js`: console severity/formatting review.

### Priority 2

- `contracts/production/libraries/CosmicSignatureConstants.sol`: default refund gas-swallow constant may need retuning after a chain upgrade.
- `hardhat.config.js`: network config refactor reminder when networks change.

### Priority 3

- `hardhat.config.js`: evaluate solc-js with the current SMTChecker/toolchain setup.
- `eslint.config.js`: optional stylistic plugin re-enable.
- `src/Helpers.js`: Hardhat 2.x/3.x workaround cleanup candidates.
- `src/ContractTestingHelpers.js`: Hardhat coverage and revert-message workaround cleanup candidates.
- `test/src/contract-simulators/CosmicSignatureGameProxySimulator.js`: optional randomized proxy simulator population.
- `contracts/tests/SpecialCosmicSignatureGame.sol` and `contracts/tests/SpecialCosmicSignatureGameV2.sol`: possible high-level call refactor in test helper minting.

### Priority 9

- `contracts/production/CosmicSignatureGame.sol`, `contracts/production/CosmicSignatureGameStorage.sol`, `contracts/production/CosmicSignatureGameStorageV2.sol`, `contracts/production/CosmicSignatureToken.sol`, `contracts/production/interfaces/ICosmicSignatureGameStorage.sol`, and `contracts/production/libraries/CosmicSignatureErrors.sol`: commented legacy naming or helper ideas.
- `contracts/tests/SelfDestructibleCosmicSignatureGame.sol`: commented self-destruct/finalization logic.
- `contracts/upgrade-prototype/CosmicSignatureGameOpenBid.sol` and `contracts/upgrade-prototype/BiddingOpenBid.sol`: open-bid prototype comparison and interface TODOs.
- `live-blockchain-testing/**`: stale or commented scripts that should be deleted, archived, or revived as a separate maintenance task.
- `package.json-notes.txt`: legacy notes.

## Remaining Issue Markers

`Issue.` comments are not all TODOs. The remaining production `Issue.` markers mostly document accepted design tradeoffs, deployed `RandomWalkNFT` legacy risks, redundant analytics state, or deferred feature ideas. Treat them as review prompts when touching the relevant module rather than as automatic cleanup candidates.
