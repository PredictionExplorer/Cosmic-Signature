# CosmicSignatureGameV2 Vs Refactored V1: ABI And Externally Visible Behavior Changes

## Introduction

This document compares `CosmicSignatureGameV2` (the new contracts on the `v2` branch) against the refactored V1 `CosmicSignatureGame` on the same branch. The baseline for "V1" here is the refactored V1 described in `v1-refactorings.md` (notably, it already uses the name `bidCstRewardAmount` instead of the deployed name `cstRewardAmountForBidding`).

V2 is implemented as a parallel inheritance hierarchy. New sources (all under `contracts/production/`):

- `CosmicSignatureGameV2.sol`, `CosmicSignatureGameStorageV2.sol`, `BiddingBaseV2.sol`, `BiddingV2.sol`, `BidStatisticsV2.sol`, `MainPrizeBaseV2.sol`, `MainPrizeV2.sol`, `SystemManagementV2.sol`, `EthDonationsV2.sol`, `NftDonationsV2.sol`, `SecondaryPrizesV2.sol`
- Interfaces: `ICosmicSignatureGameV2.sol`, `IBiddingV2.sol`, `IBiddingBaseV2.sol`, `IMainPrizeV2.sol`, `IMainPrizeBaseV2.sol`, `ISystemManagementV2.sol`, `ISystemEventsV2.sol`

The following V2 sources were verified to be functionally identical to their refactored V1 counterparts (only inheritance bases, comments, and dead code differ): `BidStatisticsV2`, `SecondaryPrizesV2`, `EthDonationsV2`, `NftDonationsV2`, `MainPrizeV2` (the entire `claimMainPrize` prize-distribution flow, validations, revert reasons, and events are unchanged; the one exception is the `_prepareNextRound` overflow hardening described in change 7 below), and most of `BiddingBaseV2` and `SystemManagementV2`. Everything that differs is listed below.

V2 is deployed by **upgrading the existing proxy** (UUPS `upgradeToAndCall`), so "ABI changes" below describe what changes for callers of the proxy `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2` once it is upgraded. See `v2-upgrade-procedure.md` for the procedure, `v2-upgrade-audit.md` for the safety audit, and `v2-upgrade-recommended-tests.md` for additional validation work recommended before the mainnet upgrade.

## ABI Changes

### 1. Bid methods gained a `bidCstRewardAmountMinLimit_` parameter

All six bid entry points have new signatures (new selectors; the old selectors no longer exist on the upgraded proxy):

| Refactored V1 | V2 |
|---|---|
| `bidWithEth(int256 randomWalkNftId_, string message_)` | `bidWithEth(int256 randomWalkNftId_, string message_, uint256 bidCstRewardAmountMinLimit_)` |
| `bidWithEthAndDonateToken(int256, string, IERC20, uint256)` | `bidWithEthAndDonateToken(int256, string, uint256 bidCstRewardAmountMinLimit_, IERC20, uint256)` |
| `bidWithEthAndDonateNft(int256, string, IERC721, uint256)` | `bidWithEthAndDonateNft(int256, string, uint256 bidCstRewardAmountMinLimit_, IERC721, uint256)` |
| `bidWithCst(uint256 priceMaxLimit_, string message_)` | `bidWithCst(uint256 priceMaxLimit_, string message_, uint256 bidCstRewardAmountMinLimit_)` |
| `bidWithCstAndDonateToken(uint256, string, IERC20, uint256)` | `bidWithCstAndDonateToken(uint256, string, uint256 bidCstRewardAmountMinLimit_, IERC20, uint256)` |
| `bidWithCstAndDonateNft(uint256, string, IERC721, uint256)` | `bidWithCstAndDonateNft(uint256, string, uint256 bidCstRewardAmountMinLimit_, IERC721, uint256)` |

`bidCstRewardAmountMinLimit_` is the minimum CST reward amount the bidder is willing to accept (it may be zero). The plain `receive()` ETH bid path still exists and passes a min limit of 0.

### 2. New view methods

- `getBidCstRewardAmount() returns (uint256)`
- `getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) returns (uint256)`

They return the CST amount that would currently be minted as the bid reward (see the reward formula below).

### 3. Public storage getters renamed / added (slots repurposed)

