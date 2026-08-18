# V3 Upgrade Work Log

Working document for the V3 (`v3-2026-07-24` branch) review, hardening, and deployment prep.
Live proxy `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2` (Arbitrum One) is at initialized version 2; production upgrade = V2 -> V3 via `upgradeToAndCall` + `reinitialize()`.

## Status

| # | Task | Status |
|---|------|--------|
| 0 | Baseline: install, compile, measure sizes, reproduce test OOM | done |
| 1 | Comparison report (`docs/v3-upgrade-review-2026-08.md`); refresh `docs/v3-vs-v2-changes.md` | report written; `v3-vs-v2-changes.md` refresh in progress |
| 2a | Cleanup: `todo-ai-0` garbage, dead commented code, `WRONG>>>` comment | done: `WRONG>>>` block resolved into real `BidPlaced` param docs (Comment-202608181 documents `cstBidPriceDeclineMultiplier` in `CosmicSignatureGameStorageV3Base`); `todo-ai-0` magic numbers in `V2UpgradeTestHelpers.js` replaced with the Solidity formulas; remaining `todo-0`s are design questions for the developer (listed in the review doc); the standing `todo-ai-0` instruction in `CosmicSignatureConstants.sol` kept as directed |
| 2b | Harden: define first-CST-bid behavior; reward view returns 0 with no last bidder | done (Comment-202608167, Comment-202608176) |
| 2c | Harden: bounds validation on the new V3 setters | done (`_providedValueIsNonZero`, `ZeroValue` error, Comment-202608171); plus the reward-floor ETH auction anchor fix (Comment-202608177) |
| 3 | V3 bytecode under 24,576 bytes; explain old->new V2 size drop | done (24,422 bytes with the V3 prize migration included, headroom 154; a delegatecall prize module measured at 21,533 remains available if more headroom is needed) |
| 4a | Fix stale V3 tests/fuzz model (remove `bidCstRewardAmountPerMinute`, 90/10) | done and verified: full suite 128 passing / 0 failing (fuzz soak: 89 V1->V2->V3 campaigns, 97/97 actions covered) |
| 4b | Fix test-suite instability (OZ manifest lock contention; OOM not reproduced) | done (per-worker TMPDIR, Comment-202608173; the lock errors were collateral of the stale-test failures) |
| 4c | New tests: upgrade preservation, dispatch, setter validation, size | done (StorageLayout, GuardsAndMisconfig, SystemManagement, BidCstReward, LateBidPremium, MainPrize suites) |
| 5 | OZ + Slither validation; Arbitrum One fork upgrade rehearsal; runbook | done: fork rehearsal PASSING against live Arbitrum One state (all 34 checks incl. the V3 prize migration and gameplay smoke); runbook written; upgrade task runs from any machine (Comment-202608126, Comment-202608127); Slither upgradeability check runs via uniform build (Comment-202608134) with only the expected benign gap-consumption findings |

Note: a parallel workstream (concurrent edits in the working tree, same comment-numbering scheme) is handling
contract hardening and test-model updates. This log covers both; coordinate before touching
`BiddingV3.sol`, `SystemManagementV3.sol`, fuzz model files, or `src/MochaHooks.js`.

## Findings

- Storage layout V1->V2->V3 verified safe. V3 appends 7 slots (308-314); gap shrinks exactly. Old-vs-new V1/V2 layouts identical.
- Inheritance verified correct: shared `CosmicSignatureGameV2Base` chassis + version leaves; `BiddingV3`/`MainPrizeV3` fork from `*V2Base`, V2 leaves absent from V3 MRO; diamond overrides resolve to V3 implementations.
- ABI deltas: V1+V2 `getCstDutchAuctionDurations` 2nd return `int256`->`uint256`; V2 `initializeV2()`->`reinitialize()`; V3 adds overloaded `BidPlaced`, changes `MainPrizeClaimed` (topic0), retires 2 setters with `NotImplemented`.
- Bytecode sizes (production settings): V1 22,124; V2 22,463; V3 24,422 of 24,576 max. Before this work V3 was 25,600 (1,024 over).
- Old->new V2 size delta is only -156 bytes (22,920 -> 22,764 before this work), not the feared ~3K; no SolC bug indication. The developer likely compared different artifacts or commits.
- Baseline `HARDHAT_MODE_CODE=1` test run: no out-of-memory crash; ~21 failures, all stale-design drift (old `bidCstRewardAmountPerMinute` API, retired setters now reverting `NotImplemented`, fuzz expecting old 200 CST min limit). OZ-upgrades manifest lock contention in parallel Mocha identified and being fixed via per-worker TMPDIR.

