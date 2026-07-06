# CosmicSignatureGame V3 vs V2 Changes

This document compares `CosmicSignatureGameV3` (the version to upgrade the proxy to next) with `CosmicSignatureGameV2` (the version currently live on Arbitrum One). It is the reference for auditors, for the frontend/backend/indexer teams, and for the upgrade operator.

V3 is implemented by deriving from the V2 module hierarchy. New sources (all under `contracts/production/`):

- `CosmicSignatureGameV3.sol`, `CosmicSignatureGameStorageV3.sol`, `CosmicSignatureGameStorageV3Base.sol`, `BiddingV3.sol`, `MainPrizeV3.sol`, `SystemManagementV3.sol`
- Interfaces: `IBiddingV3.sol`, `IMainPrizeV3.sol`, `IMainPrize2V3.sol`, `ISystemManagementV3.sol`, `ISystemEventsV3.sol`

V3 reuses the V2 modules unchanged: `CosmicSignatureGameV2Base` (constructor, `reinitialize` declaration, `_authorizeUpgrade`), `MainPrizeCommonV2`, `SystemManagementV2` (as the base of `SystemManagementV3`), `EthDonationsV2`, `NftDonationsV2`, `BidStatisticsV2`, `BiddingV2` (as the base of `BiddingV3`), `SecondaryPrizesV2`, `MainPrizeV2Base` (as the base of `MainPrizeV3`). `MainPrizeV2` (the V2 `_distributePrizes`) is not inherited by V3; `MainPrizeV3` overrides `_distributePrizes` instead.

V3 is deployed by **upgrading the existing proxy** (UUPS `upgradeToAndCall` with `reinitialize` as the call payload), so "ABI changes" below describe what changes for callers of the proxy once it is upgraded. Unlike the V1 -> V2 upgrade, this upgrade needs **no unsafe OpenZeppelin flags**: no storage slots are renamed or repurposed, and the `.openzeppelin` manifest already reflects the V2 layout (see `tasks/config/upgrade-cosmic-signature-game-config-<network-name>-CosmicSignatureGameV3.json`, where `unsafeAllowRenames` and `unsafeSkipStorageCheck` are `false`).

## Storage Layout

The V1 -> V2 -> V3 game proxy storage layout remains fully compatible:

- V3 appends exactly 4 new `uint256` variables in `CosmicSignatureGameStorageV3Base` (which derives from `CosmicSignatureGameStorageV2Base`): `roundLateBidDurationDivisor`, `roundLateBidPricePremiumAmountBaseMultiplier`, `roundLateBidPricePremiumAmountExponent`, `mainPrizeNumCosmicSignatureNfts`.
- `CosmicSignatureGameStorageV3.__gap_persistent` shrank by 4 slots to `uint256[(1 << 30) - 1 - 4]` to compensate, so all pre-existing variables keep their slots.
- No slots are renamed or repurposed (the V1 -> V2 upgrade repurposed 2 slots; V3 does nothing of the kind).

This is verified by OpenZeppelin `validateUpgrade` in `test/tests-src/CosmicSignatureGameV3-StorageLayout.js`, by `slither/slither-check-upgradeability-CosmicSignatureGameV3.bash`, and by the fuzz campaign's V2 -> V3 upgrade phase, which snapshots and diffs every carried-over getter (including the V2 parameters).

## ABI Changes

### 1. New public storage getters (`CosmicSignatureGameStorageV3Base`)

| Getter | Initialized by `reinitialize()` to |
|---|---|
| `roundLateBidDurationDivisor()` | 3_000_000 (a ~20-minute late-bid window for the initial 1-hour main prize time increment) |
| `roundLateBidPricePremiumAmountBaseMultiplier()` | `3567993 << 13` = 29_228_998_656 |
| `roundLateBidPricePremiumAmountExponent()` | 8 |
| `mainPrizeNumCosmicSignatureNfts()` | 3 |

### 2. New view method (`BiddingV3`)

- `getRoundLateBidDuration() returns (uint256)` = `mainPrizeTimeIncrementInMicroSeconds / roundLateBidDurationDivisor`. The duration before `mainPrizeTime` during which the bid price premium applies. Like other divisor-derived durations, it stretches ~1% per completed round.

### 3. New configuration setters (`SystemManagementV3`, `onlyOwner` + `_onlyRoundIsInactive`)

- `setRoundLateBidDurationDivisor(uint256)`
- `setRoundLateBidPricePremiumAmountBaseMultiplier(uint256)`
- `setRoundLateBidPricePremiumAmountExponent(uint256)`
- `setMainPrizeNumCosmicSignatureNfts(uint256)`

### 4. New events (`ISystemEventsV3`)

- `RoundLateBidDurationDivisorChanged(uint256 newValue)`
- `RoundLateBidPricePremiumAmountBaseMultiplierChanged(uint256 newValue)`
- `RoundLateBidPricePremiumAmountExponentChanged(uint256 newValue)`
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

- `reinitialize()`, declared `reinitializer(3)`. Executed once, as the `upgradeToAndCall` payload during the upgrade; it only sets the 4 new V3 parameters to the defaults listed above. The selector is unchanged from V2's `reinitialize()` (a second call on the upgraded proxy reverts with `InvalidInitialization`).
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

### 2. Multi-NFT main prize (`MainPrizeV3`)

- The main prize beneficiary receives `mainPrizeNumCosmicSignatureNfts` (default 3) Cosmic Signature NFTs instead of 1, minted as one sequential ID block. All other prize NFT counts (last CST bidder, Endurance Champion, Chrono-Warrior, raffle winners, Random Walk NFT stakers) are unchanged, as are all CST amounts and all ETH amounts.
- The CST/NFT recipient bookkeeping inside `_distributePrizes` was restructured accordingly (Comment-202511094, Comment-202511104, Comment-202606011: in V3+ the number of CS NFTs minted exceeds the number of CST prize mints by `mainPrizeNumCosmicSignatureNfts - 1`, and the item order differs).