| Refactored V1 | V2 | Storage slot |
|---|---|---|
| `cstDutchAuctionDurationDivisor()` | `cstDutchAuctionDuration()` | Same slot, repurposed (`@custom:oz-renamed-from cstDutchAuctionDurationDivisor`) |
| `bidCstRewardAmount()` | `bidCstRewardAmountMultiplier()` | Same slot, repurposed (`@custom:oz-renamed-from bidCstRewardAmount`) |
| — | `cstDutchAuctionDurationChangeDivisor()` | New variable, placed in the first slot of V1's storage gap |

The meaning of the values changes, not just the names: the old divisor slot now stores a duration in seconds, and the old fixed-reward slot now stores a multiplier. `initializeV2()` overwrites both during the upgrade (see the upgrade document). `__gap_persistent` shrank by 1 slot to `uint256[(1 << 30) - 1]` to compensate for the appended variable; all other storage is bit-for-bit compatible with V1.

### 4. Configuration setters renamed / added / removed (`SystemManagementV2`)

| Refactored V1 | V2 |
|---|---|
| `setCstDutchAuctionDurationDivisor(uint256)` | removed; replaced by `setCstDutchAuctionDuration(uint256)` |
| — | `setCstDutchAuctionDurationChangeDivisor(uint256)` (new) |
| `setBidCstRewardAmount(uint256)` | removed; replaced by `setBidCstRewardAmountMultiplier(uint256)` |

All other setters are unchanged (same names, same `onlyOwner` plus round-inactivity / no-bid-placed modifiers, same events).

### 5. Events

- `BidPlaced` gained two fields (topic 0 changes; indexed fields are unchanged):

```solidity
// Refactored V1:
event BidPlaced(
    uint256 indexed roundNum,
    address indexed lastBidderAddress,
    int256 paidEthPrice,
    int256 paidCstPrice,
    int256 indexed randomWalkNftId,
    string message,
    uint256 mainPrizeTime
);

// V2:
event BidPlaced(
    uint256 indexed roundNum,
    address indexed lastBidderAddress,
    int256 paidEthPrice,
    int256 paidCstPrice,
    int256 indexed randomWalkNftId,
    string message,
    uint256 bidCstRewardAmount,        // new: CST reward minted to the bidder (can be zero)
    uint256 cstDutchAuctionDuration,   // new: the CST Dutch auction duration after this bid
    uint256 mainPrizeTime
);
```

- `ISystemEventsV2` vs `ISystemEvents`:
  - `CstDutchAuctionDurationDivisorChanged(uint256)` removed; `CstDutchAuctionDurationChanged(uint256)` added (not emitted for the per-bid duration drift — only by the owner setter; the per-bid value is reported via `BidPlaced`).
  - `CstDutchAuctionDurationChangeDivisorChanged(uint256)` added.
  - `BidCstRewardAmountChanged(uint256)` removed; `BidCstRewardAmountMultiplierChanged(uint256)` added.
  - All other configuration events are unchanged.
- All bidding/prize events other than `BidPlaced` (`FirstBidPlacedInRound`, `MainPrizeClaimed`, `LastCstBidderPrizePaid`, `EnduranceChampionPrizePaid`, `ChronoWarriorPrizePaid`, `RaffleWinnerBidderEthPrizeAllocated`, `RaffleWinnerPrizePaid`, `EthDonated`, `EthDonatedWithInfo`, etc.) are unchanged.

### 6. Initializers

- `initialize(address ownerAddress_)` does not exist in V2 (calling its selector on the upgraded proxy reverts as an unknown function).
- New: `initializeV2()`, declared `reinitializer(2)`. It is executed once, as the `upgradeToAndCall` payload during the upgrade, and only sets the four V2 parameters (`cstDutchAuctionDuration`, `cstDutchAuctionDurationChangeDivisor`, `bidCstRewardAmountMultiplier`, `timeoutDurationToClaimMainPrize`). It deliberately omits `onlyOwner` (the V1 `_authorizeUpgrade` has just enforced `onlyOwner` within the same transaction, Comment-202606128).

### 7. New custom error

`CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(uint256 bidCstRewardAmount, uint256 bidCstRewardAmountMinLimit)` — thrown by every V2 bid path when the computed CST reward is below the bidder-provided minimum. (The error was added to the shared `CosmicSignatureErrors.sol` library; V1 code never throws it.)

## Externally Visible Behavior Changes

### 1. CST bid reward: fixed amount → time-dependent square-root formula

- Refactored V1 mints a fixed `bidCstRewardAmount` (100 CST by default) to the bidder on **every** bid (ETH or CST).
- V2 computes the reward at bid time:

```text
elapsedDuration   = block.timestamp - (last bid timestamp in this round, or roundActivationTime if no bid yet)
bidCstRewardAmount = floor(sqrt(elapsedDuration * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds))
```

- With the default `bidCstRewardAmountMultiplier` (`3 * (1 ether)^2 * INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND` = 1.08e46) and the first-round time increment, the reward is approximately: 0 CST after 0 seconds, ~1.73 CST after 1 second, ~13.4 CST after 60 seconds, ~104 CST after 1 hour, ~509 CST after 1 day (slightly smaller in later rounds as `mainPrizeTimeIncrementInMicroSeconds` grows ~1% per round).
- When the computed reward is zero (e.g., two bids in the same second), V2 skips the mint entirely. Observable consequences: no zero-value CST `Transfer` mint event, and for a CST bid the burn is performed via `token.burn(bidder, paidPrice)` instead of `token.mintAndBurnMany([burn paid, mint reward])`. (Corner case: V1's `mintAndBurnMany` spec with value `-0` would actually be treated as a mint of zero, Comment-202606074; V2's `burn` burns unconditionally.)
- Economic rationale: rewarding bursts of rapid bids with a fixed 100 CST per bid was free CST inflation; the square-root formula mitigates that.

### 2. New revert condition, checked first in every bid path

In both `_bidWithEth` and `_bidWithCst`, V2 computes the CST reward and validates `bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_` **before any other validation**:

- Before the ETH price sufficiency check (`InsufficientReceivedBidAmount`) and the Random Walk NFT checks in `_bidWithEth`.
- Before the CST price-max-limit check (`InsufficientReceivedBidAmount`) and the CST burn in `_bidWithCst`.

Consequently, a transaction that violates several conditions at once now reverts with `BidCstRewardAmountMinLimitNotReached` where refactored V1 would have reverted with `InsufficientReceivedBidAmount` (or another later error). Callers passing `bidCstRewardAmountMinLimit_ = 0` can never trigger the new error (the reward is always `>= 0`).

### 3. CST Dutch auction duration: derived value → stored, bid-driven value

- Refactored V1 derives the duration on the fly: `cstDutchAuctionDuration = mainPrizeTimeIncrementInMicroSeconds / cstDutchAuctionDurationDivisor` (≈ 12 hours initially; automatically grows ~1% per round together with the main prize time increment).
- V2 stores `cstDutchAuctionDuration` (initialized to 12 hours by `initializeV2`) and changes it on every bid, using the lossless formula pair of Comment-202606059 with `div = cstDutchAuctionDurationChangeDivisor` (default 250):
  - On each **ETH** bid the duration **shrinks**: `duration = (duration + 1) * div / (div + 1)` (≈ −0.4%).
  - On each **CST** bid the duration **grows**: `duration += duration / div` (≈ +0.4%).
- Externally visible consequences:
  - `getNextCstBidPriceAdvanced` declines linearly over the **stored** duration, so each ETH bid now causes a small instant drop of the current CST bid price (the remaining auction time shrinks). Comment-202606101 documents this as intended: it pushes bidders toward an equal number of ETH and CST bids, supporting CST's value.
  - `getCstDutchAuctionDurations()` returns the stored duration, which persists across rounds (V1's derived duration reset to the formula value each round and grew with the time increment; V2's evolves only through bids and `setCstDutchAuctionDuration`).
  - The new duration value is emitted with every `BidPlaced`.

### 4. `mainPrizeTime` extension no longer clamps to `block.timestamp`

`MainPrizeBaseV2._extendMainPrizeTime` (runs on every bid except the first of a round):

```solidity
// Refactored V1:
uint256 mainPrizeCorrectedTime_ = Math.max(mainPrizeTime, block.timestamp);
mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;

// V2:
mainPrizeTime += mainPrizeTimeIncrement_;
```

In V1, a bid placed after `mainPrizeTime` has already passed pushes the deadline to `block.timestamp + increment` — i.e., late bids fully reset the claim clock. In V2 a bid only adds one increment to the stored value, even if that value is in the past. Comment-202606175 explains the motivation: under V1 semantics someone could keep placing cheap (potentially free, given reward > price) CST bids within the claim timeout window and repeatedly reset the clock indefinitely; under V2 the deadline catches up only by fixed increments, so this manipulation loses effectiveness. Observable differences: `mainPrizeTime` values emitted in `BidPlaced` and used by `claimMainPrize`'s `MainPrizeEarlyClaim`/`MainPrizeClaimDenied` checks differ whenever a bid arrives after `mainPrizeTime` has passed.

