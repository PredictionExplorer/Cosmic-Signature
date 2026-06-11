# V1 Refactorings: ABI And Externally Visible Behavior Changes

## Introduction

This document compares the V1 Solidity sources on the `main` branch (the code deployed to Arbitrum One, where the `CosmicSignatureGame` proxy lives at `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2`) against the refactored V1 sources on the `v2` branch.

It lists every ABI change and every externally visible behavior change made to the V1 contracts by the refactoring. Per the conventions used for this review:

- Reorderings of operations that can each revert with a different reason **are** reported (the transaction can now revert with a different reason).
- Reorderings of storage reads/writes and computations that cannot revert are **not** reported.
- Gas use changes are **not** reported.
- `// #enable_asserts assert(...)` lines are compiled out of production builds, so adding, removing, or moving them is **not** an externally visible change.

The new `*V2.sol` sources added on the `v2` branch are covered separately in `v2-vs-v1-changes.md`. Refactorings made in shared sources that exist to support V2 (rather than the refactored V1) are also listed there, per the classification rule: when there is no evidence that a refactoring relates to V1, it is attributed to V2.

For the upgrade safety audit and additional pre-upgrade test recommendations, see `v2-upgrade-audit.md` and `v2-upgrade-recommended-tests.md`.

Important context: the refactored V1 sources are not intended to be redeployed. The deployed V1 implementation (`0x7739148013777c485AD9f3d971e1005Eca686661`) was built from `main`, so its on-chain ABI still uses the old names listed below. The renames matter because (a) they are what the `v2` branch's V1 sources now declare, and (b) V2 inherits and extends this naming.

## ABI Changes

All three changes below are aspects of a single rename: the public storage variable `cstRewardAmountForBidding` became `bidCstRewardAmount`.

| # | Kind | `main` branch (deployed) | `v2` branch (refactored V1) | Source files |
|---|---|---|---|---|
| 1 | Public storage variable getter | `cstRewardAmountForBidding()` | `bidCstRewardAmount()` | `production/CosmicSignatureGameStorage.sol` |
| 2 | External function | `setCstRewardAmountForBidding(uint256)` | `setBidCstRewardAmount(uint256)` | `production/SystemManagement.sol`, `production/interfaces/ISystemManagement.sol` |
| 3 | Event | `CstRewardAmountForBiddingChanged(uint256)` | `BidCstRewardAmountChanged(uint256)` | `production/interfaces/ISystemEvents.sol` |

Notes:

- The selectors of the getter and the setter change, and the event's topic 0 changes. Any off-chain code (frontend, indexer) compiled against the refactored V1 ABI cannot use these three members against the currently deployed V1 implementation, and vice versa.
- The semantics are unchanged: the variable is still the fixed CST amount minted to a bidder as a reward for placing a bid, and the setter still requires `onlyOwner` and an inactive round.
- The related internal constant `CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING` was renamed to `DEFAULT_BID_CST_REWARD_AMOUNT` with the same value (100 CST). Internal constants do not affect the ABI; `CosmicSignatureDao.proposalThreshold()` (which is initialized from this constant) is numerically unchanged.
- The same rename was mirrored in the test-only `upgrade-prototype/BiddingOpenBid.sol`.

## Externally Visible Behavior Changes

### 1. Reordered first-bid validations in `Bidding._bidCommon` (revert reason change)

In `production/Bidding.sol`, for the first bid of a bidding round, the two validations were reordered. The same change was mirrored in `upgrade-prototype/BiddingOpenBid.sol` (test-only).

`main` branch order:

```solidity
// Comment-202501044 applies.
require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

// Comment-202411169 relates.
_checkRoundIsActive();
```

`v2` branch order:

```solidity
// Comment-202411169 relates.
_checkRoundIsActive();

// Comment-202501044 applies.
require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));
```

Externally visible consequence. A **CST bid attempted as the first bid of a bidding round that is not yet active** now reverts with `CosmicSignatureErrors.RoundIsInactive("The current bidding round is not active yet.", ...)` instead of `CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH.")`.

Details on which transactions are affected:

- `_bidCommon` runs this block only when `lastBidderAddress == address(0)` (no bid yet in the current round).
- ETH bid paths (`receive`, `bidWithEth`, `bidWithEthAndDonate*`) are not affected. A zero-value ETH bid reverts earlier in `_bidWithEth` with `InsufficientReceivedBidAmount` (the ETH bid price is guaranteed to be nonzero), and a sufficiently funded ETH bid before round activation reverts with `RoundIsInactive` under both orders (`msg.value > 0` passes either way).
- CST bid paths (`bidWithCst`, `bidWithCstAndDonate*`) reach `_bidCommon` with `msg.value == 0`. Before this refactoring such a transaction (round not active, no bids placed) failed the ETH-only check first; now it fails the round-activation check first. Note that in both versions, the CST burn/mint (`token.mintAndBurnMany`) executes before `_bidCommon`, so a bidder whose CST balance is below the CST bid price gets an `ERC20InsufficientBalance` revert in both versions; the changed revert reason is observable for bidders whose balance is sufficient (or when the CST bid price is zero).

