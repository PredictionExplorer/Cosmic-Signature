# V3 documentation and white paper review

## Scope and provenance

This review reconciles the repository documentation and the canonical English
white paper 1.3 with contract revision
`9d1a644744e0ee588ef5af1947f6decdf8bdb3f3` on `v3.1-2026-10-13`.
All 118 repository-owned Solidity files were read, including interfaces,
libraries, test helpers, prototypes, comments, and conditional compilation
branches. The per-file checklist below records the complete original inventory.
This is a documentation-focused code review, not a claim of a new independent
security audit or formal verification of every possible execution.

The deployed V2 baseline is source-verified implementation
`0x50eB3d05d2C463949DE9238D419385594f7AdB97` at Arbitrum One block
515784460. Its runtime code matches the Sourcify record, and all 48 project
source files in that verified build match `main` commit
`3f52eaaf2258ec30f61fad07bb07cb2e3b4ca8a6` and `v2` commit
`a73aed1d5146efd600711aa4faaf4b1ae9681d49`. The proxy's implementation slot,
configuration, component addresses, runtime hashes and source records are in
[deployment-snapshot.json](white-paper/deployment-snapshot.json).

Historical V1 behavior was checked against the verified original implementation
`0x7739148013777c485AD9f3d971e1005Eca686661`, not the subsequently edited V1
source on the V3 branch. Retained companion contracts were compared against their
own verified deployment sources. In particular, the deployed Allocations Wallet
has checked deadline addition and older errors; the local Random Walk NFT source
is an adaptation, not a byte-for-byte copy of its original deployed compilation.

The prior English paper is frontend commit
`893368318d58a6c13add49336fd8fc2fb17ba45a`, version 1.0. Art descriptions were
checked against generator commit `59b324d035252c7db503743441d04d0355b81f3b`.
Those repositories, the website, and all translations were left unchanged.

## Claim and implementation map

| White paper subject | Primary implementation or evidence | Reviewed boundary |
| --- | --- | --- |
| Cycle opening and ETH interpolation | `BiddingV2Base.getNextEthBidPriceAdvanced` | First-cycle distinction, floor plus one wei, rounding, elapsed window, current settings |
| Countdown and finalization eligibility | `MainPrizeCommonV2`, `MainPrizeV2Base.claimMainPrize` | Stored-deadline extension, overtime, alternate caller after timeout, next-cycle delay |
| ETH payment and NFT reduction | `BiddingV3._bidWithEth` | Undiscounted base, ceiling division, swallowed overpayment, refund failure |
| CST price and rate | `BiddingV3._getNextCstBidPriceBaseAdvanced`, rate adjustment helpers | Zero base, carried first window, rate floor, total-duration versus remaining-time guard |
| Late premium | `BiddingV3._addRoundLateBidPricePremiumAmountIfNeeded` | Exact integer order, exponent eight, clamping, first-Gesture exemption, premium-free propagation |
| Participation CST | `BiddingV3.getBidCstRewardAmountAdvanced` and payment paths | Previous recipient, first-Gesture zero, minimum argument, no finalization settlement |
| Fixed NFT and CST allocations | `MainPrizeV3._distributePrizes` | Three main NFTs but one CST allocation; 26 NFTs and 27,000 fixed CST when all tracks exist |
| ETH distribution | `MainPrizeV3`, `SecondaryPrizesV2` | Pre-transfer balance, percentage and split rounding, no anchors, failed Public Goods transfer, fatal main transfer |
| Selection weights | `BidRaffleWeightHelpers`, `MainPrizeV3._pickRaffleWinnerAddress` | Full contemporaneous ETH base, zero-cost CST eligibility, repeated recipients, modulo sampling |
| Time-based titles | `BidStatisticsV2`, `BidStatisticsV3` | Strict comparisons, delayed evaluation, same address, finalization-time update, record flags |
| Custody and retrieval | `PrizesWallet`, `DonatedTokenHolder` | Per-cycle/recipient ETH, separate ERC-20 holders, stored expiry, historical wallet selection |
| Anchoring | `StakingWalletNftBase`, both concrete wallets | Once per NFT per wallet, original staker release, rounding, residual owner retrieval, zero-anchor handling |
| Token and NFT powers | `CosmicSignatureToken`, `CosmicSignatureNft` and verified deployed sources | Allowance burns, ERC20Votes supply limit, authorized naming, stored seed versus event cycle, no mint receiver callback |
| Council and peripheral authority | `CosmicSignatureDao`, `CharityWallet`, `MarketingWallet` plus snapshot | Delegation/checkpoints, quorum, no timelock extension, owner/treasurer authority, separate ETH forwarding |
| Randomness | `RandomNumberHelpers`, `ArbitrumHelpers`, `CryptographyHelpers` | Block/precompile sources, fallback, correlation, no VRF or uniqueness guarantee |
| Configuration and upgrade | `SystemManagement*`, `CosmicSignatureGameV2Base`, `CosmicSignatureGameV3` | Inactive-cycle authorization, exceptions, atomic reinitializer, overwritten and retained settings |
| ABI and storage transition | Compiled ABI/AST/layout versus verified V2 ABI/layout | Six removed and sixteen added function selectors, two output-type changes, slot 259 reinterpretation, slots 308-313 and gap 314 |
| Deployed V1/V2 history | Snapshot transaction receipts, block timestamps and verified original sources | April 24 proxy deployment, June 21 V2 upgrade, source-verification date kept separate |
| Art and reproducibility | Pinned generator source, `src/app.rs`, `src/render`, `src/ember`, golden tests | Configurable search, main numerical paths versus Ember raw pixels, recorded inputs, encoder bytes, optional output |
| Historical security review | Hacken report scoped to `9385ddbacc9a0543d19e69f33fbd96d067a6d361`; Certora archive notices | Historical evidence does not establish current V3 proof or coverage |

