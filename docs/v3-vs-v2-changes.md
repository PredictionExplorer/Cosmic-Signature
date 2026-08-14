# CosmicSignatureGame V3 vs V2 Changes

This document compares `CosmicSignatureGameV3` (the version to upgrade the proxy to next) with `CosmicSignatureGameV2` (the version currently live on Arbitrum One). It is the reference for auditors, for the frontend/backend/indexer teams, and for the upgrade operator.

V3 is implemented by deriving from the V2 module hierarchy. New sources (all under `contracts/production/`):

- `CosmicSignatureGameV3.sol`, `CosmicSignatureGameStorageV3.sol`, `CosmicSignatureGameStorageV3Base.sol`, `BiddingV3.sol`, `MainPrizeV3.sol`, `SystemManagementV3.sol`
- Interfaces: `IBiddingV3.sol`, `IMainPrizeV3.sol`, `IMainPrize2V3.sol`, `ISystemManagementV3.sol`, `ISystemEventsV3.sol`

V3 reuses the V2 modules unchanged: `CosmicSignatureGameV2Base` (constructor, `reinitialize` declaration, `_authorizeUpgrade`), `MainPrizeCommonV2`, `SystemManagementV2` (as the base of `SystemManagementV3`), `EthDonationsV2`, `NftDonationsV2`, `BidStatisticsV2` (as the base of `BidStatisticsV3`), `BiddingV2Base` (as the base of `BiddingV3`), `SecondaryPrizesV2`, `MainPrizeV2Base` (as the base of `MainPrizeV3`). The V2 leaves `BiddingV2` (the V2 `_bidWithEth`/`_bidWithCst`) and `MainPrizeV2` (the V2 `_distributePrizes`) are not inherited by V3; `BiddingV3` and `MainPrizeV3` override those virtual methods instead.

V3 is deployed by **upgrading the existing proxy** (UUPS `upgradeToAndCall` with `reinitialize` as the call payload), so "ABI changes" below describe what changes for callers of the proxy once it is upgraded. Unlike the V1 -> V2 upgrade, this upgrade needs **no unsafe OpenZeppelin flags**: no storage slots are renamed or repurposed, and the `.openzeppelin` manifest already reflects the V2 layout (see `tasks/config/upgrade-cosmic-signature-game-config-<network-name>-CosmicSignatureGameV3.json`, where `unsafeAllowRenames` and `unsafeSkipStorageCheck` are `false`).

## Storage Layout

The V1 -> V2 -> V3 game proxy storage layout remains fully compatible:

- V3 appends exactly 7 new variables in `CosmicSignatureGameStorageV3Base` (which derives from `CosmicSignatureGameStorageV2Base`): `championDurations` (a mapping), `cstBidPriceDeclineMultiplier`, `cstBidPriceDeclineMultiplierChangeDivisor`, `roundLateBidDurationDivisor`, `roundLateBidPricePremiumAmountBaseMultiplier`, `roundLateBidPricePremiumAmountExponent`, `mainPrizeNumCosmicSignatureNfts`.
- `CosmicSignatureGameStorageV3.__gap_persistent` shrank by 7 slots to `uint256[(1 << 30) - 1 - 7]` to compensate, so all pre-existing variables keep their slots.
- No slots are renamed or repurposed (the V1 -> V2 upgrade repurposed 2 slots; V3 does nothing of the kind). However, `reinitialize()` intentionally overwrites 7 pre-existing values:
  - `cstDutchAuctionBeginningBidPriceMinLimit` (200 CST -> 1 CST), which effectively eliminates the minimum while still avoiding zero-beginning-price marginal cases.
  - `bidCstRewardAmountMultiplier`, repurposed from the V2 square-root reward formula's radicand multiplier to the V3 linear reward formula's multiplier; its setter keeps working and now tunes the V3 linear reward.
  - The ETH prize percentages: main prize 25% -> 20%, charity 7% -> 5%, bidder-raffle total 4% -> 5%, CS NFT stakers 6% -> 5%, and Chrono Warrior 8% -> 15%. The paid total remains 50%, so the implicit rollover remains 50%.