### 5. First-round (round 0) logic removed

V2 can only run on a proxy where at least one bidding round has completed, and its code drops the round-0 special cases:

- `BiddingV2.getNextEthBidPriceAdvanced` no longer has the `ethDutchAuctionBeginningBidPrice == 0 → FIRST_ROUND_INITIAL_ETH_BID_PRICE` fallback. (`FIRST_ROUND_INITIAL_ETH_BID_PRICE` is unused by V2.) If V2 were ever active with `ethDutchAuctionBeginningBidPrice == 0`, the ETH bid price would be 0 and bidding would misbehave — this is why upgrading before round 0 completes is forbidden (see `v2-upgrade-procedure.md`).
- `BiddingBaseV2._checkNonFirstRound` is a production no-op (assert-only, Comment-202605294). In V1, `halveEthDutchAuctionEndingBidPrice` reverts with `CosmicSignatureErrors.FirstRound` during round 0; in V2 that revert can no longer occur (the condition is impossible post-upgrade, so this is a theoretical difference only).
- `initializeV2` carries the (assert-only) `_onlyNonFirstRound` modifier plus `_onlyIfPrevVersionWasInitialized`, documenting these assumptions.

### 6. Main prize claim timeout default doubled

`initializeV2()` sets `timeoutDurationToClaimMainPrize` to `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2` = **2 days** (V1 initialized it to 1 day, which is the current on-chain value). This is a state/parameter change applied during the upgrade rather than a code-path change: after `mainPrizeTime`, the last bidder now has 2 days of exclusivity before anyone may claim the main prize. The `claimMainPrize` code itself is unchanged.

### 7. `_prepareNextRound` overflow hardening: the owner can no longer brick `claimMainPrize` (Comment-202606235)

`MainPrizeV2._prepareNextRound` wraps its entire body in an `unchecked` block; refactored V1's `MainPrize._prepareNextRound` uses Solidity's default checked arithmetic:

```solidity
// Refactored V1 (checked): a large enough delay makes this addition overflow and revert with Panic(0x11).
_setRoundActivationTime(block.timestamp + delayDurationBeforeRoundActivation);

// V2 (inside `unchecked`): the addition wraps modulo 2^256 and never reverts.
unchecked {
    ...
    _setRoundActivationTime(block.timestamp + delayDurationBeforeRoundActivation);
}
```

Why this matters: `setDelayDurationBeforeRoundActivation` is callable by the owner at any time, including mid-round after a bid has been placed (Comment-202503106 — the `_onlyRoundIsInactive` guard is deliberately omitted on this setter). Under V1's checked arithmetic, a malicious or compromised owner could set `delayDurationBeforeRoundActivation` close to `type(uint256).max`, making the final addition in `_prepareNextRound` overflow. Because that line runs at the end of `claimMainPrize`, the overflow reverts the whole claim — including the rightful winner's during their exclusive window. The owner could then wait until `timeoutDurationToClaimMainPrize` elapsed (after which anyone may claim) and, in a single transaction, restore a non-overflowing delay and call `claimMainPrize`, stealing the main prize from the last bidder. V2's `unchecked` block makes the addition wrap instead of reverting, so the claim can never be blocked this way and the winner can always claim.

Externally visible consequences (overflow edge case only — normal operation is bit-for-bit identical):

- On V2, `claimMainPrize` succeeds even when `delayDurationBeforeRoundActivation` is large enough to overflow `block.timestamp + delayDurationBeforeRoundActivation`; the next round's `roundActivationTime` is set to the wrapped (mod 2^256) value. On refactored V1 the same call reverts with Panic(0x11).
- The `unchecked` block does **not** mask the division by `mainPrizeTimeIncrementIncreaseDivisor` in the same method: a zero divisor still reverts with Panic(0x12) on both V1 and V2. That setter keeps its `_onlyRoundIsInactive` guard, so it cannot be toggled mid-round and cannot reproduce the brick-then-steal scenario.
- This is the only behavioral difference between `MainPrizeV2` and refactored V1; the prize-distribution flow, authorization checks, revert reasons, and events are otherwise unchanged.