## Corrections made

Current functional, allocation, endurance, change-register, compilation and
operation documentation now distinguishes defaults from live settings, source
changes from deployed companion behavior, conceptual action lists from exact
error order, and explicit wallet replacement from the default Game upgrade.
Inaccurate ordinary Solidity comments were corrected without changing runtime or
conditionally compiled instructions. Numbered tags and existing todos were
preserved.

Historical Certora, live-test and OpenBid material retains its original context
with explicit version/status notices. The old class diagram is identified as a
partial historical V1 diagram in the repository entry point; current V3
inheritance is described in the technical change register and source.

The English paper is version 1.3 and authoritative in this repository. It explains
the design before the V1/V2/V3 chronology, includes a V2-to-V3 comparison and a
separate 1.0-to-1.3 editorial history, and records the proposed deployment status.
The old papers are retained in the frontend, rather than silently relabeled or
removed. No new implementation or wallet address is presented as deployed.

## Validation

- Production compilation succeeded: 186 Solidity files including dependencies,
  Solidity 0.8.34, configured Osaka target.
- The quick Hardhat sequence passed all four build configurations with **149
  passing tests in each**. On this macOS host, the Linux `/usr/bin/bash` wrapper
  was replaced only at invocation time by
  `cd test/runners && LONG_TEST_MODE_CODE=1 bash test.bash -b`. An initial run had
  three OpenZeppelin manifest-lock errors; the complete retry passed.
- Solidity executable-token equivalence was checked against the target commit
  for every edited Solidity file across all seven supported preprocessor modes.
  Conditional directives, numbered references and full todo lines were retained.
  Comment edits can change compiler metadata and full bytecode hashes; this
  check establishes unchanged instructions, not identical compiled artifact bytes.
- Compiled ABI signatures, event/error hashes, inheritance and storage layout
  were checked against the deployed V2 baseline. The existing deployed-V2-layout
  regression suite is part of the quick run.
- Exact integer calculations were checked for opening-floor rounding, rate
  changes, the initial V3 CST window, linear Participation CST and premium
  examples. The historical V2 formula was checked against verified V2 source.
- Publication checks cover relative links, source/PDF/build-script digests,
  PDF text and visual layout, and whitespace errors.

The local tests deploy/refactor V1 and V2 sources; they do not alone prove the
live V2-to-V3 transition. A separate local Hardhat fork rehearsal passed from
Arbitrum block **515793372**: atomic upgrade, retained settings,
first-Gesture zero Participation CST, payment to the previous participant,
finalization with three main NFTs and one 1,000 CST allocation, explicit wallet
replacement between cycles, and retrieval of existing ETH from the old wallet.
The full results and source-preservation hashes are recorded in
[review-validation.json](white-paper/review-validation.json).

The rehearsal used Hardhat's Osaka EVM over forked Arbitrum state, funded and
impersonated accounts locally, and used the repository's `FakeArbSys` and
`FakeArbGasInfo` test doubles for the finalization portion. Hardhat does not
implement Nitro's host precompiles; this is not a full Nitro, sequencer, or gas
simulation. No live transactions were sent. The earlier attempt to fork the
older documentation snapshot could not retrieve complete historical account
state from public RPCs; the successful rehearsal used a later identified block.
The fixed-block getters, code hashes and sources in the documentation snapshot
were independently checked. Rehearse again with the final operator configuration
and suitable RPC infrastructure before deployment.