- `cstDutchAuctionDuration` and `cstDutchAuctionDurationChangeDivisor` keep their slots and values, but V3's logic no longer reads them and their setters revert (see the ABI changes below).

This is verified by OpenZeppelin `validateUpgrade` in `test/tests-src/CosmicSignatureGameV3-StorageLayout.js`, by `slither/slither-check-upgradeability-CosmicSignatureGameV3.bash`, and by the fuzz campaign's V2 -> V3 upgrade phase, which snapshots and diffs every remaining carried-over getter (including the V2 parameters) and checks all intentional overwrites.

## ABI Changes

### 1. New public storage getters (`CosmicSignatureGameStorageV3Base`)

| Getter | Initialized by `reinitialize()` to |
|---|---|
| `championDurations(uint256 roundNum)` | (not initialized; written per round at main prize claim time) |
| `cstBidPriceDeclineMultiplier()` | `INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER` (~`1 ether / 60`; the CST bid price declines ~1 CST per minute) |
| `cstBidPriceDeclineMultiplierChangeDivisor()` | 100 (~1% change per bid) |
| `roundLateBidDurationDivisor()` | 3_000_000 (a ~20-minute late-bid window for the initial 1-hour main prize time increment) |
| `roundLateBidPricePremiumAmountBaseMultiplier()` | `3567993 << 13` = 29_228_998_656 |
| `roundLateBidPricePremiumAmountExponent()` | 8 |
| `mainPrizeNumCosmicSignatureNfts()` | 3 |

### 2. New view method (`BiddingV3`)

- `getRoundLateBidDuration() returns (uint256)` = `mainPrizeTimeIncrementInMicroSeconds / roundLateBidDurationDivisor`. The duration before `mainPrizeTime` during which the bid price premium applies. Like other divisor-derived durations, it stretches ~1% per completed round.

### 3. New configuration setters (`SystemManagementV3`, `onlyOwner` + `_onlyRoundIsInactive`)

- `setCstBidPriceDeclineMultiplier(uint256)`
- `setCstBidPriceDeclineMultiplierChangeDivisor(uint256)`
- `setRoundLateBidDurationDivisor(uint256)`
- `setRoundLateBidPricePremiumAmountBaseMultiplier(uint256)`
- `setRoundLateBidPricePremiumAmountExponent(uint256)`
- `setMainPrizeNumCosmicSignatureNfts(uint256)`

All of them except `setRoundLateBidPricePremiumAmountBaseMultiplier` reject a zero value with the
`CosmicSignatureErrors.ZeroValue()` error (Comment-202608171), because a zero would brick main prize claiming
(`mainPrizeNumCosmicSignatureNfts`) or bid pricing/placement (the divisors and the decline multiplier). A zero base
multiplier is valid: it disables the late bid price premium.

### 3a. Retired setters (`SystemManagementV3`) — always revert

- `setCstDutchAuctionDuration(uint256)` and `setCstDutchAuctionDurationChangeDivisor(uint256)` remain in the ABI but
  always revert with the new `CosmicSignatureErrors.NotImplemented()` error. V3 does not use the values they set.

### 4. New events (`ISystemEventsV3`)

- `CstBidPriceDeclineMultiplierChanged(uint256 newValue)`
- `CstBidPriceDeclineMultiplierChangeDivisorChanged(uint256 newValue)`
- `RoundLateBidDurationDivisorChanged(uint256 newValue)`
- `RoundLateBidPricePremiumAmountBaseMultiplierChanged(uint256 newValue)`
- `RoundLateBidPricePremiumAmountExponentChanged(uint256 newValue)`
- `MainPrizeNumCosmicSignatureNftsChanged(uint256 newValue)`