The hardening was applied to V2 only. Refactored V1's `MainPrize._prepareNextRound` retains checked arithmetic (it only gained cross-reference comments), so the protection takes effect once the proxy is upgraded to V2.

### 8. `PrizesWallet` swap after V2 upgrade

There is no separate `PrizesWalletV2`. The existing `PrizesWallet` source contains the same unchecked timeout hardening pattern for `block.timestamp + timeoutDurationToWithdrawPrizes` as the V2 game uses for next-round activation. A freshly deployed `PrizesWallet` can be assigned to `CosmicSignatureGameV2` with `setPrizesWallet` while the current round is inactive, including after one or more rounds have already completed.

The first round registered in that fresh wallet may be greater than zero. In production-like builds this is safe: the wallet starts recording beneficiaries and withdrawal timeouts from that round onward. In assert-enabled builds, the historical-continuity assertions in `PrizesWallet._registerRoundEnd` deliberately panic because previous rounds were registered in the old wallet; `PrizesWallet-2` covers both build modes.

This does not remove the benevolent-owner assumption. If the owner sets `timeoutDurationToWithdrawPrizes` to a very small value before a round ends, winner exclusivity for prizes in that round can be shortened. The current design accepts that risk rather than enforcing protocol-level min/max bounds on the timeout.

## Changes In Shared Sources Attributed To V2

These changes live in sources used by both games (or by neither), and the evidence ties them to V2:

- `production/CosmicSignatureGameStorage.sol` (V1 source): `__gap_persistent` shrunk from `uint256[1 << 255]` to `uint256[1 << 30]`. Motivation per `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md`: OpenZeppelin's upgrade validation crashed with an overflow on the huge gap. No V1 ABI/behavior impact.
- `production/libraries/CosmicSignatureErrors.sol`: new error `BidCstRewardAmountMinLimitNotReached` (only thrown by V2 code).
- `production/libraries/CosmicSignatureConstants.sol`: new constants `INITIAL_CST_DUTCH_AUCTION_DURATION` (12 hours), `DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR` (250), `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` (1.08e46), `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE_V2` (2 days). All are consumed by `CosmicSignatureGameV2.initializeV2` / referenced by V2 docs.
- `upgrade-prototype/CosmicSignatureGameOpenBid.sol` and `interfaces/ICosmicSignatureGameOpenBid.sol` (test-only): `initialize2()` renamed to `initializeV2()` and reimplemented as `reinitializer(_getInitializedVersion() + 1)` with an explicit `timesEthBidPrice == 0` re-initialization guard (Comment-202606084 documents why that pattern is test-only and why production hardcodes version 2). This aligns the upgrade-rehearsal prototype with the V2 upgrade flow and allows test sequences like V1 → V2 → OpenBid.
- `tests/BidderContract.sol`, `tests/MaliciousActorBase.sol` (and the related `tests/MaliciousBidder.sol` comment): gained `contractVersionNumber` / `setContractVersionNumber` and V2 call paths invoking the new V2 bid signatures. Test-only.
- New test contracts `tests/SelfDestructibleCosmicSignatureGameV2.sol` and `tests/SpecialCosmicSignatureGameV2.sol` (V2 counterparts of the V1 test games, using the `@custom:oz-upgrades-unsafe-allow missing-initializer` annotation).

## What Did Not Change

For clarity, the following externally visible behavior is identical between refactored V1 and V2:

- The `claimMainPrize` flow apart from the `_prepareNextRound` overflow hardening in change 7 above: claim authorization checks and revert reasons, prize amount math, raffle winner selection, the order of ETH/CST/NFT distributions, all prize events, and the rest of `_prepareNextRound` (including `mainPrizeTimeIncrementInMicroSeconds` growing ~1% per round and, for every non-overflowing delay, `roundActivationTime = block.timestamp + delayDurationBeforeRoundActivation`).
- ETH bid pricing (Dutch auction formulas, `getNextEthBidPriceAdvanced` for rounds ≥ 1, `getEthPlusRandomWalkNftBidPrice`, the overpayment refund/swallow logic, `halveEthDutchAuctionEndingBidPrice` math).
- Random Walk NFT bid validations, bid message length validation, the ETH-first-bid rule and its (refactored V1) validation order.
- ETH/NFT donation methods, bid statistics getters, secondary prize amount getters.
- `_authorizeUpgrade` (`onlyOwner` + `_onlyRoundIsInactive`) — future upgrades to V3+ follow the same rules.
