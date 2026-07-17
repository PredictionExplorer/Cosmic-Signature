# CosmicSignatureGame V3 vs V2 Changes

This document compares `CosmicSignatureGameV3` (the version to upgrade the proxy to next) with `CosmicSignatureGameV2` (the version currently live on Arbitrum One). It is the reference for auditors, for the frontend/backend/indexer teams, and for the upgrade operator. See also `docs/round-termination-proof.md`, which derives the V3 CST tokenomics design and proves that every bidding round ends.

V3 is implemented by deriving from the V2 module hierarchy. New sources (all under `contracts/production/`):

- `CosmicSignatureGameV3.sol`, `CosmicSignatureGameStorageV3.sol`, `CosmicSignatureGameStorageV3Base.sol`, `BiddingV3.sol`, `MainPrizeV3.sol`, `SystemManagementV3.sol`
- Interfaces: `IBiddingV3.sol`, `IMainPrizeV3.sol`, `IMainPrize2V3.sol`, `ISystemManagementV3.sol`, `ISystemEventsV3.sol`

V3 reuses the V2 modules unchanged: `CosmicSignatureGameV2Base` (constructor, `reinitialize` declaration, `_authorizeUpgrade`), `MainPrizeCommonV2`, `SystemManagementV2` (as the base of `SystemManagementV3`), `EthDonationsV2`, `NftDonationsV2`, `BidStatisticsV2`, `BiddingV2` (as the base of `BiddingV3`), `SecondaryPrizesV2`, `MainPrizeV2Base` (as the base of `MainPrizeV3`). `MainPrizeV2` (the V2 `_distributePrizes`) is not inherited by V3; `MainPrizeV3` overrides `_distributePrizes` instead.

V3 is deployed by **upgrading the existing proxy** (UUPS `upgradeToAndCall` with `reinitialize` as the call payload), so "ABI changes" below describe what changes for callers of the proxy once it is upgraded. Unlike the V1 -> V2 upgrade, this upgrade needs **no unsafe OpenZeppelin flags**: no storage slots are renamed or repurposed, and the `.openzeppelin` manifest already reflects the V2 layout (see `tasks/config/upgrade-cosmic-signature-game-config-<network-name>-CosmicSignatureGameV3.json`, where `unsafeAllowRenames` and `unsafeSkipStorageCheck` are `false`).

## Storage Layout

The V1 -> V2 -> V3 game proxy storage layout remains fully compatible:

- V3 appends exactly 6 new variables in `CosmicSignatureGameStorageV3Base` (which derives from `CosmicSignatureGameStorageV2Base`): the `championDurations` mapping and 5 `uint256`s: `roundLateBidDurationDivisor`, `roundLateBidPricePremiumAmountBaseMultiplier`, `roundLateBidPricePremiumAmountExponent`, `lastBidderBidCstRewardAmountPercentage`, `mainPrizeNumCosmicSignatureNfts`.
- `CosmicSignatureGameStorageV3.__gap_persistent` shrank by 6 slots to `uint256[(1 << 30) - 1 - 6]` to compensate, so all pre-existing variables keep their slots.
- No slots are renamed or repurposed (the V1 -> V2 upgrade repurposed 2 slots; V3 does nothing of the kind). In particular, `bidCstRewardAmountMultiplier` keeps its slot; `reinitialize()` resets it to the V3 default, and it becomes the single knob of the V3 CST economy (see the "CST time standard" behavior change below). Conversely, `cstDutchAuctionDuration`, `cstDutchAuctionDurationChangeDivisor`, and `cstDutchAuctionBeginningBidPriceMinLimit` keep their slots and values, but V3's pricing logic no longer reads them; their `SystemManagementV2` setters keep working but no longer affect anything.

This is verified by OpenZeppelin `validateUpgrade` in `test/tests-src/CosmicSignatureGameV3-StorageLayout.js`, by `slither/slither-check-upgradeability-CosmicSignatureGameV3.bash`, and by the fuzz campaign's V2 -> V3 upgrade phase, which snapshots and diffs every carried-over getter (including the V2 parameters).

## ABI Changes

### 1. New public storage getters (`CosmicSignatureGameStorageV3Base`)

