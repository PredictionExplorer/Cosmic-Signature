# V3 Upgrade Review (2026-08)

Comparison of the production contracts on the `v3-2026-07-24` branch against the `main` branch (commit `3f52eaaf`, the old code), plus verification of the inheritance hierarchy, override resolution, and upgrade storage compatibility. Everything below was measured from compiler output (production configuration, solc 0.8.34, via-IR): storage layouts and ABIs were extracted from the standard-JSON output of both branches and diffed programmatically; inheritance was verified from the compiler's C3 linearization in the AST.

With regard to the Game contract, "old V1"/"old V2" mean `CosmicSignatureGame`/`CosmicSignatureGameV2` compiled from `main`, and "new V1"/"new V2"/"V3" mean the same names compiled from this branch.

## 1. Storage Layout

### Old V1 vs new V1, old V2 vs new V2

**Identical.** Every variable occupies the same slot and offset with the same label and type in both branches. (The only textual differences in the compiler output are AST node IDs embedded in type names, which change when source files change; they do not affect the layout.)

### New V1 -> new V2 (the already-live upgrade)

- Slot 277: `cstDutchAuctionDurationDivisor` repurposed as `cstDutchAuctionDuration` (`@custom:oz-renamed-from`).
- Slot 283: `bidCstRewardAmount` repurposed as `bidCstRewardAmountMultiplier` (`@custom:oz-renamed-from`).
- Slot 307 (the first V1 gap slot): new variable `cstDutchAuctionDurationChangeDivisor`; the gap shrinks to `(1 << 30) - 1`.

### New V2 -> V3 (the upgrade being prepared)

- Slot 308 (the first V2 gap slot): `championDurations` mapping.
- Slots 309-314: `cstBidPriceDeclineMultiplier`, `cstBidPriceDeclineMultiplierChangeDivisor`, `roundLateBidDurationDivisor`, `roundLateBidPricePremiumAmountBaseMultiplier`, `roundLateBidPricePremiumAmountExponent`, `mainPrizeNumCosmicSignatureNfts`.
- The gap shrinks to `(1 << 30) - 1 - 7`; the end-of-gap position is exactly preserved (V2 gap: slots 308..306+2^30; V3 gap: slots 315..306+2^30).
- **No slots are renamed or repurposed.** `cstDutchAuctionDuration`, `cstDutchAuctionDurationChangeDivisor` keep their slots and (stale) values; V3 stops using them. `bidCstRewardAmountMultiplier`, `cstDutchAuctionBeginningBidPriceMinLimit`, and the five ETH prize percentages keep their slots but are re-initialized by the V3 `reinitialize` (see section 3).

**Conclusion: the V1 -> V2 -> V3 proxy storage layout is fully compatible.** This is additionally enforced by `hre.upgrades.validateUpgrade` with no unsafe flags (`test/tests-src/CosmicSignatureGameV3-StorageLayout.js`) and by the fuzz campaign's upgrade phases, which snapshot and diff every remaining carried-over getter and assert every intentional overwrite across both upgrades.

## 2. ABI

### Old V1 -> new V1

- `getCstDutchAuctionDurations()` returns `(uint256, uint256)` instead of `(uint256, int256)`. View-only; the second value (the elapsed duration) cannot be negative in any reachable state, so no caller-visible values change. Attribution: V3 (a refactoring of shared code made for V3 that also recompiles into V1; the deployed V1 bytecode is not affected and V1 will never be redeployed).
- Nothing else: no selectors added or removed.

### Old V2 -> new V2

