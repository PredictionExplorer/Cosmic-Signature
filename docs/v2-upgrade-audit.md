# CosmicSignatureGameV2 Upgrade Safety Audit

## Scope

This audit reviews the safety of upgrading the deployed `CosmicSignatureGame` proxy to `CosmicSignatureGameV2` as soon as round 0 ends. It focuses on direct disaster scenarios, such as contract draining, permanent game stalls, storage corruption, broken upgrade authorization, and subtle protocol-logic risks introduced by V2.

Related documents:

- `docs/v1-refactorings.md` covers V1 source refactorings and their ABI / behavior effects.
- `docs/v2-vs-v1-changes.md` covers all ABI and externally visible behavior changes in V2.
- `docs/v2-upgrade-procedure.md` covers the operational runbook for the Arbitrum One upgrade.
- `docs/v2-upgrade-recommended-tests.md` lists the additional tests this audit recommends before mainnet execution.

## Executive Summary

No direct new fund-draining vector was found in `CosmicSignatureGameV2`. The prize distribution path in `MainPrizeV2` is functionally identical to refactored V1: claim authorization, prize amount math, ETH transfers, CST minting, NFT minting, raffle winner selection, and next-round preparation are unchanged. The only ETH transfer added to bidding remains the existing V1 overpayment refund, protected by `nonReentrant` and performed after bid state changes.

No reachable hard stall was found under the default V2 configuration. `claimMainPrize` remains available, the timeout claim path remains unchanged, and the default V2 bid paths do not hit division-by-zero or always-revert conditions.

The main risks are:

- The production upgrade runbook intentionally disables OpenZeppelin's storage-layout check.
- Two important V2 upgrade preconditions are currently documented / asserted only, not enforced by runtime reverts in production builds.
- V2 intentionally changes the CST auction and bid-reward economics in ways that create new free-bid and MEV-style edge cases.
- V2 gameplay is not currently covered by a full functional or fuzz campaign.

Severity scale: Critical, High, Medium, Low, Informational.

## Findings

### O-1: Storage layout validation is intentionally skipped during the production upgrade

Severity: High  
Category: Operational / upgrade safety  
Status: Requires explicit operational controls; no source fix made

The Arbitrum One upgrade configuration in `tasks/config/upgrade-cosmic-signature-game-config-arbitrumOne-CosmicSignatureGameV2.json` must temporarily set:

```json
"unsafeAllowRenames": true,
"unsafeSkipStorageCheck": true
```

This is documented in `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` and repeated in `docs/v2-upgrade-procedure.md`.

With `unsafeSkipStorageCheck`, OpenZeppelin Hardhat Upgrades does not protect the upgrade from a storage-layout mismatch. The layout reasoning appears correct:

- `CosmicSignatureGameStorage.cstDutchAuctionDurationDivisor` is intentionally repurposed as `CosmicSignatureGameStorageV2.cstDutchAuctionDuration`.
- `CosmicSignatureGameStorage.bidCstRewardAmount` is intentionally repurposed as `CosmicSignatureGameStorageV2.bidCstRewardAmountMultiplier`.
- `CosmicSignatureGameStorageV2.cstDutchAuctionDurationChangeDivisor` is appended in the first slot that used to belong to the private storage gap.
- The persistent gap shrinks from `uint256[1 << 30]` in the refactored V1 source to `uint256[(1 << 30) - 1]` in V2.
- `CosmicSignatureGameV2.initializeV2()` overwrites the two repurposed slots immediately during `upgradeToAndCall`.

But because the tooling check is skipped, a mistake in this reasoning would be silent and could corrupt live state at the moment of upgrade.

Impact if wrong: catastrophic storage corruption is possible in principle, including wrong token / wallet addresses, broken round state, broken owner state, or broken prize accounting. I did not find evidence that the current layout is wrong, but the protection is manual rather than tool-enforced.

Suggested mitigations to document and test:

- Add a storage-layout equivalence test independent of OpenZeppelin's skipped check.
- Add a mainnet-fork upgrade test using the real proxy state.
- Immediately restore `unsafeAllowRenames` and `unsafeSkipStorageCheck` to `false` after the upgrade.
- Preserve the updated `.openzeppelin` manifest after the upgrade.

### O-2: `initializeV2` production guard for "round 0 is already complete" is assert-only