| Getter | Initialized by `reinitialize()` to |
|---|---|
| `roundLateBidDurationDivisor()` | 3_000_000 (a ~20-minute late-bid window for the initial 1-hour main prize time increment) |
| `roundLateBidPricePremiumAmountBaseMultiplier()` | `3567993 << 13` = 29_228_998_656 |
| `roundLateBidPricePremiumAmountExponent()` | 8 |
| `lastBidderBidCstRewardAmountPercentage()` | 90 |
| `mainPrizeNumCosmicSignatureNfts()` | 3 |
| `championDurations(uint256 roundNum)` | (mapping; populated at each `claimMainPrize`) |

`reinitialize()` also resets the pre-existing `bidCstRewardAmountMultiplier` to `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` = `6 * 10^25` (~1 CST per minute at the initial 1-hour main prize time increment; see the reward behavior change below).

### 2. New view methods (`BiddingV3`)

- `getRoundLateBidDuration() returns (uint256)` = `mainPrizeTimeIncrementInMicroSeconds / roundLateBidDurationDivisor`. The duration before `mainPrizeTime` during which the bid price premium applies. Like other divisor-derived durations, it stretches ~1% per completed round.
- `getBidCstRewardAmountPerMainPrizeTimeIncrement() returns (uint256)` — the CST amount that accrues over one main prize time increment (Comment-202607165); 60 CST at defaults. This is the rate at which the bid CST reward grows and the CST bid price declines.
- `getCstDutchAuctionBeginningBidPriceMinLimit() returns (uint256)` — the derived CST Dutch auction restart floor, `3 * bidCstRewardAmountMultiplier / 10^6` (Comment-202607166); 180 CST at defaults. Not to be confused with the now-ignored `cstDutchAuctionBeginningBidPriceMinLimit()` storage getter.

### 3. New configuration setters (`SystemManagementV3`, `onlyOwner` + `_onlyRoundIsInactive`)

- `setRoundLateBidDurationDivisor(uint256)`
- `setRoundLateBidPricePremiumAmountBaseMultiplier(uint256)`
- `setRoundLateBidPricePremiumAmountExponent(uint256)`
- `setLastBidderBidCstRewardAmountPercentage(uint256)`
- `setMainPrizeNumCosmicSignatureNfts(uint256)`

### 4. New events (`ISystemEventsV3`)

- `RoundLateBidDurationDivisorChanged(uint256 newValue)`
- `RoundLateBidPricePremiumAmountBaseMultiplierChanged(uint256 newValue)`
- `RoundLateBidPricePremiumAmountExponentChanged(uint256 newValue)`
- `LastBidderBidCstRewardAmountPercentageChanged(uint256 newValue)`
- `MainPrizeNumCosmicSignatureNftsChanged(uint256 newValue)`

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

- `reinitialize()`, declared `reinitializer(3)`. Executed once, as the `upgradeToAndCall` payload during the upgrade; it only sets the 5 new V3 `uint256` parameters and `bidCstRewardAmountMultiplier` to the defaults listed above. The selector is unchanged from V2's `reinitialize()` (a second call on the upgraded proxy reverts with `InvalidInitialization`).
- Like in V2, the important preconditions (`_onlyNonFirstRound`, `_onlyIfPrevVersionWasInitialized`) are assert-only production no-ops; the real protection is V2's `_authorizeUpgrade` (`onlyOwner` + `_onlyRoundIsInactive`). `test/tests-src/CosmicSignatureGameV3-GuardsAndMisconfig.js` documents both.

### 7. No selectors removed; no new custom errors

Everything callable on V2 remains callable on V3 with the same signatures and semantics, except where noted under behavior changes. (The V1 -> V2 upgrade removed selectors; V3 removes none.)

## Externally Visible Behavior Changes

### 1. Late bid price premium (`BiddingV3`)

Within `getRoundLateBidDuration()` seconds before `mainPrizeTime` (and after it, if the round remains unclaimed), every ETH and CST bid price is increased by an exponentially accelerating premium:

