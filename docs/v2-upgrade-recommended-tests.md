# Recommended Tests Before Upgrading To CosmicSignatureGameV2

## Purpose

This document lists the additional tests that should be added before treating the `CosmicSignatureGameV2` upgrade as production-safe. It is based on the risks documented in `docs/v2-upgrade-audit.md`.

The current V2 test coverage is not enough for a high-confidence mainnet upgrade. `test/tests-src/CosmicSignatureGame-3.js` verifies upgrade mechanics, but it does not run a V2 gameplay round. `test/tests-src/FuzzTest.js` currently uses the V1 ABI and should be extended or duplicated for V2.

Priorities:

- P0: release blockers for mainnet upgrade confidence.
- P1: important targeted economic / edge-case tests.
- P2: longer-term tool and invariant hardening.

## P0: Storage Layout Equivalence Test

Findings covered: O-1

Goal: prove the V2 upgrade preserves every carried-over V1 storage variable, despite the required `unsafeSkipStorageCheck`.

Recommended implementation:

1. Add a test that reads storage-layout metadata from the Hardhat build info for:
   - `contracts/production/CosmicSignatureGame.sol:CosmicSignatureGame`
   - `contracts/production/CosmicSignatureGameV2.sol:CosmicSignatureGameV2`
2. Assert that all carried-over variables have identical slot and offset in both layouts:
   - `ethDonationWithInfoRecords`
   - `lastBidderAddress`
   - `lastCstBidderAddress`
   - `bidderAddresses`
   - `biddersInfo`
   - champion fields
   - round and auction fields not intentionally repurposed
   - prize parameters
   - token / NFT / wallet addresses
   - charity and marketing fields
3. Explicitly assert the three intentional V2 differences:
   - V1 `cstDutchAuctionDurationDivisor` slot equals V2 `cstDutchAuctionDuration` slot.
   - V1 `bidCstRewardAmount` slot equals V2 `bidCstRewardAmountMultiplier` slot.
   - V2 `cstDutchAuctionDurationChangeDivisor` occupies the first old-gap slot.
4. Assert the V2 gap length is reduced by exactly one slot.

Acceptance criteria:

- The test fails if any non-repurposed field changes slot or offset.
- The test does not rely on OpenZeppelin accepting the upgrade.
- The test explicitly names every intentionally repurposed slot, so future reviewers do not have to infer it.

Suggested file:

- New `test/tests-src/CosmicSignatureGameV2-StorageLayout.js`

## P0: Mainnet-Fork Upgrade Test

Findings covered: O-1, O-2, O-3

Goal: rehearse the exact Arbitrum One upgrade on a fork using real state.

Recommended setup:

- Fork Arbitrum One at a block after round 0 is claimable.
- Impersonate the current owner (`0x14C82cE4E5713E88C9462680e9C02BF4A3089871`) or run with the owner key in a private rehearsal environment.
- Use the real proxy address `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2`.

Test steps:

1. Snapshot all critical V1 getters before the upgrade:
   - owner
   - round state
   - all token / NFT / wallet addresses
   - prize parameters
   - bid parameters
   - champion state
   - storage-array lengths and representative mappings
2. Complete round 0 by calling `claimMainPrize` from the permitted account, or impersonate the required caller in the fork.
3. Freeze round 1 with `setRoundActivationTime(221845392000)` before any round-1 bid.
4. Run `upgradeProxy(..., { kind: "uups", call: "initializeV2", unsafeAllowRenames: true, unsafeSkipStorageCheck: true })`.
5. Assert the new implementation address is different and nonzero.
6. Assert all carried-over state remains unchanged except values intentionally changed by `claimMainPrize`.
7. Assert V2-initialized values:
   - `cstDutchAuctionDuration() == 43200`
   - `cstDutchAuctionDurationChangeDivisor() == 250`
   - `bidCstRewardAmountMultiplier() == 10800000000000000000000000000000000000000000000`
   - `timeoutDurationToClaimMainPrize() == 172800`
8. Assert old selectors revert or are unavailable:
   - `cstDutchAuctionDurationDivisor()`
   - `cstRewardAmountForBidding()` / `bidCstRewardAmount()`
   - 2-argument `bidWithEth(int256,string)`