Severity: High  
Category: Upgrade safety / latent footgun  
Status: Dangerous if reused outside the intended round-boundary upgrade

`CosmicSignatureGameV2.initializeV2()` is documented and annotated as requiring a prior V1 deployment and a completed first round. However, the important checks are production no-ops:

- `CosmicSignatureGameV2._checkIfPrevVersionWasInitialized()` only contains disabled `#enable_asserts` logic.
- `BiddingBaseV2._checkNonFirstRound()` only contains a disabled `#enable_asserts assert(roundNum > 0)`.

In production, those checks do not revert. The real protection for the deployed Arbitrum One proxy is V1's `_authorizeUpgrade`, which requires `onlyOwner` and `_onlyRoundIsInactive`. Because round 0 is currently active with bids, the upgrade cannot be executed until `claimMainPrize` completes round 0.

That is sufficient for the planned mainnet path. It is not a general runtime guard.

Danger scenario:

- Someone deploys a new V1 proxy with no bids, or otherwise reaches a state where `roundNum == 0` and the round is inactive.
- The owner upgrades to V2.
- V2 no longer contains the round-0 ETH price fallback from V1.
- `BiddingV2.getNextEthBidPriceAdvanced()` can return zero when `ethDutchAuctionBeginningBidPrice == 0`, and the first ETH bid can misbehave.

Impact: broken V2 deployment if the upgrade precondition is violated. This is unlikely for the current Arbitrum One proxy, but it is a load-bearing assumption.

Suggested mitigation:

- Consider changing `initializeV2()` to enforce `roundNum > 0` with a real revert, not only a disabled assertion.
- Add tests that document the current production behavior and the intended precondition.

### O-3: V2 relies on `ethDutchAuctionBeginningBidPrice != 0` after round 0

Severity: Informational  
Category: Upgrade invariant  
Status: Documented precondition

V2 removes the first-round fallback:

```solidity
if (nextEthBidPrice_ == 0) {
    nextEthBidPrice_ = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
}
```

That fallback exists in V1 but not in V2. V2 correctness for round 1 and later relies on `ethDutchAuctionBeginningBidPrice` being nonzero. This holds after round 0 completes because the first ETH bid in round 0 sets:

```solidity
ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
```

and `_prepareNextRound` does not reset it.

Impact: no issue for the documented Arbitrum One upgrade path. This becomes dangerous only if the upgrade is attempted before a round has completed or in a fresh deployment state.

Suggested tests:

- Assert the real proxy has nonzero `ethDutchAuctionBeginningBidPrice` before upgrade.
- In the fork upgrade test, assert the upgraded V2 proxy returns a nonzero `getNextEthBidPrice()` once round 1 is activated.

### E-1: CST can be minted by zero-price CST bids once the CST Dutch auction reaches zero

Severity: Medium  
Category: Economic / game logic  
Status: By-design risk, should be quantified and monitored

In V2, every successful bid computes a bidder reward:

```text
bidCstRewardAmount = floor(sqrt(elapsedDuration * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds))
```

For CST bids, the bidder burns `paidPrice_` and receives `bidCstRewardAmount_`. `paidPrice_` comes from the CST Dutch auction and can reach zero. Once `getNextCstBidPrice()` reaches zero, a bidder can place a CST bid with no CST burn, mint the reward, and become `lastCstBidderAddress`.

That gives the bidder:

- newly minted CST for free,
- the Last CST Bidder position,
- a chance to receive the Last CST Bidder secondary prize (`cstPrizeAmount` and a Cosmic Signature NFT) if the round ends before another CST bidder replaces them.

Comment-202606175 already acknowledges the possibility of a free or cheaper-than-reward CST bid in the late-claim window. This finding expands the risk: the zero-price path is also a CST faucet and secondary-prize farming opportunity.

Impact:

- Potential CST inflation if zero-price CST bids are common.
- Potential farming of the Last CST Bidder secondary prize.
- Potential divergence between expected CST economic balance and actual behavior.

Why this does not directly drain ETH:

- A zero-price CST bid does not withdraw ETH.
- Main-prize and secondary-prize ETH flows are unchanged.
- The game still requires normal `claimMainPrize` logic to distribute ETH.

Suggested mitigations / monitoring:

- Quantify maximum expected net CST minted per round under realistic bidding intervals.
- Monitor rounds where `paidCstPrice == 0` and `bidCstRewardAmount > 0`.
- Consider a minimum CST bid price, a zero-price reward cap, or a reward formula that depends on paid price if the economic effect is undesirable.

### E-2: ETH bids can push the CST Dutch auction price to zero abruptly

Severity: Medium  
Category: Economic / game logic  
Status: By-design lever, should be tested and monitored

Each V2 ETH bid reduces `cstDutchAuctionDuration`:

```solidity
uint256 newCstDutchAuctionDuration_ =
    (cstDutchAuctionDuration + 1) *
    cstDutchAuctionDurationChangeDivisor /
    (cstDutchAuctionDurationChangeDivisor + 1);
```

The CST auction start timestamp is not reset by ETH bids. `getNextCstBidPriceAdvanced()` computes the remaining time against the current stored duration. If elapsed time is already close to the duration, shrinking the duration can make remaining time non-positive, causing the CST bid price to become zero immediately.

Impact:

- ETH bidding can abruptly make CST bidding free.
- This enables E-1 earlier than users may expect.
- The behavior is externally visible in `getNextCstBidPrice()`, `getCstDutchAuctionDurations()`, and the new `BidPlaced` duration field.

Suggested tests:

- Simulate elapsed CST auction time near the duration boundary.
- Place one or more ETH bids.
- Assert and quantify how quickly the CST price reaches zero.

### E-3: `cstDutchAuctionDuration` now carries cross-round history and can drift to extremes

Severity: Medium  
Category: Economic / long-horizon correctness  
Status: By-design, with a long-tail arithmetic risk

V1 derived CST Dutch auction duration from:

```solidity
mainPrizeTimeIncrementInMicroSeconds / cstDutchAuctionDurationDivisor
```

V2 stores `cstDutchAuctionDuration` and changes it on every bid:

- ETH bids reduce it.
- CST bids increase it.
- It persists across rounds.

Consequences:

- Net ETH-heavy history can shrink the duration toward the reduction floor, approximately `cstDutchAuctionDurationChangeDivisor` seconds with the default formula and default divisor 250. Future CST auctions can then become very short, making CST bids cheap quickly.
- Net CST-heavy history can grow the duration without a configured maximum.
- The arithmetic is inside `unchecked` blocks. Overflow would require extreme long-horizon growth, but if it happened, the duration could wrap and make CST pricing nonsensical.

Impact:

- Persistent feedback loop between past bid mix and future CST pricing.
- Long-term economic state may diverge significantly from the intended 12-hour default.
- Very low likelihood arithmetic wrap over realistic horizons, but nonzero if parameters are changed or the system runs for a very long time.

Suggested mitigations:

- Add a maximum and minimum allowed `cstDutchAuctionDuration`.
- Add owner-setter validation that `cstDutchAuctionDurationChangeDivisor > 0` and is compatible with the current duration.
- Add multi-round property tests that stress thousands of ETH/CST bid sequences.

### E-4: Late bids after `mainPrizeTime` can become same-block bid-and-claim races

Severity: Medium  
Category: Game fairness / MEV  
Status: Intentional behavior change, should be documented and tested

V1 extended main-prize time like this:

```solidity
uint256 mainPrizeCorrectedTime_ = Math.max(mainPrizeTime, block.timestamp);
mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;
```

V2 changed this to:

```solidity
mainPrizeTime += mainPrizeTimeIncrement_;
```

If `mainPrizeTime` is already in the past and a bidder places a new bid, V2 may leave `mainPrizeTime` in the past. That bidder can then call `claimMainPrize` immediately, potentially in the same block / bundle.

Impact:

- End-game behavior changes from a timed re-auction after a late bid to a snipe race.
- MEV searchers can bid and claim atomically if the previous last bidder does not claim.
- This does not directly drain funds because the bidder must become the last bidder and pass the normal claim checks, but it changes who can realistically capture the main prize in late windows.

Rationale in source:

- Comment-202606175 explains that the V1 clamp allowed repeated cheap CST bids to keep moving `mainPrizeTime` into the future, potentially delaying claims indefinitely.
- V2's behavior mitigates that griefing vector at the cost of more aggressive late-window competition.

Suggested tests:

- Explicitly demonstrate bid-then-claim when `mainPrizeTime` is sufficiently far in the past.
- Assert no unauthorized actor can claim before becoming last bidder or before timeout.
- Decide whether this behavior should be surfaced in user-facing docs.

