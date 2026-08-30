todo-0 Eventually delete this file.

# `BiddingV3` comparison: `db37625` vs. `v3.1-2026-08-19`

## Scope and headline result

This is a direct comparison of these two snapshots:

- Old: `db37625ab09cffce8ef525e53ad10f4d947abb5c` (2026-08-13).
- New: the fetched tip of `v3.1-2026-08-19`, `c3d9e41d10973cf2ae668a0df88cc85cba41afe5` (2026-08-30).

The comparison covers the abstract `BiddingV3` contract, including inherited declarations needed to determine its ABI and storage layout. Changes in sibling modules that are combined only in the concrete `CosmicSignatureGameV3` contract, such as `SystemManagementV3`, are outside scope.

Unless a separate conditional-compilation note says otherwise, behavior below is for the production configuration, in which Hardhat preprocessing is disabled and the source `unchecked` blocks are active. As requested, `bidCstRewardAmountMultiplier` (`M` below) is assumed to be nonzero. No difference that exists only when `M == 0` is listed.

| Area | Result |
| --- | --- |
| Storage layout | No semantic change |
| ABI | No change |
| Production behavior | Three changes: the pre-first-bid reward getters, first-CST-bid failure precedence, and later ETH bids whose calculated reward floors to zero |
| Successful-call event set/order | No direct change; later event values can change indirectly because the ETH auction anchor can change |
| Internal source structure | Two private helpers were removed and their bodies were inlined; assertions and comments were also changed |

## Storage layout

There is no storage-layout change.

Independent Solidity 0.8.34 compilations of both snapshots produced:

- 60 identical persistent-layout entries after normalizing compiler-only AST IDs;
- the same labels, slots, offsets, types, mapping encodings, and struct member layouts;
- one identical compiler-reported transient-layout entry;
- identical inheritance linearization and identical OpenZeppelin namespaced/fixed-slot storage usage; and
- no added, removed, moved, renamed, retyped, or repacked variable.

`BiddingV3` itself declares no state. Its inherited persistent layout still begins with `__gap_persistent` at slots 0 through 255, continues with the V2 storage at slots 256 through 307, and has the V3 additions at slots 308 through 314:

- slot 308: `championDurations`;
- slot 309: `cstBidPriceDeclineMultiplier`;
- slot 310: `cstBidPriceDeclineMultiplierChangeDivisor`;
- slot 311: `roundLateBidDurationDivisor`;
- slot 312: `roundLateBidPricePremiumAmountBaseMultiplier`;
- slot 313: `roundLateBidPricePremiumAmountExponent`; and
- slot 314: `mainPrizeNumCosmicSignatureNfts`.

Some raw compiler layout JSON fields differ, notably `astId` values and numeric suffixes embedded in internal type IDs. Those values changed because source positions/AST numbering changed; their resolved storage types and encodings are identical. The edits in `CosmicSignatureGameStorageV2Base.sol` and `CosmicSignatureGameStorageV3Base.sol` are documentation-only.

Consequently, this `BiddingV3` change requires no storage migration and introduces no proxy storage collision.

## ABI

There is no ABI change.

The independently compiled `BiddingV3` ABI arrays are exactly identical. Each contains 143 entries:

- 89 functions and public-variable getters;
- 37 events;
- 16 custom errors; and
- one `receive` entry.

There are no additions, removals, or changes to function names, selectors, input/output types or names, tuple components, mutability, event topics, event indexed flags, error selectors, or `receive`. In particular, `BidPlaced` remains:

```solidity
event BidPlaced(
    uint256 indexed roundNum,
    address indexed lastBidderAddress,
    int256 paidEthPrice,
    int256 paidCstPrice,
    int256 indexed randomWalkNftId,
    string message,
    uint256 bidCstRewardAmount,
    uint256 cstBidPriceDeclineMultiplier,
    uint256 mainPrizeTime
);
```