This is the only reordering of operations that can revert with different reasons found in the V1 production sources.

## Refactorings Verified To Have No ABI Or Externally Visible Behavior Impact

These were reviewed and intentionally not reported as changes; listed for completeness.

- **Pragma**: `pragma solidity 0.8.34;` → `pragma solidity =0.8.34;` in every file. Semantically identical (an exact version is already an exact constraint).
- **`require` → `if`/`revert` conversion** in `Bidding._bidWithCst` (and `BiddingOpenBid._bidWithCst`) for the `InsufficientReceivedBidAmount` price-max-limit check. The revert data is byte-for-byte identical.
- **Statement move in `_bidWithCst`**: the marketing-wallet block moved above the bid price computation. The block contains only a disabled `#enable_asserts` assertion, so nothing executable was reordered in production builds.
- **Statement reorder in `MainPrizeBase._extendMainPrizeTime`**: `getMainPrizeTimeIncrement()` is now computed before `Math.max(mainPrizeTime, block.timestamp)`. Both are non-reverting reads/computations (the division is by a nonzero constant inside `unchecked`); the assigned result is unchanged. (V2 changes this function for real; see the V2 document.)
- **`CosmicSignatureGame.initialize` restructuring**: the `_initialize` internal helper was inlined into `initialize`, and the `virtual` keyword was removed. Same ABI, same effects. The `virtual` removal only affects derived **test** contracts, which previously overrode `initialize` and now use a `dummyInitialize` hack instead (see below).
- **`CosmicSignatureGameStorage.__gap_persistent`** was shrunk from `uint256[1 << 255]` to `uint256[1 << 30]`. The gap is private, never read or written, and is the last storage in the inheritance chain, so V1's ABI, behavior, and the layout of all live variables are unchanged. The motivation is V2/upgrade tooling (OpenZeppelin's upgrade validation crashed due to an overflow with the `1 << 255` length), so this refactoring is attributed to V2; see `v2-vs-v1-changes.md`.
- **Function signature reformatting** (one parameter per line) for `bidWithEthAndDonateToken`, `bidWithEthAndDonateNft`, `bidWithCstAndDonateToken`, `bidWithCstAndDonateNft`, and multi-line `emit BidPlaced(...)` statements. No ABI change.
- **`CosmicSignatureDao`**: only the renamed constant reference (`DEFAULT_BID_CST_REWARD_AMOUNT`); `proposalThreshold()` value is unchanged (100 CST).
- **`CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR`** was rewritten in terms of the new `INITIAL_CST_DUTCH_AUCTION_DURATION` constant. The computed value is identical (83333, matching the value currently on chain).
- **Debug-only assertion disabled**: `// #enable_asserts assert(tx.gasprice > 0);` was commented out in `Bidding._bidWithEth` and `BiddingOpenBid` because `tx.gasprice` can be zero on Arbitrum, at least during gas estimation (Comment-202606216). Affects only `#enable_asserts` test builds; production behavior is unchanged.
- **Comment work throughout**: comment renumbering (`[Comment-NNNN]` brackets), typo fixes, and `console.log` text changes inside commented-out debug lines.

## Refactorings In Non-Production Sources Attributed To The V1 Refactoring

These sources are not used by the production `CosmicSignatureGame` or `CosmicSignatureGameV2` contracts, but the listed changes exist to accommodate the refactored V1 code (evidence cited); V2-motivated changes to the same files are listed in `v2-vs-v1-changes.md`.

- `tests/SelfDestructibleCosmicSignatureGame.sol`, `tests/SpecialCosmicSignatureGame.sol`: their `initialize(address)` overrides were removed (V1's `initialize` is no longer `virtual` and `_initialize` no longer exists). They gained a `dummyInitialize()` method, a documented hack (Comment-202606037) that silences OpenZeppelin's `deployProxy` validation while `deployProxy` still calls `initialize`. Test-only ABI change.
- `upgrade-prototype/BiddingOpenBid.sol`: mirrors the V1 refactorings one-for-one — the `bidCstRewardAmount` rename, the `_bidCommon` first-bid validation reorder (the same `RoundIsInactive` vs `WrongBidType` revert-reason change applies to this test-only contract), the `require` → `if`/`revert` conversion, and the disabled `tx.gasprice` assertion.