## Pre-merge formula and history review

A second review of PR #204 checked the paper against the actual verified V1/V2
sources and the proposed V3 implementation, rather than treating the existing
change register as evidence. Fresh transaction receipts and block timestamps
confirmed the April 24 proxy deployment and June 21 V2 upgrade. The prior paper
1.0 history was rechecked against its pinned frontend source.

An independent local check made **136 compiled-contract view comparisons**:
V3's compiled runtime and the verified deployed V2 runtime were loaded into
Hardhat with explicit test storage, then queried at opening-window boundaries,
premium boundaries and overtime, reward timing boundaries, CST zero-cost
boundaries, and odd/even NFT-reduction amounts. Expected results came from the
paper's equations. This isolates arithmetic; it is not another live-state
upgrade simulation. Exact results and endpoint examples are in the
[validation record](white-paper/review-validation.json).

The equations, allocation totals, and V1/V2/V3 chronology were confirmed.
Corrections clarify that opening ETH Gestures also step the next ETH base cost
and attempt the CST rate adjustment; later ETH rate changes do not restart the
CST window; and the smooth premium table differs from integer endpoint values.
The indexer guidance now uses the ordered proxy upgrade event, because V2 logs
can precede the upgrade in the same block. Block-tagged state reads are labeled
as end-of-block observations. The randomness description and the contradictory
fork-rehearsal scope sentence were corrected. This second review changes no
Solidity or test logic.

## Per-file review coverage

Original-file inventory: `9d1a644744e0ee588ef5af1947f6decdf8bdb3f3`. This checklist covers all **118 tracked Solidity files**, all **26 original Markdown files**, and **11 original text-note and diagram files**. Newly authored white-paper files and the new review report are additional deliverables, not counted as original files.

“Full source and comments” means the complete repository-owned Solidity file was read, including comments and conditionally compiled branches. This is documentation verification and code review, not a claim that every behavior is formally proved or that every branch was executed.

Targeted operational, regression-test, and CVL inspections support the documentation review but are not relabeled as complete source audits. Third-party dependency sources, generated compiler artifacts, and the separate renderer/backend repositories are outside the 118-file Solidity inventory.

### Solidity: production sources, interfaces, and libraries

| Reviewed | File | Review group | Depth |
| --- | --- | --- | --- |
| Yes | `contracts/production/AddressValidator.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/BidStatistics.sol` | Core | Full source and comments |
| Yes | `contracts/production/BidStatisticsV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/BidStatisticsV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/Bidding.sol` | Core | Full source and comments |
| Yes | `contracts/production/BiddingCommon.sol` | Core | Full source and comments |
| Yes | `contracts/production/BiddingCommonV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/BiddingV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/BiddingV2Base.sol` | Core | Full source and comments |
| Yes | `contracts/production/BiddingV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/CharityWallet.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/CosmicSignatureDao.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/CosmicSignatureGame.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameStorage.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameStorageV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameStorageV2Base.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameStorageV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameStorageV3Base.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameV2Base.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureGameV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/CosmicSignatureNft.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/CosmicSignatureToken.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/DonatedTokenHolder.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/EthDonations.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/EthDonationsV2.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/MainPrize.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/MainPrizeCommon.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/MainPrizeCommonV2.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/MainPrizeV2.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/MainPrizeV2Base.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/MainPrizeV3.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/MarketingWallet.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/NftDonations.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/NftDonationsV2.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/OwnableUpgradeableWithReservedStorageGaps.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/PrizesWallet.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/RandomWalkNFT.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/SecondaryPrizes.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/SecondaryPrizesV2.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/StakingWalletCosmicSignatureNft.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/StakingWalletNftBase.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/StakingWalletRandomWalkNft.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/SystemManagement.sol` | Core | Full source and comments |
| Yes | `contracts/production/SystemManagementV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/SystemManagementV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IAddressValidator.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IBidStatistics.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBidding.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBidding1V2.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBidding1V3.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBidding2V2.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBidding2V3.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBiddingCommon.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBiddingV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/IBiddingV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ICharityWallet.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/ICosmicSignatureDao.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/ICosmicSignatureGame.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ICosmicSignatureGameStorage.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ICosmicSignatureGameStorageV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ICosmicSignatureGameV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ICosmicSignatureNft.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/ICosmicSignatureToken.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IDonatedTokenHolder.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IEthDonations.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IMainPrize.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/interfaces/IMainPrize1.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/interfaces/IMainPrize2.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/interfaces/IMainPrize2V3.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/interfaces/IMainPrizeCommon.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/interfaces/IMainPrizeV3.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/interfaces/IMarketingWallet.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/INftDonations.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IPrizesWallet.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IRandomWalkNFT.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/ISecondaryPrizes.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/interfaces/IStakingWalletCosmicSignatureNft.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IStakingWalletNftBase.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/IStakingWalletRandomWalkNft.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/interfaces/ISystemEvents.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ISystemEventsV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ISystemEventsV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ISystemManagement.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ISystemManagementV2.sol` | Core | Full source and comments |
| Yes | `contracts/production/interfaces/ISystemManagementV3.sol` | Core | Full source and comments |
| Yes | `contracts/production/libraries/ArbitrumHelpers.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/libraries/BidRaffleWeightHelpers.sol` | Core | Full source and comments |
| Yes | `contracts/production/libraries/CosmicSignatureConstants.sol` | Finalization and libraries | Full source and comments |
| Yes | `contracts/production/libraries/CosmicSignatureErrors.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/libraries/CosmicSignatureEvents.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/libraries/CosmicSignatureHelpers.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/libraries/CryptographyHelpers.sol` | Peripheral contracts | full source and comments |
| Yes | `contracts/production/libraries/RandomNumberHelpers.sol` | Finalization and libraries | Full source and comments |