9. Activate round 1 and assert `getNextEthBidPrice()` is nonzero.

Acceptance criteria:

- The fork test passes without editing source code.
- Any storage mismatch or missing V2 initializer effect fails the test.
- The test records the block number used for the rehearsal.

Suggested files:

- New `test/tests-src/CosmicSignatureGameV2-MainnetFork.js`
- Optional runner script under `tasks/runners/` or `scripts/` if a fork command is standardized.

## P0: V2 Full-Round Functional Suite

Findings covered: T-0, E-1, E-2, E-4, C-2

Goal: run actual V2 gameplay after upgrading from V1.

Recommended structure:

1. Deploy V1 with the normal fixture.
2. Place at least one V1 ETH bid.
3. Advance to `mainPrizeTime`.
4. Claim round 0.
5. Upgrade to V2 via `upgradeProxy` + `initializeV2`.
6. Place V2 bids and complete a V2 round.

Required coverage:

- `bidWithEth(int256,string,uint256)` succeeds with `bidCstRewardAmountMinLimit_ = 0`.
- `bidWithEthAndDonateToken(int256,string,uint256,IERC20,uint256)` succeeds.
- `bidWithEthAndDonateNft(int256,string,uint256,IERC721,uint256)` succeeds.
- `receive()` still places an ETH bid and uses min reward 0.
- `bidWithCst(uint256,string,uint256)` succeeds after the first ETH bid.
- `bidWithCstAndDonateToken(uint256,string,uint256,IERC20,uint256)` succeeds.
- `bidWithCstAndDonateNft(uint256,string,uint256,IERC721,uint256)` succeeds.
- `bidCstRewardAmountMinLimit_` above the current reward reverts with `BidCstRewardAmountMinLimitNotReached`.
- `BidPlaced` uses the V2 event signature and includes:
  - `bidCstRewardAmount`
  - `cstDutchAuctionDuration`
  - `mainPrizeTime`
- `getBidCstRewardAmount()` equals `getBidCstRewardAmountAdvanced(0)`.
- `claimMainPrize()` succeeds for a V2 round and emits `MainPrizeClaimed`.
- Existing prize events remain parseable and unchanged.

Acceptance criteria:

- The suite proves at least one complete V2 round can start, accept mixed bids, and end.
- It explicitly checks the new ABI, not just upgrade mechanics.

Suggested file:

- New `test/tests-src/CosmicSignatureGameV2-Gameplay.js`

## P0: Extend Fuzz Testing To V2

Findings covered: T-0, E-1, E-2, E-3, E-4, C-1

Status: IMPLEMENTED. `test/tests-src/FuzzTest.js` is now a single unified, model-based campaign that fuzzes V1, performs the real UUPS upgrade to V2 mid-campaign (with full state-diff assertions), and continues fuzzing V2. The old `FuzzTestV2.js` has been absorbed/retired. The engine lives under `test/src/fuzz/` (`FuzzEngine`, `GameModel`, `ShadowState`, `GameAbiAdapter`, `Invariants`, `UpgradePhase`, and the `actions/` registry). Run it via `test/runners/fuzz-1.bash` (production-like + assert-enabled, optional multi-seed soak via `FUZZ_MULTI`).

Goal: run broad randomized gameplay after upgrading to V2.

Implemented approach:

- A single phased campaign: deploy V1, fuzz several complete rounds, upgrade to V2 (real `upgradeProxy` + `initializeV2`), then fuzz several more V2 rounds. The `GameAbiAdapter` routes every bid to the V1 or V2 signature automatically.
- The campaign is model-based: a JS `GameModel` reimplements the deterministic on-chain math exactly (ETH/CST Dutch prices, the V2 sqrt CST reward, the V2 `cstDutchAuctionDuration` shrink/grow formulas, V1-clamp-vs-V2 `mainPrizeTime`, the endurance/chrono champion automaton, and round-advance values), so every action asserts its exact event fields and exact ledger deltas.

Required V2 action updates:

- ETH bid actions call `bidWithEth(randomWalkNftId, message, 0, { value })`.
- CST bid actions call `bidWithCst(maxPrice, message, 0)`.
- Donation bid actions include the new `bidCstRewardAmountMinLimit_` parameter in the correct position.
- Negative probes include too-high `bidCstRewardAmountMinLimit_`.