The removed `_checkBidCstRewardAmountMinLimit` and `_emitBidPlaced` methods were `private`, so removing them does not affect the ABI. The edits in `IBidding1V2.sol` and `IBidding2V3.sol` change only NatSpec, not declarations.

## Externally visible production behavior changes

### 1. The reward getters no longer return an unconditional zero before the first bid

This affects both:

- `getBidCstRewardAmountAdvanced(int256)`; and
- inherited `getBidCstRewardAmount()`, which calls the advanced getter with offset zero.

When `lastBidderAddress == address(0)`:

| Old | New |
| --- | --- |
| Returns `0` immediately. | Reads `biddersInfo[roundNum][address(0)].lastBidTimeStamp` and runs the normal reward formula. That timestamp is zero in normally reachable state. |

For ordinary inputs and a nonzero denominator, the new pre-first-bid result is therefore:

```text
elapsed = block.timestamp + currentTimeOffset
result  = elapsed > 0 ? floor(elapsed * M / mainPrizeTimeIncrementInMicroSeconds) : 0
```

The arithmetic is inside an `unchecked` block in the production build. Thus extreme values use wrapping arithmetic. For normal offsets, the new value accrues from Unix timestamp zero, not from round activation, and is usually a large nonzero value. A sufficiently negative offset or integer flooring can still make it zero.

The change applies while the round is inactive as well as while it is active but has no bid. It also applies after main-prize claiming resets `lastBidderAddress` for the next round.

Revert behavior also changes in this state. The old early return could not divide by the reward denominator. The new version can revert with `Panic(0x12)` when `mainPrizeTimeIncrementInMicroSeconds == 0` and `elapsed > 0`.

This getter change does **not** change the first ETH bid's reward: `_bidWithEth` initializes its local reward to zero and calls the getter only if a previous bidder exists. The first ETH bid still mints no bid reward and reports `bidCstRewardAmount == 0` in `BidPlaced`.

Source locations: old `BiddingV3.sol:538-561`; new `BiddingV3.sol:484-503`.

### 2. A first CST bid now performs fallible work before it is rejected

This affects all three inherited entry points:

- `bidWithCst`;
- `bidWithCstAndDonateToken`; and
- `bidWithCstAndDonateNft`.

The common reentrancy guard and `_onlyIfNoBidPlacedWithinCurrentSecond` check remain first in both versions. After those checks, behavior with `lastBidderAddress == address(0)` differs.

#### Old order

1. `_checkRoundIsActive()` runs.
2. If the round is inactive, the transaction reverts with `RoundIsInactive`.
3. If the round is active, the transaction reverts with `WrongBidType("The first bid in a bidding round shall be ETH.")`.

The old version reaches neither reward/price validation nor the CST token before this rejection.

#### New order

1. Calculate the pre-first-bid reward described above. A zero denominator can cause `Panic(0x12)`.
2. Check `bidCstRewardAmountMinLimit_`; this can revert with `BidCstRewardAmountMinLimitNotReached`.
3. Calculate the CST bid price.
4. Check `priceMaxLimit_`; this can revert with `InsufficientReceivedBidAmount`.
5. Call `token.mintAndBurnMany`, first for the caller/price and then for `lastBidderAddress == address(0)`/reward. This newly exposes any revert from the configured token before round/type validation.
6. If the token call returns successfully, update temporary Game accounting/auction state and reduce `cstBidPriceDeclineMultiplier`. Checked arithmetic here can also revert before the old errors; for example, `paidPrice_ * 2` can cause `Panic(0x11)`.
7. `_bidCommon` then checks, in order, message length (`TooLongBidMessage`), round activity (`RoundIsInactive`), and the first-bid type (`WrongBidType`).

With the repository's `CosmicSignatureToken`, representative newly possible winning errors are:

- `ERC20InsufficientBalance` if the first array item is interpreted as a burn and the caller cannot pay;
- `ERC20InvalidReceiver(address(0))` when the reward converts to a nonnegative `int256` and the token attempts to mint it to the zero address; or
- `ERC20InvalidSender(address(0))` when a very large reward converts to a negative `int256` and the token instead interprets it as a burn from the zero address.

An authorization failure or any revert from a replacement/hostile token can likewise replace the old `RoundIsInactive`/`WrongBidType` result. If a permissive replacement token returns successfully, the later arithmetic or `TooLongBidMessage` can still take precedence before round/type validation.

A first CST bid still cannot complete successfully: if all earlier operations return, `_bidCommon` eventually rejects the nonpayable CST call as the wrong first-bid type. All interim Game/token state and logs roll back. Consequently, the new external token call can be seen in an execution trace and changes gas/revert data, but it produces no durable event or state. The donation call in either combined entry point remains unreachable.

Source locations: old `BiddingV3.sol:209-248`, especially lines 225-230; new `BiddingV3.sol:202-273`; inherited late checks at `BiddingV2Base.sol:336-359`; token array order at `CosmicSignatureToken.sol:126-145`.

### 3. A later ETH bid with a calculated zero reward now overwrites the ETH auction anchor

This difference exists even with the required nonzero `M` assumption. At least one second between bids does not guarantee a positive integer reward. For example, with nonzero values:

```text
elapsed * M < mainPrizeTimeIncrementInMicroSeconds
```

the calculated reward floors to zero. Unchecked wraparound can provide additional extreme cases in which the calculated value is zero.

For a successful ETH bid after an earlier bid:

| Old | New |
| --- | --- |
| Branches on `lastBidderAddress`. Because it is nonzero, a zero reward causes neither a mint nor an update to `ethDutchAuctionBeginningBidPrice`. | Branches on `bidCstRewardAmount_`. A zero reward writes `ethDutchAuctionBeginningBidPrice = ethBidPrice_ * 2`; it still performs no reward mint. |

Externally visible consequences are:

- the public `ethDutchAuctionBeginningBidPrice()` getter changes immediately in the new version;
- the current round's `nextEthBidPrice` ladder is otherwise unchanged, because it is used while `lastBidderAddress` remains nonzero;
- after main-prize claiming resets `lastBidderAddress`, the overwritten value becomes the next round's ETH Dutch-auction anchor and changes `getNextEthBidPrice*`, the required first ETH/Random-Walk bid amount, and later `BidPlaced.paidEthPrice`/accounting;
- a fixed-value later bid can therefore succeed in one version and revert with `InsufficientReceivedBidAmount` in the other; and
- next-round `halveEthDutchAuctionEndingBidPrice` calculations can differ because they also use the anchor.

The new multiplication by 2 also introduces an earlier `Panic(0x11)` possibility on such a later zero-reward bid if `ethBidPrice_ > type(uint256).max / 2`. The old version skips that multiplication in this case and can continue to later fallible actions instead.

For the current successful zero-reward bid, both versions omit a token `Transfer` and emit the same `BidPlaced` arguments in the same position. The difference is the hidden anchor write and its downstream effects.

Source locations: old `BiddingV3.sol:138-165`; new `BiddingV3.sol:132-158`. The reset that makes the anchor control the next round is in `MainPrizeV2Base.sol:92-115`; the first-bid price path is in `BiddingV2Base.sol:155-190`.

## Events and behavior that did not change

The private `_emitBidPlaced` helper was replaced by direct, textually equivalent `emit BidPlaced(...)` statements in `_bidWithEth` and `_bidWithCst`. The emit remains immediately after `_bidCommon`, with the same nine arguments.

Accordingly, for successful production calls:

- First ETH bid: `FirstBidPlacedInRound`, then `BidPlaced`, unchanged.
- Later ETH bid with a positive reward: token mint `Transfer`, then `BidPlaced`, then any ETH refund call, unchanged.
- CST bid after an ETH bid: token burn/mint `Transfer` events, then `BidPlaced`, unchanged.
- Donation variants: the bid's events still precede the later donation call/events, unchanged.
- Later ETH bid with a calculated zero reward: no reward `Transfer`, then `BidPlaced`, unchanged for that transaction.