- `getNextEthBidPriceAdvanced` and `getNextCstBidPriceAdvanced` (and therefore `getNextEthBidPrice`, `getNextCstBidPrice`, and every bid method) return/charge the adjusted price.
- The premium amount is `((elapsed * baseMultiplier / mainPrizeTimeIncrementInMicroSeconds) ** exponent * price) >> (exponent * 13)`, where `elapsed` is the time since the window opened, clamped to the window length (Comment-202607119).
- With the default parameters the maximum premium amount is ~4x the price, so a bid exactly at (or after) `mainPrizeTime` costs ~5x the unadjusted price.
- Knock-on effects: the premium-adjusted paid price feeds the exponential next-ETH-bid-price ladder (`nextEthBidPrice = paid + paid / ethBidPriceIncreaseDivisor + 1`), the ETH Dutch auction beginning price of the next round (2x the last price), the CST Dutch auction beginning price (2x the paid CST price), `BidPlaced.paidEthPrice` / `paidCstPrice`, and `biddersInfo` spent totals.
- There is no premium before the first bid of a round (no last bidder means no `mainPrizeTime` pressure), so the premium never interferes with the round-opening Dutch auctions.
- New revert possibility: an ETH bid that would have succeeded on V2 can revert with `InsufficientReceivedBidAmount` on V3 if it lands inside the window without paying the premium; a CST bid can similarly exceed `priceMaxLimit_`. Frontends should re-quote prices frequently near `mainPrizeTime`.

### 2. Linear bid CST reward, split 90/10 with the outbid bidder (`BiddingV3`, Comment-202607161)

The V2 sqrt bid CST reward formula is replaced, and the reward is no longer minted entirely to the bidder placing the bid:

- **Formula.** `getBidCstRewardAmountAdvanced` now returns `elapsedSeconds * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds`, where `elapsedSeconds` is the time since the last bid (or since `roundActivationTime` if the round has no bids yet). With the default `bidCstRewardAmountMultiplier = 6 * 10^25` and the initial 1-hour main prize time increment, the reward accrues at exactly 1 CST per minute — 60 CST per increment. Because the divisor is `mainPrizeTimeIncrementInMicroSeconds`, the accrual *per increment* stays constant (`bidCstRewardAmountMultiplier / 10^6`) as increments stretch ~1% per round; the accrual per wall-clock minute correspondingly shrinks.
- **Split.** When a bid is placed, `lastBidderBidCstRewardAmountPercentage` percent of the reward (default 90) is minted to the bidder being outbid (the current `lastBidderAddress`), and the remainder (~10%, plus any rounding dust) is minted to the new bidder. The percentage is an owner-settable V3 parameter.
- **First bid in a round.** There is no bidder to outbid, so only the new bidder ~10% share is minted; the 90% share is simply not minted.
- **Main prize claim.** The reward accrued by the final bidder of the round is NOT minted at `claimMainPrize` — the final bidder wins the main prize instead.
- **ABI/event semantics.** All bid method signatures are unchanged. `bidCstRewardAmountMinLimit_` and the `BidPlaced.bidCstRewardAmount` event field both keep referring to the TOTAL reward amount; indexers/frontends derive the deterministic split themselves (the individual CST `Transfer` mint events also expose the exact amounts). Bidders should note that the amount they personally receive for placing the bid is ~10% of the quoted total.
- **ETH bid mint shape.** An ETH bid mints via `CosmicSignatureToken.mintMany` (the new bidder spec first, then the outbid bidder spec; `mintMany` iterates in reverse order, so the outbid bidder `Transfer` event is emitted first). A CST bid uses one `mintAndBurnMany` call, which iterates in the direct order: the price burn spec, the new bidder mint spec, the outbid bidder mint spec — `Transfer` events in that order.
- **No new attack surface (Comment-202607163).** The reward is minted, never transferred: `CosmicSignatureToken` makes no callbacks into token holders, so a hostile contract that reverts on any incoming call cannot block the 90% share minting, and therefore cannot prevent other people from bidding (covered by `test/tests-src/CosmicSignatureGameV3-BidCstRewardAttack.js`).
- **Economics.** Rewards *telescope*: over any stretch of a round, total minting is capped by the accrual rate times elapsed time, regardless of how many bids land. This is one half of the "CST time standard" described next; `docs/round-termination-proof.md` builds on it.

### 3. The CST time standard: wage-rate Dutch auction pricing, derived floor, emergent duration (`BiddingV3`, Comment-202607165)