## Change log

- 2026-08-13: Created this log. `npm install` done. Compiled production profile.
- 2026-08-13: Measured baseline bytecode sizes; V3 = 25,600 (1,024 over EIP-170 limit).
- 2026-08-13: `hardhat.config.js`: switched `solidity` to `compilers` array + per-file override for
  `CosmicSignatureGameV3.sol` (optimizer runs=1, no CBOR metadata; Comment-202608121). The single-compiler
  shorthand silently ignores `overrides`. SMTChecker `modelChecker` config now applied to all compile jobs.
- 2026-08-13: `BiddingV3.sol`: extracted `_emitBidPlaced` (Comment-202608122, saved 319 bytes) and
  `_checkBidCstRewardAmountMinLimit` (Comment-202608124); restored clobbered Comment-202608166 definition.
- 2026-08-13: `ArbitrumHelpers.sol`: consolidated 4 near-identical precompile try-call bodies into shared
  `_tryCallPrecompile` (Comment-202608125; saved ~257 bytes on V3, ~300 on V1/V2; behavior identical).
- 2026-08-13: Result: V3 = 24,301 bytes (headroom 275). runs=100 would leave only 97 bytes, hence runs=1.
- 2026-08-13: Ran baseline test suite (4.6 min, exit 0 runner, 21+ test failures catalogued above).
- 2026-08-13: Hardening reconciled into `BiddingV3.sol`: first-CST-bid validation preserving the V2 error
  precedence (Comment-202608167); `getBidCstRewardAmountAdvanced` returns 0 with no bid in the round
  (Comment-202608176); the first-bid branch in `_bidWithEth` keyed on `lastBidderAddress` so a tiny/zero
  `bidCstRewardAmountMultiplier` cannot corrupt `ethDutchAuctionBeginningBidPrice` mid-round
  (Comment-202608177; the `reward == 0` keying broke under any multiplier below
  `mainPrizeTimeIncrementInMicroSeconds`, since a 1-second-gap bid reward floors to zero).
  V3 = 24,341 bytes with all of it included.
- 2026-08-13: `SystemManagementV3.sol`: zero-value validation on the 5 dangerous setters (Comment-202608171);
  `CosmicSignatureErrors.ZeroValue` revived as a string-less error.
- 2026-08-13: Rewrote the stale V3 suites for the current design: `CosmicSignatureGameV3-BidCstReward.js`
  (linear reward, whole-to-previous-bidder, same-second revert incl. an exact `BidPlacedWithinCurrentSecond`
  static-call assertion, min-limit semantics, zero-multiplier robustness, randomized accounting campaign),
  `CosmicSignatureGameV3-BidCstRewardAttack.js` (`HostileBidder`), `-LateBidPremium.js` (CST premium sampled
  on the linear decline, slowed via `setCstBidPriceDeclineMultiplier`), `-StorageLayout.js` (carried vs
  re-initialized slots split), `-GuardsAndMisconfig.js` (`ZeroValue` + `NotImplemented`), `-MainPrize.js`
  (derived CST decline duration), `SystemManagement.js` (V3 setter matrix incl. zero rejections).
- 2026-08-13: Fuzz harness reworked for V3: `GameModel` (linear CST price decline, derived auction duration,
  whole-reward-to-previous-bidder, same-second guard, `championDurations` tracking, V3 reinit overwrites),
  `Invariants` (decline multiplier getters, `championDurations`), `AdminActions` (V3 setter set, V2-only
  duration setters gated), `ActionHelpers` (version-dependent `BidPlaced` 8th arg, reward accounting),
  `FuzzCampaign` (V3 same-block burst expects reverts for bids 2+), `UpgradePhase` (re-initialized slots
  excluded from the carried-over diff; V3 getter probes updated).