Required V2 invariants:

- CST total supply still equals tracked balances for the known holder set.
- `getBidCstRewardAmount() == getBidCstRewardAmountAdvanced(0)`.
- `getNextCstBidPrice() == getNextCstBidPriceAdvanced(0)`.
- `cstDutchAuctionDuration > 0` under normal configuration.
- ETH bids do not increase `cstDutchAuctionDuration`.
- CST bids do not decrease `cstDutchAuctionDuration`.
- If `getNextCstBidPrice() == 0`, a CST bid burns zero or near-zero CST and mints only the computed reward.
- The game can still complete rounds after many mixed ETH / CST bids.
- `mainPrizeTime` remains monotonic nondecreasing within a round.
- `roundNum` remains monotonic.
- No successful action sends ETH to an address that is not expected to receive ETH (main prize, prizes wallet, charity, staking wallet, refund recipient).

Acceptance criteria (met):

- The campaign runs with `SKIP_LONG_TESTS=true` quickly enough for CI (quick profile).
- A long soak runs manually with a printed seed; `FUZZ_V1_ROUNDS` / `FUZZ_V2_ROUNDS` / `FUZZ_ACTORS` / `FUZZ_CHAOS` tune it.
- Re-running with `FUZZ_SEED` reproduces failures (the seed is printed on every failure, and the last ~80 actions are dumped as a trace).
- End-of-run coverage floors assert that every registered action was exercised and (in the long profile) that core actions each succeeded at least once, so a silently-dead action fails the test.

File: `test/tests-src/FuzzTest.js` (engine under `test/src/fuzz/`).

## P1: Targeted CST Economic Property Tests

Findings covered: E-1, E-2, E-3

Goal: quantify the new CST economics and catch accidental extreme behavior.

Tests to add:

1. Zero-price CST bid reward test:
   - Create a V2 round.
   - Advance until `getNextCstBidPrice() == 0`.
   - Place a CST bid.
   - Assert bidder CST balance increases by exactly `bidCstRewardAmount`.
   - Assert `paidCstPrice` in `BidPlaced` is 0.
   - Assert `lastCstBidderAddress` becomes the bidder.

2. Net CST mint bound test:
   - Simulate a round with alternating waits and CST bids.
   - Track total CST minted by bid rewards minus CST burned by CST bids.
   - Assert the result is within an expected bound chosen by the product/economic design.
   - This test may start as a reporting test until a hard bound is agreed.

3. ETH-bids-to-zero test:
   - Start with a positive CST price and elapsed CST auction time near the duration boundary.
   - Place sequential ETH bids.
   - Assert CST price is nonincreasing after each ETH bid.
   - Record how many ETH bids are required to reach zero under default parameters.

4. Multi-round drift test:
   - Run a net-ETH-heavy scenario for many rounds and assert `cstDutchAuctionDuration` approaches but does not fall below the reduction floor.
   - Run a net-CST-heavy scenario for many rounds and assert duration grows monotonically without overflow.
   - Add a test with owner-adjusted parameters to document dangerous misconfiguration boundaries.

Acceptance criteria:

- The tests make the intended economics explicit.
- Future parameter changes break tests if they dramatically change the economics.

Suggested file:

- New `test/tests-src/CosmicSignatureGameV2-Economics.js`

## P1: Late-Bid / Same-Block Claim Tests

Findings covered: E-4

Goal: document and verify the new end-game behavior introduced by `mainPrizeTime += increment`.

Tests to add:

1. Late bid leaves `mainPrizeTime` in the past:
   - Create a V2 round with at least one bid.
   - Advance past `mainPrizeTime + mainPrizeTimeIncrement`.
   - Place a bid.
   - Assert the new `mainPrizeTime` can still be `<= block.timestamp`.

2. Bidder can bid and then claim immediately:
   - Under the same state, place a bid from a new bidder.
   - Immediately call `claimMainPrize` from that bidder.
   - Assert success.

3. Non-last bidder cannot claim before timeout:
   - Same state, but call `claimMainPrize` from a different account.
   - Assert `MainPrizeClaimDenied` until the timeout expires.