### 4a. `BidPlaced` event: same topic0, changed field semantics — indexers must reinterpret

The V3 `BidPlaced` (declared in `IBidding2V3`) has the same parameter type list as the V2 one, so its topic0 hash is
unchanged, but two data fields change meaning:

- Field 7, `bidCstRewardAmount`: in V2 this was the reward minted to the bidder placing the bid; in V3 it is the
  reward minted to the PREVIOUS bidder (the one being outbid), and it is 0 on the first bid of a round.
- Field 8: in V2 this was `cstDutchAuctionDuration`; in V3 it is `cstBidPriceDeclineMultiplier` (the value after
  this bid's ~1% adjustment).

### 5. `MainPrizeClaimed` event signature change (`IMainPrize2V3`) — indexers must migrate

The event gains a parameter, which **changes its topic0 hash**. Indexers/monitoring keyed on the V2 `MainPrizeClaimed` signature will not see V3 claims.

```solidity
// V2 (IMainPrize2):
event MainPrizeClaimed(
	uint256 indexed roundNum,
	address indexed beneficiaryAddress,
	uint256 ethPrizeAmount,
	uint256 cstPrizeAmount,
	uint256 indexed prizeCosmicSignatureNftId,
	uint256 timeoutTimeToWithdrawSecondaryPrizes
);

// V3 (IMainPrize2V3):
event MainPrizeClaimed(
	uint256 indexed roundNum,
	address indexed beneficiaryAddress,
	uint256 ethPrizeAmount,
	uint256 cstPrizeAmount,
	uint256 indexed prizeFirstCosmicSignatureNftId,
	uint256 prizeNumCosmicSignatureNfts,
	uint256 timeoutTimeToWithdrawSecondaryPrizes
);
```

`prizeFirstCosmicSignatureNftId` is the ID of the first of the beneficiary's `prizeNumCosmicSignatureNfts` NFTs; the IDs of the additional ones are sequential.

### 6. Initializer

- `reinitialize()`, declared `reinitializer(3)`. Executed once, as the `upgradeToAndCall` payload during the upgrade; it sets the 6 new V3 parameters to the defaults listed above and overwrites 7 pre-existing V2 values: `cstDutchAuctionBeginningBidPriceMinLimit = 1 ether`, `bidCstRewardAmountMultiplier = DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER`, and the five ETH prize percentages (20% main, 5% charity, 5% bidder raffles, 5% CS NFT stakers, 15% Chrono Warrior). The selector is unchanged from V2's `reinitialize()` (a second call on the upgraded proxy reverts with `InvalidInitialization`).
- Like in V2, the important preconditions (`_onlyNonFirstRound`, `_onlyIfPrevVersionWasInitialized`) are assert-only production no-ops; the real protection is V2's `_authorizeUpgrade` (`onlyOwner` + `_onlyRoundIsInactive`). `test/tests-src/CosmicSignatureGameV3-GuardsAndMisconfig.js` documents both.

### 7. No selectors removed; 3 new custom errors

Everything callable on V2 remains callable on V3 with the same signatures, except where noted under behavior
changes and the retired setters above. (The V1 -> V2 upgrade removed selectors; V3 removes none.)

New custom errors in `CosmicSignatureErrors`:

- `BidPlacedWithinCurrentSecond()` — the same-second bid throttle (behavior change 1 below).
- `NotImplemented()` — the retired CST Dutch auction duration setters.
- `ZeroValue()` — the new V3 setters' zero-value validation (Comment-202608171).

## Externally Visible Behavior Changes

### 1. One bid per second (`BiddingV3`)

Both `_bidWithEth` and `_bidWithCst` revert with `BidPlacedWithinCurrentSecond()` if another bid has already been
placed at the same `block.timestamp` (checked against `biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp`).
This makes bot wars a little harder while rarely affecting manual bidders. It also guarantees that the bid CST
reward for a non-first bid is a nonzero (at least 1 second has elapsed).

### 2. CST Dutch auction driven by a price decline multiplier (`BiddingV3`)

V2 stored a `cstDutchAuctionDuration` and derived the price decline speed from it; the duration shrank ~1% on each
ETH bid and grew ~1% on each CST bid. V3 replaces this with a direct price decline speed:

- `getNextCstBidPriceAdvanced` returns `beginningPrice - elapsed * cstBidPriceDeclineMultiplier`, floored at 0,
  then late-premium-adjusted (see below).
- On each ETH bid the multiplier increases ~1% (`tryIncreaseValueExponentially(multiplier, 100)`), making the CST
  price fall faster; on each CST bid it decreases ~1% (`tryReduceValueExponentially`), making it fall slower. This
  keeps the V2 economic intent (encouraging a balance of ETH and CST bids) with one fewer indirection, and it makes
  the CST bid price reduction speed independent from the bid CST reward accrual (in V2 both derived from the same
  stored duration).
- `getCstDutchAuctionDurations()` still exists and now returns the duration derived from the beginning price and
  the multiplier (rounded up), together with the elapsed duration.
- The auction beginning price is still 2x the last paid CST price, but the minimum
  (`cstDutchAuctionBeginningBidPriceMinLimit`) drops from 200 CST to 1 CST at `reinitialize` time, which effectively
  eliminates the minimum while avoiding the marginal cases a zero beginning price could cause (such as a bidding
  round that can never end).

### 3. Late bid price premium (`BiddingV3`)

Within `getRoundLateBidDuration()` seconds before `mainPrizeTime` (and after it, if the round remains unclaimed), every ETH and CST bid price is increased by an exponentially accelerating premium:

- `getNextEthBidPriceAdvanced` and `getNextCstBidPriceAdvanced` (and therefore `getNextEthBidPrice`, `getNextCstBidPrice`, and every bid method) return/charge the adjusted price.
- The premium amount is `((elapsed * baseMultiplier / mainPrizeTimeIncrementInMicroSeconds) ** exponent * price) >> (exponent * 13)`, where `elapsed` is the time since the window opened, clamped to the window length (Comment-202607119).
- With the default parameters the maximum premium amount is ~4x the price, so a bid exactly at (or after) `mainPrizeTime` costs ~5x the unadjusted price.
- Knock-on effects: the premium-adjusted paid price feeds the exponential next-ETH-bid-price ladder (`nextEthBidPrice = paid + paid / ethBidPriceIncreaseDivisor + 1`), the ETH Dutch auction beginning price of the next round (2x the last price), the CST Dutch auction beginning price (2x the paid CST price), `BidPlaced.paidEthPrice` / `paidCstPrice`, and `biddersInfo` spent totals.
- There is no premium before the first bid of a round (no last bidder means no `mainPrizeTime` pressure), so the premium never interferes with the round-opening Dutch auctions.
- New revert possibility: an ETH bid that would have succeeded on V2 can revert with `InsufficientReceivedBidAmount` on V3 if it lands inside the window without paying the premium; a CST bid can similarly exceed `priceMaxLimit_`. Frontends should re-quote prices frequently near `mainPrizeTime`.

### 4. Linear bid CST reward, minted entirely to the outbid (previous) bidder (`BiddingV3`)

The V2 sqrt bid CST reward formula is replaced, and the reward recipient changes:

- **Formula.** `getBidCstRewardAmountAdvanced` now returns
  `elapsedSeconds * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds`, where `elapsedSeconds` is
  the time since the last bid. With the default `bidCstRewardAmountMultiplier` this accrues ~1 CST per minute at the
  initial main prize time increment. The reward accrual is independent from the CST bid price decline (behavior
  change 2 above); in V2 both were coupled through `cstDutchAuctionDuration`.
- **Recipient.** The whole reward is minted to the bidder being outbid (the current `lastBidderAddress`), not to the
  bidder placing the bid. This compensates the outbid bidder for having "held the line" and removes the V2
  self-reward incentive to bid against oneself.
- **First bid in a round.** There is no previous bidder to reward, so nothing is minted, and
  `getBidCstRewardAmountAdvanced` returns 0 until the first bid is placed (Comment-202608176). Frontends should not
  display a reward quote before the first bid of a round.
- **Main prize claim.** The reward accrued by the final bidder of the round is NOT minted at `claimMainPrize` — the
  final bidder wins the main prize instead.
- **ABI/event semantics.** All bid method signatures are unchanged. `bidCstRewardAmountMinLimit_` and the
  `BidPlaced.bidCstRewardAmount` event field now refer to the amount minted to the previous bidder (see 4a above).
- **Mint shape.** An ETH bid mints via a single `CosmicSignatureToken.mint` to the previous bidder. A CST bid uses
  one `mintAndBurnMany` call: the caller's price burn spec, then the previous bidder mint spec.
- **First-CST-bid validation moved earlier (Comment-202608167).** A CST bid attempted as the first bid of a round
  reverts with the same `WrongBidType("The first bid in a bidding round shall be ETH.")` error as in V2, but the
  check now runs at the beginning of `_bidWithCst` (after the round-active check, matching V2's validation order)
  rather than in `_bidCommon` near the end. Without this, the reward minting to the nonexistent previous bidder
  would have reverted with an unhelpful `ERC20InvalidReceiver`.
- **No new attack surface (Comment-202607163).** The reward is minted, never transferred: `CosmicSignatureToken`
  performs no call into the recipient, so a hostile contract that reverts on any incoming call cannot block the
  reward minting, and therefore cannot prevent other people from bidding (covered by
  `test/tests-src/CosmicSignatureGameV3-BidCstRewardAttack.js`).
- **Economics.** Unlike the V2 sqrt formula (which was designed to be supply-neutral relative to the main prize time
  increment), the linear formula's issuance is directly proportional to real time spent between bids; the effective
  per-minute rate slowly decreases as `mainPrizeTimeIncrementInMicroSeconds` grows ~1% per round, unless the owner
  re-tunes `bidCstRewardAmountMultiplier`.

### 5. V3 ETH prize distribution

At upgrade time, `reinitialize()` changes the five existing ETH prize percentages to 20% main prize, 5% charity,
5% bidder raffles, 5% CS NFT stakers, and 15% Chrono Warrior. Every amount is still calculated independently
from the full game balance at claim time. The configured payouts total 50%; the other 50% remains in the game
for subsequent rounds. Rollover remains implicit rather than a stored percentage. The number of bidder-raffle
draws remains 3, so the raffle's 5% total is split among three winners and any integer-division remainder stays
in the game. No event or selector changes accompany this configuration migration; frontends and indexers should
read the existing percentage getters after the upgrade and update any hardcoded prize copy.

### 6. Multi-NFT main prize (`MainPrizeV3`)

- The main prize beneficiary receives `mainPrizeNumCosmicSignatureNfts` (default 3) Cosmic Signature NFTs instead of 1, minted as one sequential ID block. All other prize NFT counts (last CST bidder, Endurance Champion, Chrono-Warrior, raffle winners, Random Walk NFT stakers) and all CST amounts are unchanged.
- The CST/NFT recipient bookkeeping inside `_distributePrizes` was restructured accordingly (Comment-202511094, Comment-202511104, Comment-202606011: in V3+ the number of CS NFTs minted exceeds the number of CST prize mints by `mainPrizeNumCosmicSignatureNfts - 1`, and the item order differs).

### 7. Champion durations persisted per round (`BidStatisticsV3`)

At main prize claim time, the `_saveChampionDurations` hook (a no-op in V2) writes the round's final endurance
champion duration and chrono-warrior duration to the new public `championDurations[roundNum]` mapping, so they
remain queryable after `_prepareNextRound` resets the working variables.

### 8. Owner misconfiguration footguns — now largely closed (Comment-202608171)

The new V3 setters reject the dangerous zero values with `ZeroValue()`:

- `setMainPrizeNumCosmicSignatureNfts(0)` would have made every subsequent `claimMainPrize` revert with `Panic(0x11)` (checked underflow in the NFT owner array allocation). Because the setter and `_authorizeUpgrade` both require an inactive round, a round that already has a bid could never be repaired: **the game would have bricked permanently**. Now rejected.
- `setRoundLateBidDurationDivisor(0)`, `setCstBidPriceDeclineMultiplier(0)`, `setCstBidPriceDeclineMultiplierChangeDivisor(0)` would have made price views and/or bids revert with `Panic(0x12)` (division by zero) for the rest of the round. Now rejected.
- `setRoundLateBidPricePremiumAmountExponent(0)` would have made the premium equal the whole bid price (`base ** 0 == 1` with a zero shift), doubling every late bid price, which is likely never intended. Now rejected.
- `setRoundLateBidPricePremiumAmountBaseMultiplier(0)` remains valid: it disables the late bid price premium.
- Remaining (accepted) footguns: extreme `roundLateBidPricePremiumAmountBaseMultiplier` / `roundLateBidPricePremiumAmountExponent` values can make the premium arithmetic wrap (the formula runs in an `unchecked` block in production builds), producing bogus prices; an absurdly high `bidCstRewardAmountMultiplier` (on the order of `2^200`) can similarly wrap the reward arithmetic. Sane values are nowhere near those ranges, and the benevolent-owner assumption (Comment-202411064) applies.

### 9. What did not change

- All V2 bid method signatures and validations, including the `bidCstRewardAmountMinLimit_` mechanism (though it now guards the previous bidder's linear reward).
- The ETH Dutch auction, the exponential next-ETH-bid-price ladder, the Random Walk NFT discount, and the ETH overpayment refund logic.
- `mainPrizeTime` extension (unchecked add, no clamping), claim authorization and timeout logic, `_prepareNextRound` (including the Comment-202606235 unchecked overflow hardening).
- ETH prize calculation and transfer mechanics (apart from the V3 percentage allocation above), the end-of-round CST prize amounts, the staking deposit and charity transfer paths, `PrizesWallet` interactions (including `setPrizesWallet`, which has existed since V2), donations, and all live `SystemManagementV2` setters (the two retired CST Dutch auction duration setters excepted).
- The upgrade authorization rules (`_authorizeUpgrade` in `CosmicSignatureGameV2Base`: `onlyOwner` + `_onlyRoundIsInactive`), which also govern any future V4+ upgrade.

## Changes In Shared Sources Attributed To V3

- `production/libraries/CosmicSignatureConstants.sol`: new constants `INITIAL_ROUND_LATE_BID_DURATION` (20 minutes), `DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR` (3_000_000), `ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT` (13), `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER` (`3567993 << 13`), `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT` (8), `INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE` (`1 ether`), `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` (derived from the former; ~1 CST/minute at the initial main prize time increment), `DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3` (`1 ether`), `INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER` (~`1 ether / 60`), `DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR` (100), `DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS` (3), and V3-specific constants for the five ETH prize percentages (20/5/5/5/15). The V2 constant `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` was renamed to `DEFAULT_BID_CST_REWARD_AMOUNT_RADICAND_MULTIPLIER` (same value; V2's `reinitialize` uses it). The V3 defaults are consumed by `CosmicSignatureGameV3.reinitialize`.
- Extract-base refactorings that let V3 reuse V2 code without changing V2's ABI (other than the initializer rename below) or behavior:
  - `CosmicSignatureGameStorageV2` was split into `CosmicSignatureGameStorageV2Base` (all state variables) + `CosmicSignatureGameStorageV2` (the storage gaps); the V2 modules now derive from the base, so `CosmicSignatureGameStorageV3Base` can extend it before the gap.
  - `CosmicSignatureGameV2Base` was extracted from `CosmicSignatureGameV2` (constructor with `_disableInitializers`, the virtual `reinitialize()` declaration, `_onlyIfPrevVersionWasInitialized`, `_authorizeUpgrade`).
  - `MainPrizeV2Base` was extracted from `MainPrizeV2` (`claimMainPrize`, `_prepareNextRound`, `getMainEthPrizeAmount`, `getCharityEthDonationAmount`, and the virtual `_distributePrizes` declaration).
  - `getNextEthBidPriceAdvanced`, `getNextCstBidPriceAdvanced`, `getBidCstRewardAmountAdvanced`, `_bidWithEth`, and `_bidWithCst` are `virtual` in `BiddingV2Base`; `BiddingV3` overrides them (the bid methods wholesale, since the reward recipient, the throttle, and the pricing changed). The V2 bodies live in the `BiddingV2` leaf, which V3 does not inherit, so no stale V2 leaf code is reachable on V3.
  - Renames: `BiddingBase`/`BiddingBaseV2` -> `BiddingCommon`/`BiddingCommonV2`, `MainPrizeBase`/`MainPrizeBaseV2` -> `MainPrizeCommon`/`MainPrizeCommonV2` (abstract contracts and interfaces; no ABI impact).
  - Interface flattening: interfaces no longer inherit `ICosmicSignatureGameStorage`/each other; `IMainPrize` was split into `IMainPrize1` (methods) + `IMainPrize2` (the V2- `MainPrizeClaimed` event), so `IMainPrizeV3` can combine `IMainPrize1` with `IMainPrize2V3`. `IMainPrizeV2` and `ICosmicSignatureGameOpenBid` were removed as redundant.
- **`initializeV2()` was renamed to `reinitialize()`** (in `CosmicSignatureGameV2`, `ICosmicSignatureGameV2`, and the `CosmicSignatureGameOpenBid` test prototype), so that every version's upgrade initializer shares one name declared once in `CosmicSignatureGameV2Base`. This changes the V2 *source* ABI relative to the deployed V2 implementation; it is inconsequential on-chain because the deployed V2's `initializeV2` has already run and can never be called again (`reinitializer(2)`). Freshly compiled V2 sources are only used by tests and as the baseline for upgrade validation.
- Verification that the refactorings changed nothing else: see `docs/v3-upgrade-review-2026-08.md` for the full
  old-vs-new V1 and V2 comparison (storage, ABI, behavior). Summary: the V1 ABI differs only by
  `getCstDutchAuctionDurations` returning `(uint256, uint256)` instead of `(uint256, int256)`; the V2 ABI
  additionally differs by `initializeV2()` -> `reinitialize()`. V1/V2 behavior is unchanged on all reachable paths
  (arithmetic refactored into `CosmicSignatureHelpers.tryIncreaseValueExponentially`/`tryReduceValueExponentially`
  and `ArbitrumHelpers._tryCallPrecompile` is algebraically/observably identical), and stays covered by the
  exact-assertion V1/V2 suites and the fuzz campaign's V1/V2 phases.
- 2026-08 bytecode size work (V3 was 1,024 bytes over the EIP-170 limit; with the prize migration it is now 154 bytes under): per-file compiler
  override for `CosmicSignatureGameV3.sol` (optimizer runs=1, no CBOR metadata; Comment-202608121 in
  `hardhat.config.js`), shared emit/validation helpers in `BiddingV3` (Comment-202608122, Comment-202608124), and
  the `ArbitrumHelpers` consolidation (Comment-202608125).
- Test contracts `tests/BidderContract.sol` and `tests/MaliciousActorBase.sol`: the version routing changed from `contractVersionNumber != 2` to `contractVersionNumber < 2`, so `contractVersionNumber = 3` uses the V2-compatible call shapes (which V3 keeps).