- 2026-08-13: Wrote `docs/v3-upgrade-review-2026-08.md` (storage/ABI/behavior comparison with attribution,
  inheritance and override verification, size analysis, crash root causes, verified todo-0 answers).
- 2026-08-13: Full test suite passes in both build configurations: 128 passing / 0 failing with
  `ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true`, and 128 passing / 0 failing with
  `ENABLE_HARDHAT_PREPROCESSOR=false` (production code paths). Each run includes the ~15-minute fuzz
  campaign with the V1 -> V2 -> V3 upgrade phases and the V3 mechanics under the reworked model.
- 2026-08-13: Upgrade task portability (`tasks/src/cosmic-signature-tasks.js`): optional
  `cosmicSignatureGameProxyAddress` (Comment-202608126) and `existingCosmicSignatureGameContractName`
  -> `forceImport` manifest reconstruction (Comment-202608127) in the upgrade config. The arbitrumOne V3
  config now carries the production proxy address and `CosmicSignatureGameV2`.
- 2026-08-13: Fork support in `hardhat.config.js` (Comment-202608131): `FORK_RPC_URL`/`FORK_BLOCK_NUMBER`
  env-gated static forking of the in-process network (runtime `hardhat_reset` into a fork is broken in this
  Hardhat/EDR version: "Storage overrides are not supported for forked blocks yet", EDR issue 911), fork-mode
  hardfork history for chains 42161/421614, EIP-170 enforced in fork mode, no `initialDate` on forks.
- 2026-08-13: New fork upgrade rehearsal (Comment-202608128): `tasks/src/fork-rehearse-cosmic-signature-game-v3-upgrade.js`
  + runner `tasks/runners/run-fork-rehearse-cosmic-signature-game-v3-upgrade-arbitrumOne.bash`.
  Rehearses the real V2->V3 upgrade against forked live Arbitrum One state: OZ `validateUpgrade`, owner-impersonated
  `upgradeToAndCall` + `reinitialize`, 42 carried-over getters unchanged, 7 intentional overwrites + 6 new params
  at expected defaults, `InvalidInitialization` replay guard, `NotImplemented` retired setters, `ZeroValue`
  validation, ETH bid, same-second throttle (`BidPlacedWithinCurrentSecond`), whole reward to previous bidder,
  `claimMainPrize` with 3 CS NFTs to the beneficiary, `championDurations` persisted, `roundNum` incremented.
  Arbitrum precompiles injected as `FakeArbSys`/`FakeArbGasInfo` on the fork (Comment-202608133; on a fork their
  placeholder code would eat all gas). Result: SUCCESS, all checks pass.
- 2026-08-13: Runbook: `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` gained the
  fork rehearsal step, the new config fallbacks, the round-inactivity timing guidance, and a "V3 Specifics"
  section (no unsafe flags; reinitialize overwrites; indexer/frontend notes; post-upgrade sanity reads).