### Solidity: test contracts and upgrade prototypes

These files were read fully to distinguish test scaffolding and prototype behavior from production guarantees. They are not deployment targets for V3.

| Reviewed | File | Classification | Depth |
| --- | --- | --- | --- |
| Yes | `contracts/tests/BidRaffleWeightHelpersTestHarness.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/BidderContract.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/BlockchainPropertyGetter.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/BrokenCosmicSignatureNftStaker.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/BrokenCosmicSignatureToken.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/BrokenEthReceiver.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/BrokenStakingWalletCosmicSignatureNft.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/BrokenToken.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/FakeArbBase.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/FakeArbGasInfo.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/FakeArbSys.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/FuzzTestMockErc20.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/FuzzTestMockErc721.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/HostileBidder.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/MaliciousActorBase.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/MaliciousBidder.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/MaliciousCharity.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/MaliciousCosmicSignatureNftStaker.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/MaliciousPrizeWinner.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/MaliciousToken.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/SelfDestructibleCosmicSignatureGame.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/tests/SelfDestructibleCosmicSignatureGameV2.sol` | Test-only Solidity | Full source and comments |
| Yes | `contracts/upgrade-prototype/BiddingOpenBid.sol` | Test-only V1-based OpenBid prototype | Full source and comments |
| Yes | `contracts/upgrade-prototype/CosmicSignatureGameOpenBid.sol` | Test-only V1-based OpenBid prototype | Full source and comments |

### Original Markdown documentation

“Not a protocol description” identifies repository instructions or archived tooling, not an unreviewed file. Historical findings and numbered todos are retained with scope notices; the June 2025 Certora plan is not a current V3 proof report.