- `initializeV2()` renamed to `reinitialize()` (selector change). Attribution: V3 (so that every version's upgrade initializer shares one name declared in `CosmicSignatureGameV2Base`). Inconsequential on-chain: the deployed V2's `initializeV2` has already run and can never run again (`reinitializer(2)`).
- The same `getCstDutchAuctionDurations` return-type change as in V1.
- `constructor()` no longer appears in the V2 ABI JSON because it moved to the abstract `CosmicSignatureGameV2Base`. The compiled implementation still executes `_disableInitializers()` on deployment (base constructors always run), so there is no hardening regression.

### New V2 -> V3

Added (nothing is removed):

- Getters for the 7 new storage variables listed in section 1 (incl. `championDurations(uint256)`).
- `getRoundLateBidDuration() view returns (uint256)`.
- Setters: `setCstBidPriceDeclineMultiplier`, `setCstBidPriceDeclineMultiplierChangeDivisor`, `setRoundLateBidDurationDivisor`, `setRoundLateBidPricePremiumAmountBaseMultiplier`, `setRoundLateBidPricePremiumAmountExponent`, `setMainPrizeNumCosmicSignatureNfts`.
- Events: `CstBidPriceDeclineMultiplierChanged`, `CstBidPriceDeclineMultiplierChangeDivisorChanged`, `RoundLateBidDurationDivisorChanged`, `RoundLateBidPricePremiumAmountBaseMultiplierChanged`, `RoundLateBidPricePremiumAmountExponentChanged`, `MainPrizeNumCosmicSignatureNftsChanged`.
- Errors: `BidPlacedWithinCurrentSecond()`, `NotImplemented()`, `ZeroValue()`.
- `MainPrizeClaimed` gains the `prizeNumCosmicSignatureNfts` parameter, which **changes its topic0**; indexers keyed on the V2 signature will not see V3 claims.
- `BidPlaced` keeps its signature (topic0 unchanged), but the 8th parameter's meaning changes from `cstDutchAuctionDuration` to `cstBidPriceDeclineMultiplier`. Indexers must reinterpret that field.

## 3. Externally Visible Behavior Changes

### Attributed to V1 (new vs old)

None. The `nextEthBidPrice` and `mainPrizeTimeIncrementInMicroSeconds` formulas were rewritten via `CosmicSignatureHelpers.tryIncreaseValueExponentially`, which computes the identical value.

### Attributed to V2 (new vs old)

Only the `initializeV2()` -> `reinitialize()` rename (see ABI). Event order, revert conditions and event payloads are unchanged.

### Attributed to V3 (vs the live V2)

1. **CST bid price: linear decline replaces the remaining-duration auction.** The price now declines from `cstDutchAuctionBeginningBidPrice` at `cstBidPriceDeclineMultiplier` CST Wei per second, floored at zero. The decline rate increases ~1% on every ETH bid and decreases ~1% on every CST bid (`cstBidPriceDeclineMultiplierChangeDivisor = 100`), independently of the bid CST reward. `getCstDutchAuctionDurations` still exists; it now returns a duration *derived* from the beginning price and the decline rate. The V2 parameters `cstDutchAuctionDuration`/`cstDutchAuctionDurationChangeDivisor` become vestigial: their getters return stale values and their setters revert with `NotImplemented`.
2. **Bid CST reward: linear formula, minted entirely to the previous bidder.** `reward = elapsedSeconds * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` (~1 CST per minute at the initial main prize time increment; the V2 sqrt formula is gone). The whole reward is minted to `lastBidderAddress` (the bidder being outbid); the bidder placing the bid receives nothing. On the first bid in a round nothing is minted, `BidPlaced.bidCstRewardAmount` is 0, and `bidCstRewardAmountMinLimit_` is ignored. `getBidCstRewardAmountAdvanced` returns 0 while no bid exists in the round (Comment-202608176). The V3 `reinitialize` re-initializes `bidCstRewardAmountMultiplier` (the V2 sqrt-radicand value in that slot would be astronomically wrong for the linear formula).
3. **At most 1 bid per second.** A bid in the same second as the previous bid reverts with the new `BidPlacedWithinCurrentSecond` error (both ETH and CST paths). Same-block bid bursts now succeed only for the first bid.
4. **Round late bid price premium.** Within `getRoundLateBidDuration()` (~20 minutes) before `mainPrizeTime`, ETH and CST bid prices grow by an exponentially accelerating premium reaching ~4x the base price. New revert possibility near `mainPrizeTime`: a bid priced without the premium reverts with `InsufficientReceivedBidAmount`.
5. **Multi-NFT main prize.** The beneficiary receives `mainPrizeNumCosmicSignatureNfts` (default 3) sequential Cosmic Signature NFTs. In `claimMainPrize`, the **event order changed**: `MainPrizeClaimed` is now emitted *before* `RaffleWinnerPrizePaid`/`ChronoWarriorPrizePaid`/`EnduranceChampionPrizePaid`/`LastCstBidderPrizePaid` (in V2 it was emitted last). The beneficiary's NFT IDs are now the *highest* in the minted block; the last CST bidder's NFT is ID `firstCosmicSignatureNftId`.
6. **First-in-round CST bid attempt** still reverts with `RoundIsInactive`/`WrongBidType` exactly like V2 (an explicit check near Comment-202608167; without it the new reward-minting logic would have reverted with an unhelpful `ERC20InvalidReceiver`).
7. **`cstDutchAuctionBeginningBidPriceMinLimit` re-initialized to 1 CST** (from 200 CST), effectively eliminating the floor while keeping the never-terminating-round margin protection. The V3 `reinitialize` overwrites whatever value V2 had.
8. **Configuration setter validation (Comment-202608171).** `setMainPrizeNumCosmicSignatureNfts`, `setRoundLateBidDurationDivisor`, `setRoundLateBidPricePremiumAmountExponent`, `setCstBidPriceDeclineMultiplier`, and `setCstBidPriceDeclineMultiplierChangeDivisor` reject a zero with the new `ZeroValue` error. Rationale: a zero `mainPrizeNumCosmicSignatureNfts` would have permanently bricked the game once a bid exists (claim reverts with `Panic(0x11)` and neither repair nor upgrade is possible while the round is active); the zero divisors would have frozen bidding with `Panic(0x12)` for the rest of the round. Zero remains valid for `setRoundLateBidPricePremiumAmountBaseMultiplier` (disables the premium) and `setBidCstRewardAmountMultiplier` (disables rewards).
9. **Reward-floor robustness (Comment-202608177).** If the owner sets `bidCstRewardAmountMultiplier` to zero or to a value below `mainPrizeTimeIncrementInMicroSeconds`, the reward can floor to zero on a non-first bid. The first-bid branch in `_bidWithEth` is keyed on `lastBidderAddress`, not on the reward being zero, so such a configuration cannot overwrite `ethDutchAuctionBeginningBidPrice` mid-round (which would corrupt the next round's ETH Dutch auction).
10. **ETH prize allocation.** The V3 `reinitialize` changes the existing percentages to 20% main prize, 5% charity, 5% total across 3 bidder-raffle draws, 5% CS NFT stakers, and 15% Chrono Warrior. The paid total remains 50%, so the implicit rollover remains 50%; payout mechanics and raffle count are unchanged.

### Non-game production contracts (old vs new)

`CosmicSignatureToken`, `CosmicSignatureNft`, `RandomWalkNFT`, `PrizesWallet`, `DonatedTokenHolder`, both staking wallets, `MarketingWallet`, and `CharityWallet` are unchanged in storage, ABI, and behavior. `CosmicSignatureDao` changed only in that its proposal threshold constant is now named `DAO_DEFAULT_PROPOSAL_THRESHOLD` instead of aliasing `DEFAULT_BID_CST_REWARD_AMOUNT`; the value (100 CST) is identical.

## 4. Inheritance Hierarchy And Override Resolution

Verified from the compiler's C3 linearization:

- **V1** (`CosmicSignatureGame`) linearizes over only V1 modules. No V2/V3 contract appears in its hierarchy.
- **V2** (`CosmicSignatureGameV2`) linearizes over the V2 modules and shared bases. No V1 game module (`Bidding`, `MainPrize`, ...) and no V3 contract appears.
- **V3** (`CosmicSignatureGameV3`) linearizes over the V3 leaves + the shared V2 bases. `BiddingV2` and `MainPrizeV2` (the V2 leaf implementations) are **absent**, so V3 cannot accidentally execute the V2 `_bidWithEth`/`_bidWithCst`/`_distributePrizes`.
- No contract of a later version acts as a base for a contract of an earlier version, and every abstract production contract acts as a base for at least one concrete contract.
- Override resolution (most-derived wins, verified in the MRO and covered by tests): V3's `_bidWithEth`/`_bidWithCst`/`getNextEthBidPriceAdvanced`/`getNextCstBidPriceAdvanced`/`getBidCstRewardAmountAdvanced`/`getCstDutchAuctionDurations`/`_distributePrizes` resolve to `BiddingV3`/`MainPrizeV3`; `setCstDutchAuctionDuration`/`setCstDutchAuctionDurationChangeDivisor` resolve to `SystemManagementV3` (the `NotImplemented` overrides); `_saveChampionDurations` resolves through the `CosmicSignatureGameV3`/`MainPrizeV3` diamond disambiguations to `BidStatisticsV3` (which writes `championDurations`) and then the `BidStatisticsV2` no-op. The disambiguating overrides in `CosmicSignatureGameV3` all call `super`, which the linearization routes to the V3 implementations.
- `reinitialize` uses `reinitializer(2)`/`reinitializer(3)` respectively; `_checkIfPrevVersionWasInitialized` is version-specific (asserts the previous initialized version); `_authorizeUpgrade` comes from `CosmicSignatureGameV2Base` for V2+ (owner + round inactive).

## 5. Bytecode Size

Production compile, EIP-170 limit 24576 bytes:

| Contract | main branch | this branch (initial) | this branch (current) |
|---|---|---|---|
| V1 | 22437 | 22425 | 22124 |
| V2 | 22920 | 22764 | 22463 |
| V3 | n/a | 25511 (**over by 935**) | **24422 (under by 154)** |

What closed the gap: a per-file compiler override for `CosmicSignatureGameV3.sol` with `optimizer.runs = 1` (Comment-202608121; other contracts keep `runs = 400`), the shared `_emitBidPlaced`/`_checkBidCstRewardAmountMinLimit` helpers in `BiddingV3` (Comment-202608122/202608124), and the shared `_tryCallPrecompile` core in `ArbitrumHelpers` (Comment-202608125).

The 154-byte margin is thin. Measured options if more headroom is needed:

- Moving `_distributePrizes` into a companion contract deployed by the V3 implementation constructor and reached via `delegatecall` puts V3 at **21533 bytes** (~3K of headroom) with no externally visible change; it was prototyped and reverted in favor of the monolith.
- Shortening the long revert message strings saves ~340 bytes (same error selectors, different message payloads).
- The planned removal of string params from errors and events (todo-0 in `CosmicSignatureEvents.sol`) would save the most, at the cost of changing every error selector.

**2026-08 update: the modular delegatecall restructuring superseded the table above.** The V3 Game now consists of
a UUPS implementation plus 2 delegatecall modules sharing the identical storage layout (Comment-202608245).
An initial 3-module variant (stage 2) kept the implementation slim by re-declaring the storage layout with
`internal` visibility and forking the bid hot path; the follow-up de-duplication restructuring (stage 3,
Comment-202608281 relates) removed both duplications: the implementation inherits the original `public`-variable
chassis and the original bid mixins again, and only the cold areas remain in modules. Production sizes at the
uniform `runs = 400`: `CosmicSignatureGameV3` 14,715 bytes (59.9% of the limit),
`CosmicSignatureGamePrizesModuleV3` 11,532 (46.9%), `CosmicSignatureGameAdminModuleV3` 9,639 (39.2%).
The external interface and behavior at the proxy are unchanged, enforced by the ABI/layout/routing/size gates in
`test/tests-src/CosmicSignatureGameV3-ModularEquality.js` and the deterministic behavior-trace replay in
`test/tests-src/CosmicSignatureGameV3-BehaviorParity.js`, both pinned to baselines recorded on the audited monolith
(commit 9496fc31) and committed under `test/baselines/`.
See `docs/v3-vs-v2-changes.md` and the work log for details.

The V2 size drop that looked suspicious ("like 3K less") is explained by the intentional source changes, primarily the `ArbitrumHelpers` and `BiddingV3`/shared-helper deduplication plus normal optimizer variance; old-vs-new V2 sources differ only in the documented ways (section 2/3), and the assert-enabled debug builds (which are the ones the test suite deploys) were never subject to the EIP-170 limit because the Hardhat network runs with `allowUnlimitedContractSize`.

## 6. Test Suite Crash ("insufficient memory") And Lock Errors

Two separate parallel-mocha failure modes were addressed:

- "Error: Lock file is already being held" came from `@openzeppelin/upgrades-core`'s network manifest lock. When a test fails mid-`deployProxy`/`upgradeProxy` (as the stale V3 tests did), the abandoned in-flight deployment can keep the per-worker lock held while the next test in the same worker starts its own deployment. Fixing the stale tests removes the trigger; additionally, each Mocha worker now gets its own temporary folder (Comment-202608173 in `src/MochaHooks.js`), so workers can never contend for each other's manifests.
- The out-of-memory crash is consistent with 8 parallel workers each holding a Hardhat runtime, `hardhat-tracer` state, and multi-megabyte build-info/validation JSON parses. The build-info files shrank as part of the compilation split, and the per-worker temp isolation removes redundant manifest re-reads. If the crash reproduces on a smaller machine, cap Mocha's parallelism (`mocha.jobs`) in `hardhat.config.js`.

## 7. Verified todo-0 Questions

- `INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER` = 16_666_666_666_666_667 ≈ 1/60 of 1 ether per second, as intended (the CST price declines ~1 CST per minute initially).
- `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` = 6e25 exactly; `reward(60s) = 60 * 6e25 / mainPrizeTimeIncrementInMicroSeconds`, which is exactly 1 CST per minute at the initial increment (3.6e9) and ~1% less per completed round. Covered by `CosmicSignatureGameV3-BidCstReward.js`.
- The `MainPrizeV3` beneficiary NFT loop makes exactly `mainPrizeNumCosmicSignatureNfts` iterations; covered by `CosmicSignatureGameV3-MainPrize.js` for counts 1, 3, 5, and a random count.
- The V3 ETH prize getters use the 20/5/5/5/15 allocation, the bidder-raffle total divides exactly across 3 draws for a rounding-safe balance, and the other 50% remains in the game; covered by `CosmicSignatureGameV3-MainPrize.js`.

## 8. Live-Chain State And Upgrade Validation (2026-08-14)

On-chain facts read from Arbitrum One: the game proxy `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2` holds
implementation `0x50eB3d05d2C463949DE9238D419385594f7AdB97`, its `Initializable` version is **2**, and its owner is
`0x14c82CE4E5713E88C9462680e9C02Bf4A3089871`. The production upgrade is therefore exactly V2 -> V3 via
`upgradeToAndCall(newImplementation, abi.encodeCall(reinitialize))`.

Validation performed against that live state:

- **Fork rehearsal (Comment-202608128): PASSING.** `tasks/src/fork-rehearse-cosmic-signature-game-v3-upgrade.js`
  forks live Arbitrum One in the in-process Hardhat Network, impersonates the owner, executes the real
  `upgradeToAndCall` + `reinitialize`, and verifies: implementation and initialized-version change; all 42
  remaining carried-over storage getters unchanged; the 7 intentional `reinitialize` overwrites and 6 new parameters at the
  expected defaults; the five ETH prize percentages total 50% and the raffle count remains 3;
  `InvalidInitialization` on a reinitialize replay; `NotImplemented` on the retired setters;
  `ZeroValue` validation; then smoke-tests gameplay on the upgraded fork (ETH bid, same-second throttle revert,
  the whole bid CST reward minted to the previous bidder, `claimMainPrize` minting 3 CS NFTs to the beneficiary,
  `championDurations` persisted, `roundNum` incremented). Runner:
  `tasks/runners/run-fork-rehearse-cosmic-signature-game-v3-upgrade-arbitrumOne.bash`.
- **OpenZeppelin `validateUpgrade(CosmicSignatureGameV2, CosmicSignatureGameV3, {kind: "uups"})`: clean**, with no
  unsafe flags.
- **`slither-check-upgradeability` V2 -> V3** (via the `SLITHER_UNIFORM_BUILD` compilation, Comment-202608134):
  only the two expected benign finding groups inherent to the gap-consumption pattern ("different variables" for
  the V2 gap slot now holding `championDurations`, and "extra variables" for the 7 appended V3 variables + the
  shrunk gap). No genuine incompatibilities.

Operational notes: the upgrade transaction requires an inactive bidding round; the upgrade task can now run from
any machine (proxy address + `forceImport` fallbacks in the upgrade config, Comment-202608126/202608127). See
`tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` for the full runbook.