- 2026-08-13: Slither: `slither-check-upgradeability` V2->V3 now runs via the `SLITHER_UNIFORM_BUILD=true`
  uniform compilation (Comment-202608134; the per-file compiler override otherwise splits V3 into a separate
  compilation unit that the tool cannot see). Findings: only the expected benign gap-consumption patterns
  ("different variables": V2 `__gap_persistent` slot vs V3 `championDurations`; "extra variables": the 7
  appended V3 variables + the shrunk V3 gap). OZ `validateUpgrade`, which understands storage gaps, passes with
  no findings. (Slither was run from a temporary venv, `/tmp/slither-venv`; the checked-in script falls back to
  `PATH` when the developer's venv is absent.)
- 2026-08-13: Cleanup: resolved the `IBidding2V3.sol` `WRONG>>>` block into real `BidPlaced` documentation and
  documented `cstBidPriceDeclineMultiplier`(+ChangeDivisor) in `CosmicSignatureGameStorageV3Base.sol`
  (Comment-202608181); replaced the `todo-ai-0` magic numbers in `test/src/V2UpgradeTestHelpers.js` with the
  `CosmicSignatureConstants.sol` formulas (verified equal). Remaining `todo-0`s in production contracts are
  design questions for the developer (e.g. the CST auction beginning price debate in `BiddingV3._bidWithCst`,
  the `chronoWarriorDuration` -1 reset question in `MainPrize.sol`, and `transferEthTo` adoption, which would
  change failed-transfer revert data and is best left alone for V1/V2 parity).
- 2026-08-13: Added `/edr-cache/` (fork state cache) to `.gitignore`.
- 2026-08-13: FINAL VERIFICATION: full test suite 128 passing / 0 failing in ~20 minutes (the fuzz soak runs
  89 independent V1->V2->V3 campaigns within its 1200-second budget; 97/97 distinct actions succeeded;
  max observed `claimMainPrize` gas 4.46M). Combined with the passing Arbitrum One fork rehearsal, clean OZ
  `validateUpgrade`, and benign-only Slither findings, the V3 upgrade is ready for the production runbook in
  `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md`.
- 2026-08-14: Security follow-up added `CosmicSignatureGameV3-Security.js` (8 tests): atomic-vs-bare
  reinitializer characterization, V3 beneficiary and charity reentrancy, same-second `receive()` throttling,
  exact unchecked premium wrapping under extreme owner parameters, reverting ERC-20/ERC-721 donation rollback,
  and donated-NFT self-grief/recovery. `RevertingToken.sol` is the non-reentrant failure double;
  `HostileBidder.sol` gained V3 claim reentry. The focused production-profile run is 17 passing and the new
  suite is 8 passing with Solidity assertions enabled. The overflow test now distinguishes production wrapping
  from the checked arithmetic intentionally generated by SMT preprocessing. No security-follow-up
  `contracts/production` source changed.
- 2026-08-14: Documented 2 medium upgrade-path findings in
  `docs/cosmic-signature-contracts-audit-considerations.md`: permissionless one-shot `reinitialize` after a bare
  upgrade, and the production no-op previous-version check. Per owner direction these are documented/tested,
  not patched; the atomic checked-in upgrade task remains the operational mitigation.
- 2026-08-14: THE MODULAR DELEGATECALL RESTRUCTURING (Comment-202608245/202608246/202608248). The V3 Game was
  split into a slim UUPS implementation (`CosmicSignatureGameV3`, now the hot path only: `receive`, `bidWithEth`,
  `bidWithCst`, a `claimMainPrize` forwarder, `reinitialize`, Ownable/UUPS) plus 3 plain delegatecall modules
  compiled from the original mixins over the identical storage layout: `CosmicSignatureGameViewsModuleV3`
  (state getters, computed views, bid-with-donation combos, `halveEthDutchAuctionEndingBidPrice`),
  `CosmicSignatureGameAdminModuleV3` (all setters + ETH donations), `CosmicSignatureGamePrizesModuleV3`
  (`claimMainPrize` + prize distribution + prize views), routed via an immutable-address fallback chain
  (impl -> views -> admin -> prizes -> empty revert). The implementation inherits a new `internal`-visibility
  storage chassis (`CosmicSignatureGameStorageV3Core`) and lean `*V3Core` forks of the bid-path mixins;
  the modules inherit the original `public`-var chassis, so the compiler regenerates the original getters there.
  Bytecode sizes (production, uniform runs=400 restored; the per-file runs=1 override and the
  `SLITHER_UNIFORM_BUILD` workaround are gone): implementation 7,316 (was 24,422 of 24,576, i.e. 154 bytes of
  headroom; now ~17.3 KB of headroom), views module 13,398, prizes module 11,451, admin module 9,566.
  Externally the proxy is selector-for-selector, event-for-event, error-for-error identical to the monolith:
  enforced by `CosmicSignatureGameV3-ModularEquality.js` (combined-ABI equality against the recorded monolith
  baseline `test/baselines/cosmic-signature-game-v3-abi-baseline.json`, exact storage layout identity of the
  implementation and every module, selector routing, size budgets impl<=20,000/modules<=22,000, direct-module-call
  safety per Comment-202608247) and by `CosmicSignatureGameV3-BehaviorParity.js` (a 38-step deterministic
  gameplay scenario -- bids of every kind, donations, setter/guard revert probes, a full claim, and the next
  round -- replayed against the event/state trace recorded on the audited monolith at commit 9496fc31,
  `test/baselines/cosmic-signature-game-v3-behavior-baseline.json`; only RNG-derived values are masked).
  The upgrade task deploys the modules when the config sets `deployCosmicSignatureGameV3Modules` (V3 configs
  updated); the re-registration task verifies all 4 contracts; the fork rehearsal deploys and checks the modular
  wiring; `upgradeToV3` in tests deploys modules and attaches the combined ABI to the proxy. V1/V2 sources,
  artifacts, and ABIs are untouched.
- 2026-08-14: Added the V3 ETH prize migration to `reinitialize`: 20% main prize, 5% charity, 5% total across
  3 bidder-raffle draws, 5% CS NFT stakers, and 15% Chrono Warrior, leaving 50% implicit rollover. V1/V2 defaults
  remain unchanged. Upgrade/storage assertions, the fuzz model, a focused end-to-end ETH payout test, fork
  rehearsal, runbook, primary prize reference, and V3 comparison docs now cover the intentional overwrites.
  The production implementation is 24,422 bytes (154 bytes under EIP-170). All four bounded full-suite
  configurations pass with 137 tests each, and the Arbitrum One fork rehearsal passes all 34 checks.
- 2026-08-18: THE NON-RATCHETING LATE BID PRICE PREMIUM (Comment-202608271). The premium is now a one-time
  toll on the bid that pays it: every stored price update consumes the premium-free base price instead of the
  premium-inclusive paid price. `nextEthBidPrice` grows exponentially from the base returned by the new
  `_getNextEthBidPriceBase`, and `cstDutchAuctionBeginningBidPrice` (plus its
  `nextRoundFirstCstDutchAuctionBeginningBidPrice` next-round carry-over, which previously leaked the premium
  across rounds) doubles the base returned by the new `_getNextCstBidPriceBase`. Previously a single bid at the
  deadline re-anchored the whole round's ETH price ~5x higher; now, once the bid's `mainPrizeTime` extension
  closes the window, every posted price is exactly what it would have been had the premium logic not existed.
  Payment, refunds, `BidPlaced` prices, and spent totals keep recording the premium-inclusive price; the bid
  raffle weight (Comment-202608262) uses the premium-free base as well, so the premium buys no raffle odds --
  a maximum-premium bid pays ~5x per unit of raffle weight, a pure penalty. Changed identically in both lineages
  (`BiddingV3Core.sol` hot path and the `BiddingV3.sol` module lineage, Comment-202608263 discipline);
  public price getters still quote the premium-inclusive price. The fuzz `GameModel` mirrors the new update
  rule, the fuzz invariants now also assert the two stored CST price anchors against the model, and the fuzz
  engine additionally snaps bid timestamps deep into the premium window; `LateBidPremium` gains a dedicated
  non-ratcheting test covering plain-ETH, ETH + Random Walk NFT (max premium past the deadline), and CST bids.
  The behavior-parity baseline is unaffected (its scenario never bids inside the window). Certora specs are
  unaffected (they verify the V1 contract, which has no premium). `docs/v3-vs-v2-changes.md` updated.

## Remaining items for humans

- Decide the open `todo-0` design questions (see the review doc and the cleanup entry above).
- Decide whether a future contract version should add `onlyOwner`/`_onlyRoundIsInactive` to `reinitialize`
  and enforce the previous initialized version in production; the current V3 leaves both behaviors unchanged.
- Run the live upgrade per the runbook (requires the owner key; time it while the bidding round is inactive).
- After the upgrade: run the Arbiscan registration script; update the site/indexer per the review doc's
  off-chain impact checklist.