| Reviewed | File | Disposition |
| --- | --- | --- |
| Yes | `AGENTS.md` | Reviewed and retained; repository instructions, not a protocol behavior claim. |
| Yes | `README.md` | Current repository overview reviewed in full and updated. |
| Yes | `certora/Moved-Files/QUICKSTART.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `certora/Moved-Files/README.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `certora/Moved-Files/certora_instructions.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `certora/README.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `certora/certora_best_practices.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `certora/formal_verification_plan.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `contracts-compiling/docs/contracts-compiling.md` | Current operational/audit documentation reviewed and corrected against its implementation. |
| Yes | `docs/contract-improvement-ideas-not-to-propose-in-existing-code.md` | Reviewed and retained; repository instructions, not a protocol behavior claim. |
| Yes | `docs/cosmic-signature-contracts-audit-considerations.md` | Current operational/audit documentation reviewed and corrected against its implementation. |
| Yes | `docs/cosmic-signature-contracts-functional-requirements.md` | Current protocol/peripheral documentation reviewed and corrected against code. |
| Yes | `docs/cosmic-signature-game-prizes.md` | Current protocol/peripheral documentation reviewed and corrected against code. |
| Yes | `docs/endurance-chrono-README.md` | Current protocol documentation reviewed and corrected against code and deployed-version evidence. |
| Yes | `docs/numbered-comments.md` | Reviewed and retained; repository instructions, not a protocol behavior claim. |
| Yes | `docs/testing-cosmic-signature-dao-with-the-tally-app.md` | Current protocol/peripheral documentation reviewed and corrected against code. |
| Yes | `docs/v3-vs-v2-changes.md` | Current protocol documentation reviewed and corrected against code and deployed-version evidence. |
| Yes | `live-blockchain-testing/docs/live-blockchain-tests-old.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `live-blockchain-testing/docs/live-blockchain-tests.md` | Current operational/audit documentation reviewed and corrected against its implementation. |
| Yes | `live-blockchain-testing/src/cosmic-signature-game-upgrade-open-bid/README.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `live-blockchain-testing/src/cosmic-signature-game-upgrade-open-bid/README2.md` | Historical documentation reviewed; archive status and present limitations made explicit. |
| Yes | `slither/slither-check-upgradeability-manual.md` | Current operational/audit documentation reviewed and corrected against its implementation. |
| Yes | `slither/slither-manual.md` | Current operational/audit documentation reviewed and corrected against its implementation. |
| Yes | `tasks/docs/Cosmic-Signature-Contracts-Deployment-And-Registration.md` | Current operational/audit documentation reviewed and corrected against its implementation. |
| Yes | `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` | Current operational/audit documentation reviewed and corrected against its implementation. |
| Yes | `tasks/docs/Prizes-Wallet-Contract-Upgrade-And-Re-Registration.md` | Current operational/audit documentation reviewed and corrected against its implementation. |

### Original notes and diagrams

Diagram review inspected the XML labels and relationships to establish V1 scope; it did not regenerate the drawing or claim a new V3 diagram. Disabled scripts stored as text remain historical notes.

| Reviewed | File | Disposition |
| --- | --- | --- |
| Yes | `AGENTS.md-notes.txt` | Reviewed and retained; historical/tooling note, not a current V3 behavior specification. |
| Yes | `docs/cosmic-signature-contracts-class-diagram-and-calls.dia` | XML content/structure reviewed; V1-only diagram retained and identified as historical in the audit guide. |
| Yes | `docs/cosmic-signature-contracts-class-diagram-and-calls.svg` | XML content/structure reviewed; V1-only diagram retained and identified as historical in the audit guide. |
| Yes | `live-blockchain-testing/runners/run-full-test-suite.bash.do-not-run.txt` | Reviewed and retained; historical/tooling note, not a current V3 behavior specification. |
| Yes | `live-blockchain-testing/src/cosmic-signature-game-upgrade-open-bid/run-test.txt` | Reviewed; execution/scope instructions corrected or marked historical; existing todos retained. |
| Yes | `making-project-backup-copy/rar-args.txt` | Reviewed and retained; historical/tooling note, not a current V3 behavior specification. |
| Yes | `package.json-notes.txt` | Reviewed and retained; historical/tooling note, not a current V3 behavior specification. |
| Yes | `project-state/last-generated-id-number.txt` | Read for numbered-item rules; no ID allocated or file changed. |
| Yes | `scripts/prettier-run.sh.we-better-do-not-run-this-script.txt` | Reviewed and retained; historical/tooling note, not a current V3 behavior specification. |
| Yes | `smtchecker/compile-1-manual.txt` | Reviewed; execution/scope instructions corrected or marked historical; existing todos retained. |
| Yes | `solhint/check-1-manual.txt` | Reviewed; execution/scope instructions corrected or marked historical; existing todos retained. |

## Supporting inspections and limits

- Operational guides were checked against Hardhat settings, deployment and upgrade task code/configurations, compilation/test/static-analysis wrappers, the V1 live-test workflow, Certora configurations, and its archived runner.
- The deployed-V2 storage-layout regression and local V3 carried-state test were read fully. Other regression files were inspected for the relevant initialization, replacement, and test-profile behavior; their complete contents were not all audited by the documentation reviewer.
- The 22 committed Certora `.spec` files received declaration/inventory and configuration-compatibility inspection. They were not exhaustively reviewed as proofs and were not executed. Their stale compiler targets and interfaces are explicitly documented.
- Generator claims use the pinned renderer revision and targeted source/CI evidence. The renderer and backend repositories were not modified; this does not establish that all hosted assets have been regenerated.
- No live upgrade transaction was performed. The local Arbitrum fork rehearsal used simulated precompiles for finalization, as described in Validation above. Local execution and deployment-state reads are recorded separately from source-read coverage.

Source inventories used to prepare this checklist: the core, peripheral, finalization, and operational-documentation review records. No file is marked complete solely because a search matched its name.