### C-1: Owner can misconfigure CST duration parameters into free-bid or view-revert states

Severity: Low  
Category: Owner misconfiguration  
Status: No unprivileged trigger found

`getNextCstBidPriceAdvanced()` divides by `cstDutchAuctionDuration` after checking whether the remaining duration is positive. With normal calls (`currentTimeOffset_ == 0`) and default configuration, this is safe.

Misconfiguration cases:

- `setCstDutchAuctionDuration(0)` makes normal CST bids free because remaining duration is immediately non-positive.
- `setCstDutchAuctionDuration(0)` can make `getNextCstBidPriceAdvanced(negativeOffset)` divide by zero.
- `setCstDutchAuctionDurationChangeDivisor(0)` can make the next ETH bid divide by zero.
- `setCstDutchAuctionDurationChangeDivisor(...)` values larger than the current duration violate the caveat in Comment-202606057 and can collapse duration behavior unexpectedly.

Impact:

- Owner-only risk.
- Can distort CST pricing or make some advanced views revert.
- Does not directly drain ETH.

Suggested mitigation:

- Add setter validation for nonzero duration, nonzero change divisor, and sane min/max bounds.

### C-2: New bid reward minimum check changes revert ordering

Severity: Informational  
Category: ABI / behavior compatibility  
Status: Expected

V2 computes and checks `bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_` before other bid validations. A transaction that violates multiple conditions can now revert with `BidCstRewardAmountMinLimitNotReached` instead of an older error such as `InsufficientReceivedBidAmount`.

Impact:

- No safety issue if callers pass `0` as the minimum.
- Off-chain tooling and tests should be aware of the new first-failing condition.

### C-3: Bid reward formula arithmetic appears safe under realistic conditions

Severity: Informational  
Category: Arithmetic  
Status: No realistic overflow or division-by-zero found

`getBidCstRewardAmountAdvanced()` computes:

```solidity
uint256 radicand_ =
    uint256(elapsedDuration_) *
    bidCstRewardAmountMultiplier /
    mainPrizeTimeIncrementInMicroSeconds;
```

With default parameters, overflow would require an unrealistic elapsed duration. `mainPrizeTimeIncrementInMicroSeconds` starts nonzero and grows over time; it is not reset to zero by the protocol.

Impact:

- No immediate issue.
- First bidder exactly at activation can receive a zero reward, which is expected and emits no CST mint in V2.

### T-0: V2 gameplay is not yet covered by a functional or fuzz test campaign

Severity: High  
Category: Test coverage / release confidence  
Status: Must be addressed before considering the upgrade low-risk

`test/tests-src/CosmicSignatureGame-3.js` upgrades to V2 and checks:

- proxy address stability,
- implementation address changed,
- `initializeV2` cannot be called twice,
- `cstDutchAuctionDurationChangeDivisor` initializes to 250 and can be set,
- implementation storage is uninitialized,
- unauthorized and active-round upgrades revert.

But it does not:

- place a V2 ETH bid,
- place a V2 CST bid,
- exercise any V2 donate-and-bid path,
- assert new `BidPlaced` fields,
- claim a V2 main prize,
- test free / zero-price CST bids,
- test the `mainPrizeTime += increment` behavior,
- run fuzz or invariant testing after upgrading to V2.

`test/tests-src/FuzzTest.js` currently uses the V1 ABI and deploys V1 through the default deployment helper path. It does not run against V2.

Impact:

- The highest-risk V2 changes are not covered by automated gameplay tests.
- This is the largest blocker to saying the upgrade is "absolutely" safe.

Suggested response:

- Implement the P0 tests in `docs/v2-upgrade-recommended-tests.md` before mainnet execution.

## Overall Upgrade Safety Assessment

The upgrade looks structurally safe if and only if all documented operational preconditions are followed:

1. Do not upgrade before round 0 is claimed.
2. Freeze round 1 before any round-1 bid.
3. Execute `upgradeToAndCall` with `initializeV2`.
4. Verify storage values and carried-over state immediately after upgrade.
5. Reopen bidding only after the V2 ABI and indexers are deployed.

The main unresolved confidence gap is test coverage, not an identified direct drain or stall bug. The recommended P0 tests should be treated as release blockers for a production upgrade.