### 3. Owner misconfiguration footguns (new revert modes; benevolent-owner assumption)

- `setMainPrizeNumCosmicSignatureNfts(0)`: every subsequent `claimMainPrize` reverts with `Panic(0x11)` (checked underflow in the NFT owner array allocation). Because the setter and `_authorizeUpgrade` both require an inactive round, a round that already has a bid **cannot be repaired: the game bricks permanently**.
- `setRoundLateBidDurationDivisor(0)`: once a round has a bid, every price view and every further bid reverts with `Panic(0x12)` (division by zero). `claimMainPrize` still works, so the round completes and the owner can repair the parameter afterwards.
- Extreme `roundLateBidPricePremiumAmountBaseMultiplier` / `roundLateBidPricePremiumAmountExponent` values can make the premium arithmetic wrap (the formula runs in an `unchecked` block in production builds), producing bogus prices; in SMTChecker builds (where `unchecked` is preprocessed away) the same state panics with `Panic(0x11)` instead.

Both revert-mode footguns are documented by `test/tests-src/CosmicSignatureGameV3-GuardsAndMisconfig.js`.

### 4. What did not change

- All V2 bid method signatures and validations, including `bidCstRewardAmountMinLimit_` and the CST bid reward sqrt formula.
- The CST Dutch auction duration drift (shrinks on ETH bids, grows on CST bids).
- `mainPrizeTime` extension (unchecked add, no clamping), claim authorization and timeout logic, `_prepareNextRound` (including the Comment-202606235 unchecked overflow hardening).
- All ETH prize amounts and percentages, the charity donation, the staking deposit, `PrizesWallet` interactions (including `setPrizesWallet`, which has existed since V2), donations, and all `SystemManagementV2` setters.
- The upgrade authorization rules (`_authorizeUpgrade` in `CosmicSignatureGameV2Base`: `onlyOwner` + `_onlyRoundIsInactive`), which also govern any future V4+ upgrade.

## Changes In Shared Sources Attributed To V3

- `production/libraries/CosmicSignatureConstants.sol`: new constants `INITIAL_ROUND_LATE_BID_DURATION` (20 minutes), `DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR` (3_000_000), `ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT` (13), `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER` (`3567993 << 13`), `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT` (8), `DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS` (3). All are consumed by `CosmicSignatureGameV3.reinitialize`.
- Extract-base refactorings that let V3 reuse V2 code without changing V2's ABI (other than the initializer rename below) or behavior:
  - `CosmicSignatureGameStorageV2` was split into `CosmicSignatureGameStorageV2Base` (all state variables) + `CosmicSignatureGameStorageV2` (the storage gaps); the V2 modules now derive from the base, so `CosmicSignatureGameStorageV3Base` can extend it before the gap.
  - `CosmicSignatureGameV2Base` was extracted from `CosmicSignatureGameV2` (constructor with `_disableInitializers`, the virtual `reinitialize()` declaration, `_onlyIfPrevVersionWasInitialized`, `_authorizeUpgrade`).
  - `MainPrizeV2Base` was extracted from `MainPrizeV2` (`claimMainPrize`, `_prepareNextRound`, `getMainEthPrizeAmount`, `getCharityEthDonationAmount`, and the virtual `_distributePrizes` declaration).
  - `getNextEthBidPriceAdvanced` and `getNextCstBidPriceAdvanced` became `virtual` in `BiddingV2` so `BiddingV3` can wrap them.
  - Renames: `BiddingBase`/`BiddingBaseV2` -> `BiddingCommon`/`BiddingCommonV2`, `MainPrizeBase`/`MainPrizeBaseV2` -> `MainPrizeCommon`/`MainPrizeCommonV2` (abstract contracts and interfaces; no ABI impact).
  - Interface flattening: interfaces no longer inherit `ICosmicSignatureGameStorage`/each other; `IMainPrize` was split into `IMainPrize1` (methods) + `IMainPrize2` (the V2- `MainPrizeClaimed` event), so `IMainPrizeV3` can combine `IMainPrize1` with `IMainPrize2V3`. `IMainPrizeV2` and `ICosmicSignatureGameOpenBid` were removed as redundant.
- **`initializeV2()` was renamed to `reinitialize()`** (in `CosmicSignatureGameV2`, `ICosmicSignatureGameV2`, and the `CosmicSignatureGameOpenBid` test prototype), so that every version's upgrade initializer shares one name declared once in `CosmicSignatureGameV2Base`. This changes the V2 *source* ABI relative to the deployed V2 implementation; it is inconsequential on-chain because the deployed V2's `initializeV2` has already run and can never be called again (`reinitializer(2)`). Freshly compiled V2 sources are only used by tests and as the baseline for upgrade validation.
- Verification that the refactorings changed nothing else: compiling the `main` branch and this branch with the production configuration and comparing artifacts shows the V1 game's ABI and runtime bytecode are **identical** (sans CBOR metadata), and the V2 game's ABI differs **only** by `initializeV2()` -> `reinitialize()` (the runtime bytecode differences are exactly the dispatch reordering that the changed selector causes).
- Test contracts `tests/BidderContract.sol` and `tests/MaliciousActorBase.sol`: the version routing changed from `contractVersionNumber != 2` to `contractVersionNumber < 2`, so `contractVersionNumber = 3` uses the V2-compatible call shapes (which V3 keeps).