4. Timeout path still works:
   - Advance beyond `mainPrizeTime + timeoutDurationToClaimMainPrize`.
   - Assert any account can claim.

Acceptance criteria:

- The test proves this is intentional behavior, not an accidental untested edge.
- No ETH is lost or stuck in any scenario.

Suggested file:

- New `test/tests-src/CosmicSignatureGameV2-LateClaim.js`

## P1: Production-Like Guard And Misconfiguration Tests

Findings covered: O-2, C-1

Goal: document exactly which protections exist in production and which exist only with asserts enabled.

Tests to add:

1. `initializeV2` round-0 guard test in production-like build:
   - Run with `ENABLE_HARDHAT_PREPROCESSOR` unset or `ENABLE_ASSERTS=false`.
   - Construct an inactive round-0 state where upgrade authorization can pass.
   - Assert `initializeV2` does not enforce `roundNum > 0` by itself.
   - Mark this as a documentation test / known footgun.

2. `initializeV2` assert test in assert-enabled build:
   - Run with `ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true`.
   - Assert the disabled production guard triggers as a panic when assertions are compiled in.

3. Owner misconfiguration:
   - `setCstDutchAuctionDuration(0)` makes normal CST price zero.
   - `getNextCstBidPriceAdvanced(negativeOffset)` can revert with division by zero under zero duration.
   - `setCstDutchAuctionDurationChangeDivisor(0)` makes the next ETH bid revert.
   - Setting `cstDutchAuctionDurationChangeDivisor > cstDutchAuctionDuration` produces dangerous duration collapse behavior.

Acceptance criteria:

- The test suite documents current behavior without silently relying on comments.
- The risks are visible to anyone changing configuration setters.

Suggested file:

- New `test/tests-src/CosmicSignatureGameV2-GuardsAndMisconfig.js`

## P2: CI Tooling And Static Analysis

Findings covered: O-1, T-0

Goal: make upgrade safety checks repeatable.

Recommended additions:

- Add a CI step for `slither/slither-check-upgradeability-CosmicSignatureGameV2.bash`.
- Store the Slither output as a CI artifact.
- Add a command that compiles with `ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true` and runs the V2 guard / invariant subset.
- Add a command that compiles production-like and runs the main V2 gameplay suite.
- Add a mainnet-fork job that can be run manually before the upgrade window.

Acceptance criteria:

- A reviewer can run one documented command and get all P0 checks.
- CI shows whether V2 upgradeability checks have been executed.

## P2: Echidna Or Foundry Invariant Harness

Findings covered: E-1, E-2, E-3, C-1

Goal: complement the Hardhat fuzzer with a property-testing engine better suited for invariant exploration.

Suggested invariants:

- `cstDutchAuctionDuration` never becomes zero under valid owner parameters.
- ETH bids monotonically reduce or preserve `cstDutchAuctionDuration`.
- CST bids monotonically increase or preserve `cstDutchAuctionDuration`.
- `getNextCstBidPrice()` never exceeds the relevant CST auction beginning price.
- CST total supply equals initial supply plus all mints minus all burns.
- No sequence of public calls causes `claimMainPrize` to become permanently unavailable.
- No unprivileged caller can transfer ETH out except through documented prize/refund paths.

Suggested approach:

- Start with a small harness around V2 bidding and claiming only.
- Add owner parameter mutation later, with assumptions limiting values to documented safe ranges.
- Keep one profile with valid owner parameters and one profile that intentionally explores misconfiguration.

Acceptance criteria:

- The harness finds counterexamples if duration or reward formulas are changed incorrectly.
- Counterexamples produce compact sequences that can be ported back to Hardhat regression tests.

## Suggested Execution Order

1. P0 storage-layout equivalence test.
2. P0 mainnet-fork upgrade test.
3. P0 V2 full-round functional suite.
4. P0 V2 fuzz campaign.
5. P1 targeted CST economics tests.
6. P1 late-bid / same-block claim tests.
7. P1 production-like guard / misconfiguration tests.
8. P2 CI and Echidna / Foundry hardening.

Do not treat the upgrade as fully validated until at least the four P0 items pass.