There is no direct successful-call event addition, removal, reordering, indexed-field change, or argument change. Failed first-CST attempts have no durable events in either version because the whole transaction reverts. As described above, the changed auction anchor can indirectly change event values in later transactions.

Other ordinary behavior is unchanged:

- after a first bid exists, `getBidCstRewardAmountAdvanced` uses the same formula in both versions;
- positive-reward ETH and CST bid paths use the same prices, reward recipient, accounting, auction updates, and limits;
- the minimum-reward comparison and its error arguments/order are unchanged where both versions reach it; and
- the remaining price/duration getters and bid-per-second guard have no executable change.

## Conditional assert-enabled build differences

These differences do not apply to the production build, but the lines are executable when `#enable_asserts` preprocessing is enabled:

- The new `_bidWithEth` adds `assert(bidCstRewardAmount_ > 0)` after calculating a later bid's reward and replaces the old first-bid-only assertion with `assert((bidCstRewardAmount_ == 0) == (lastBidderAddress == address(0)))`.
- The new `_bidWithCst` adds `assert(bidCstRewardAmount_ > 0)`, with another redundant reward assertion inside `_burnCstBidPriceAndMintBidCstRewardAmount`.
- The old assertion that the CST reward recipient (`lastBidderAddress`) is nonzero inside the burn/mint helper was removed.

Therefore, with nonzero `M` but a reward that floors to zero, the new assertion-enabled build reverts with `Panic(0x01)` on a later ETH or CST bid; the old assertion-enabled build can continue. On a first CST attempt whose new epoch-based reward floors to zero, `Panic(0x01)` also takes precedence over the old round/type errors.

When SMT-checker preprocessing comments out the `unchecked` blocks, removal of the old no-bid early return additionally makes extreme reward arithmetic reachable and therefore introduces possible checked-arithmetic `Panic(0x11)` failures before the first bid. This is an analysis-build difference, not production behavior.

## Internal and documentation-only source changes

The complete remaining executable/source-structure changes are:

- `_checkBidCstRewardAmountMinLimit` was deleted and its identical comparison/revert was inlined into both bid methods.
- `_emitBidPlaced` was deleted and its identical event expression was inlined into both bid methods.
- The conditional assertions changed as listed above.

All other edits in `BiddingV3.sol` are comments/NatSpec. In particular, the old explanations that a nonzero multiplier can still floor to zero and that first-CST prevalidation protects the zero reward recipient were removed or replaced; the getter documentation no longer promises zero before the first bid; mint/burn comments no longer state the old recipient guarantees; two todo comments were added in the decline-multiplier helpers; and a notice comment on `_getCstDutchAuctionDuration` was removed.

Related inherited/interface diffs are also documentation-only:

- `IBidding1V2.sol` changes the reward-getter description and removes its explicit pre-first-bid-zero statement.
- `IBidding2V3.sol` shortens the `BidPlaced` parameter documentation but leaves the event declaration unchanged.
- `CosmicSignatureGameStorageV2Base.sol` and `CosmicSignatureGameStorageV3Base.sol` rewrite comments without changing declarations.

## Verification performed

- Fetched `v3.1-2026-08-19` and confirmed its remote/local tip is `c3d9e41d10973cf2ae668a0df88cc85cba41afe5`.
- Exported and independently compiled both exact snapshots with the configured native `solc` `0.8.34+commit.80d5c536` production settings.
- Compared full inherited ABI entries, persistent and transient compiler layouts, resolved composite types, and inheritance linearization.
- Reviewed the complete executable diff of `BiddingV3.sol` and traced changed paths through `BiddingV2Base`, `BiddingCommonV2`, `CosmicSignatureToken`, and next-round preparation.