The V2 CST Dutch auction formula (`beginningBidPrice * remainingDuration / cstDutchAuctionDuration`, with the stored duration shrinking on ETH bids and growing on CST bids) is replaced. In V3 a single rate — the bid CST reward accrual rate `bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` — governs both minting and burning:

- **Price formula.** `getNextCstBidPriceAdvanced` returns `max(0, cstDutchAuctionBeginningBidPrice - elapsedSinceAuctionBeginning * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds)`, then applies the late-bid premium. The price falls at exactly the rate at which the bid CST reward grows: 1 CST per minute at defaults. (Before the first CST bid of a round, `nextRoundFirstCstDutchAuctionBeginningBidPrice` serves as the beginning bid price, as in V2.)
- **Derived restart floor (Comment-202607166).** On a CST bid paying `p`, the next auction begins at `max(2 * p, F)` where `F = CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_INCREMENT_REWARD_MULTIPLE (3) * bidCstRewardAmountMultiplier / 10^6` = 3 increments' worth of reward accrual = 180 CST at defaults. The stored `cstDutchAuctionBeginningBidPriceMinLimit` (200 CST) is ignored. The multiple must exceed 2; this guarantees every round ends — see `docs/round-termination-proof.md` for the proof and for why 3.
- **Emergent duration, capped at 12 increments (Comment-202607170).** The auction duration is no longer a parameter: the price reaches zero after exactly `ceil(beginningBidPrice * mainPrizeTimeIncrementInMicroSeconds / bidCstRewardAmountMultiplier)` seconds (3 hours from the floor, at defaults; proportionally longer after larger paid prices), but never later than `CST_DUTCH_AUCTION_DURATION_INCREMENT_MAX_MULTIPLE` (12) increments — matching V2's classic 12 hours at the initial increment. Above the cap (a beginning bid price over 12 increments' worth of accrual, 720 CST at defaults) the price declines proportionally faster, V2-style, so one whale bid cannot freeze the CST lane for weeks. `cstDutchAuctionDuration`, `cstDutchAuctionDurationChangeDivisor`, and the duration drift are retired: V3 bids do not read or write them. Their `SystemManagementV2` setters (`setCstDutchAuctionDuration`, `setCstDutchAuctionDurationChangeDivisor`, `setCstDutchAuctionBeginningBidPriceMinLimit`) keep working and emitting events but no longer affect anything.
- **View/event semantics.** `getCstDutchAuctionDurations()` returns the emergent duration (plus the unchanged elapsed duration). The `BidPlaced.cstDutchAuctionDuration` field now carries the emergent duration of the auction in effect after the bid.
- **Timing consequences for frontends.** At round start the price now decays to zero in ~3.4 hours (200 CST at the wage rate, vs. ~12 hours on V2), and after a paid CST bid the decay time scales with the paid price (`2p / rate`, capped at 12 increments) instead of being fixed. `getNextCstBidPrice`/`getNextCstBidPriceAdvanced` remain the source of truth.
- **Why.** The old design guaranteed round termination only through an undocumented inequality (the 200 CST floor exceeding twice the ~60 CST/increment reward accrual) plus an asymptotic duration-drift argument, and the drift's 250-second duration floor admitted a bounded free-bidding corner. The time standard makes the invariant explicit, uniform, and self-scaling; the drift's stated purpose (balancing ETH and CST bids) is subsumed by the price itself (heavy CST use ratchets the beginning price up 2x per bid; disuse decays it to free at the wage rate).
- **Tests.** `test/tests-src/CosmicSignatureGameV3-CstAuction.js` (exact price/floor/duration assertions), `test/tests-src/CosmicSignatureGameV3-TerminationInvariant.js` (the proof's potential function asserted on-chain under adversarial bid timing, plus greedy-cartel zombie impossibility), and the fuzz campaign's V3 phase and invariants.

### 4. Multi-NFT main prize (`MainPrizeV3`)

- The main prize beneficiary receives `mainPrizeNumCosmicSignatureNfts` (default 3) Cosmic Signature NFTs instead of 1, minted as one sequential ID block. All other prize NFT counts (last CST bidder, Endurance Champion, Chrono-Warrior, raffle winners, Random Walk NFT stakers) are unchanged, as are all CST amounts and all ETH amounts.
- The CST/NFT recipient bookkeeping inside `_distributePrizes` was restructured accordingly (Comment-202511094, Comment-202511104, Comment-202606011: in V3+ the number of CS NFTs minted exceeds the number of CST prize mints by `mainPrizeNumCosmicSignatureNfts - 1`, and the item order differs).

### 5. Owner misconfiguration footguns (new revert modes; benevolent-owner assumption)

- `setMainPrizeNumCosmicSignatureNfts(0)`: every subsequent `claimMainPrize` reverts with `Panic(0x11)` (checked underflow in the NFT owner array allocation). Because the setter and `_authorizeUpgrade` both require an inactive round, a round that already has a bid **cannot be repaired: the game bricks permanently**.
- `setRoundLateBidDurationDivisor(0)`: once a round has a bid, every price view and every further bid reverts with `Panic(0x12)` (division by zero). `claimMainPrize` still works, so the round completes and the owner can repair the parameter afterwards.
- Extreme `roundLateBidPricePremiumAmountBaseMultiplier` / `roundLateBidPricePremiumAmountExponent` values can make the premium arithmetic wrap (the formula runs in an `unchecked` block in production builds), producing bogus prices; in SMTChecker builds (where `unchecked` is preprocessed away) the same state panics with `Panic(0x11)` instead.
- An absurdly high `bidCstRewardAmountMultiplier` (on the order of `2^190`) can make the (`unchecked`) reward and price arithmetic wrap; sane values are nowhere near that. `setBidCstRewardAmountMultiplier(0)` does not revert anything: rewards stop accruing, the wage-rate decline degenerates so the CST bid price declines over the 12-increment duration cap instead (Comment-202607170), and the derived floor becomes 0, so a CST bid at price 0 makes all subsequent CST bids free. No CST is minted in that state, so this is deflationary, not dangerous. See `docs/round-termination-proof.md` §6.
- `setLastBidderBidCstRewardAmountPercentage` above 100: the new bidder mint spec underflows, so every bid that follows a bid reverts (`Panic(0x11)` in checked builds; a huge bogus mint in production `unchecked` builds is prevented by the assert in `_getLastBidderBidCstRewardAmount` only in assert-enabled builds). Keep it at or below 100.

The revert-mode footguns are documented by `test/tests-src/CosmicSignatureGameV3-GuardsAndMisconfig.js`.

### 6. What did not change

- All V2 bid method signatures and validations, including the `bidCstRewardAmountMinLimit_` mechanism (though it now guards the total of the split linear reward).
- `mainPrizeTime` extension (unchecked add, no clamping), claim authorization and timeout logic, `_prepareNextRound` (including the Comment-202606235 unchecked overflow hardening).
- The CST Dutch auction restart multiplier (2x the paid price) and the `nextRoundFirstCstDutchAuctionBeginningBidPrice` cross-round carryover.
- All ETH prize amounts and percentages, the end-of-round CST prize amounts, the charity donation, the staking deposit, `PrizesWallet` interactions (including `setPrizesWallet`, which has existed since V2), donations, and all `SystemManagementV2` setters (though the three CST Dutch auction ones become inert, as described above).
- The upgrade authorization rules (`_authorizeUpgrade` in `CosmicSignatureGameV2Base`: `onlyOwner` + `_onlyRoundIsInactive`), which also govern any future V4+ upgrade.

## Changes In Shared Sources Attributed To V3

- `production/libraries/CosmicSignatureConstants.sol`: new constants `INITIAL_ROUND_LATE_BID_DURATION` (20 minutes), `DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR` (3_000_000), `ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT` (13), `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER` (`3567993 << 13`), `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT` (8), `INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE` (`1 ether`), `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` (`6 * 10^25`), `DEFAULT_LAST_BIDDER_BID_CST_REWARD_AMOUNT_PERCENTAGE` (90), `DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS` (3), `CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_INCREMENT_REWARD_MULTIPLE` (3; Comment-202607166), `CST_DUTCH_AUCTION_DURATION_INCREMENT_MAX_MULTIPLE` (12; Comment-202607170). The defaults are consumed by `CosmicSignatureGameV3.reinitialize`.
- Extract-base refactorings that let V3 reuse V2 code without changing V2's ABI (other than the initializer rename below) or behavior:
  - `CosmicSignatureGameStorageV2` was split into `CosmicSignatureGameStorageV2Base` (all state variables) + `CosmicSignatureGameStorageV2` (the storage gaps); the V2 modules now derive from the base, so `CosmicSignatureGameStorageV3Base` can extend it before the gap.
  - `CosmicSignatureGameV2Base` was extracted from `CosmicSignatureGameV2` (constructor with `_disableInitializers`, the virtual `reinitialize()` declaration, `_onlyIfPrevVersionWasInitialized`, `_authorizeUpgrade`).
  - `MainPrizeV2Base` was extracted from `MainPrizeV2` (`claimMainPrize`, `_prepareNextRound`, `getMainEthPrizeAmount`, `getCharityEthDonationAmount`, and the virtual `_distributePrizes` declaration).
  - `getNextEthBidPriceAdvanced` and `getNextCstBidPriceAdvanced` became `virtual` in `BiddingV2` so `BiddingV3` can wrap them.
  - `getBidCstRewardAmountAdvanced` became `virtual` in `BiddingV2`, and the two bid CST reward minting sites were extracted into `internal virtual` hooks `_mintBidCstRewardAmountIfNeeded` (ETH bids) and `_burnCstBidPriceAndMintBidCstRewardAmountIfNeeded` (CST bids; Comment-202607162), so `BiddingV3` can override the reward formula and the minting split without duplicating any other bidding logic. The V2 hook bodies are verbatim the code they were extracted from.
  - Similarly, for the CST time standard, the three CST Dutch auction state-update sites were extracted into `internal virtual` hooks with verbatim V2 bodies: `_getCstDutchAuctionBeginningBidPriceMinLimit` (the restart floor), `_updateCstDutchAuctionOnEthBid` (the V2 duration shrink), and `_updateCstDutchAuctionOnCstBid` (the V2 duration grow); the latter two return the value emitted as `BidPlaced.cstDutchAuctionDuration`. `getCstDutchAuctionDurations` became `public virtual` (was `external`), and `_getCstDutchAuctionElapsedDuration` became `internal` (was `private`), so `BiddingV3` can override/reuse them.
  - Renames: `BiddingBase`/`BiddingBaseV2` -> `BiddingCommon`/`BiddingCommonV2`, `MainPrizeBase`/`MainPrizeBaseV2` -> `MainPrizeCommon`/`MainPrizeCommonV2` (abstract contracts and interfaces; no ABI impact).
  - Interface flattening: interfaces no longer inherit `ICosmicSignatureGameStorage`/each other; `IMainPrize` was split into `IMainPrize1` (methods) + `IMainPrize2` (the V2- `MainPrizeClaimed` event), so `IMainPrizeV3` can combine `IMainPrize1` with `IMainPrize2V3`. `IMainPrizeV2` and `ICosmicSignatureGameOpenBid` were removed as redundant.
- **`initializeV2()` was renamed to `reinitialize()`** (in `CosmicSignatureGameV2`, `ICosmicSignatureGameV2`, and the `CosmicSignatureGameOpenBid` test prototype), so that every version's upgrade initializer shares one name declared once in `CosmicSignatureGameV2Base`. This changes the V2 *source* ABI relative to the deployed V2 implementation; it is inconsequential on-chain because the deployed V2's `initializeV2` has already run and can never be called again (`reinitializer(2)`). Freshly compiled V2 sources are only used by tests and as the baseline for upgrade validation.
- Verification that the refactorings changed nothing else: compiling the `main` branch and this branch with the production configuration and comparing artifacts shows the V1 game's ABI and runtime bytecode are **identical** (sans CBOR metadata), and the V2 game's ABI differs **only** by `initializeV2()` -> `reinitialize()`. The V2 runtime bytecode differs by the dispatch reordering that the changed selector causes and by the code layout effects of the `BiddingV2` virtualization refactorings (whose V2 behavior is unchanged and stays covered by the exact-assertion V1/V2 suites and the fuzz campaign's V1/V2 phases).
- Test contracts `tests/BidderContract.sol` and `tests/MaliciousActorBase.sol`: the version routing changed from `contractVersionNumber != 2` to `contractVersionNumber < 2`, so `contractVersionNumber = 3` uses the V2-compatible call shapes (which V3 keeps).
