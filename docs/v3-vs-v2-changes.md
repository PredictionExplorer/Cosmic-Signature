### Cosmic Signature Game V3 vs V2 Changes

#### Introduction

This document lists every change between the Game contract that is live on Arbitrum One and `CosmicSignatureGameV3`, which is to replace it.

- "Live V2" is `CosmicSignatureGameV2` compiled from the `main` branch. V1 was deployed in March 2026 and upgraded to V2 in June 2026.
- "V3" is `CosmicSignatureGameV3` from this branch. This branch also changes the V1 and V2 sources, which are called "new V1" and "new V2" below.

It is written for auditors, for frontend and backend developers, and for the upgrade operator.

Version labels:

- `V1+` -- changed in the V1 source (old V1 -> new V1). The new V2 and V3 sources contain the same change.
- `V2+` -- changed in the V2 source (old V2 -> new V2), but not in V1. V3 contains it too.
- `V3` -- new in V3 (new V2 -> V3).
- `PW` -- `PrizesWallet` source (redeployed with V3).

Each change is attributed to the lowest version whose source shows it. A change in shared code (libraries, struct declarations, constants) that no earlier version's code uses, or for which there is no evidence of a particular version, is attributed to the highest version, V3. Live V2 runs the `main` source, so on chain every item below takes effect at the V3 upgrade.

#### Summary

- The late-bid premium makes ETH and CST bids up to about 5x more expensive near `mainPrizeTime`. It is a one-time toll. See [ETH Bidding](#eth-bidding).
- The CST Dutch auction now declines at a fixed rate of `cstBidPriceDeclineMultiplier` wei per second instead of over a fixed `cstDutchAuctionDuration`. The minimum beginning price after a CST bid drops from 200 to 1 CST, and the price itself can reach 0. See [CST Bidding](#cst-bidding-and-the-cst-dutch-auction).
- The bid CST reward is linear in the time since the previous bid. 100% of it goes to the previous bidder, and nothing is minted on the first bid. See [Bid CST Reward](#bid-cst-reward).
- Bidder raffles are weighted by each bid's ETH price instead of one ticket per bid. See [Bidder Raffle Weights](#bidder-raffle-weights).
- The main prize is 3 Cosmic Signature NFTs. The ETH split changes from 25/8/7/6/4 to 20/15/5/5/5 (main, Chrono-Warrior, charity, staking, raffle). See [Main Prize Claim](#main-prize-claim-and-prize-distribution).
- The new `roundStats` mapping holds per-round statistics. See [Round Statistics](#round-statistics).
- ABI: several getters were removed or retyped, every Game custom error except `ZeroAddress(string)` lost its `errStr` parameter (Comment-202609299), `MainPrizeClaimed` changed, and `BidPlaced` keeps its topic but field 8 has a new meaning. See [ABI Changes](#abi-changes).
- A new `PrizesWallet` is deployed. The old one stays usable for past rounds. See [Upgrade](#upgrade).

#### Upgrade

##### Procedure

- V3 is deployed by a UUPS `upgradeToAndCall(newImplementation, reinitialize())` on the existing proxy. The task config `tasks/config/upgrade-cosmic-signature-game-config-arbitrumOne-CosmicSignatureGameV3.json` passes `newInitializerMethodName = "reinitialize"`.
- The live V2 `_authorizeUpgrade` requires `onlyOwner` and `_onlyRoundIsInactive`. So the upgrade happens between rounds, and no round mixes V2 and V3 bids. As of the rehearsal fork (block 512486253), round 3 activates at Unix time 1791800077 (2026-10-12 10:14 UTC). The owner can change this, so re-read `roundActivationTime()` before upgrading. The upgrade and `setPrizesWallet` must both land before activation for round 3 to be the first V3 round. Otherwise both revert until round 3 is claimed, and round 4 is the first V3 round.
- `reinitialize()` is guarded only by OpenZeppelin `reinitializer(3)`. It has no `onlyOwner` (Comment-202606128), and its other modifiers only assert. It must run atomically as the upgrade call payload. A second call reverts with `InvalidInitialization`.
- `reinitialize()` emits only `Initialized(3)` (plus the proxy's `Upgraded`). It emits none of the `*Changed` events for the values it writes.
- The procedure is in `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md`.

##### Values Written by `reinitialize()`

The "Live V2" column comes from a fork rehearsal of the real upgrade at Arbitrum One block 512486253 (timestamp 1791355354, 2026-10-07). The rehearsal scripts are not committed; see [Consequence for Tests](#consequence-for-tests) for the committed, reproducible checks. Slots 308-313 were part of the storage gap, so they read 0 before the upgrade.

| Variable | Constant | Live V2 | V3 |
| --- | --- | --- | --- |
| `cstDutchAuctionBeginningBidPriceMinLimit` | `DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3` | 200e18 (200 CST) | 1e18 (1 CST) |
| `cstBidPriceDeclineMultiplier` (new, slot 308) | `INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER` | 0 | 16,666,666,666,666,667 (about 1 CST per minute) |
| `cstBidPriceDeclineMultiplierChangeDivisor` (new, 309) | `DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR` | 0 | 100 |
| `roundLateBidDurationDivisor` (new, 310) | `DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR` | 0 | 3,000,000 |
| `roundLateBidPricePremiumAmountBaseMultiplier` (new, 311) | `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER` | 0 | 29,228,998,656 (3567993 << 13) |
| `roundLateBidPricePremiumAmountExponent` (new, 312) | `DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT` | 0 | 8 |
| `bidCstRewardAmountMultiplier` | `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` | 1.08e46 (square-root radicand multiplier) | 6e25 (linear multiplier) |
| `chronoWarriorEthPrizeAmountPercentage` | `DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3` | 8 | 15 |
| `raffleTotalEthPrizeAmountForBiddersPercentage` | `DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3` | 4 | 5 |
| `cosmicSignatureNftStakingTotalEthRewardAmountPercentage` | `DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3` | 6 | 5 |
| `mainEthPrizeAmountPercentage` | `DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3` | 25 | 20 |
| `mainPrizeNumCosmicSignatureNfts` (new, 313) | `DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS` | 0 (V2 always awarded 1) | 3 |
| `charityEthDonationAmountPercentage` | `DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3` | 7 | 5 |

- `reinitialize()` overwrites these values unconditionally, so any value the owner tuned on V2 is lost.
- `reinitialize()` does not touch `nextRoundFirstCstDutchAuctionBeginningBidPrice` (live: 200 CST), `cstDutchAuctionDuration` (live: 30198), `cstDutchAuctionDurationChangeDivisor` (live: 250), `mainPrizeTimeIncrementInMicroSeconds` (live: 3,709,083,600), timeouts, or any address variable.
- After the upgrade, the rehearsal observed `getRoundLateBidDuration() == 1236` and `getCstDutchAuctionDurations()` first value 12000 (200 CST at the initial multiplier). `getDurationUntilMainPrize()` changed from 0 to -160103 because V2 clamped negative durations to 0, while V3 returns the signed raw value (the former `getDurationUntilMainPrizeRaw`). `getBidCstRewardAmount()` returned about 2.9e25, which is meaningless before the first bid of a round (Comment-202501022).

##### `PrizesWallet` Replacement

- The operator deploys a new `PrizesWallet` with `game_` set to the Game proxy, then calls `setPrizesWallet(newWallet)`. That function is `onlyOwner`, `_onlyRoundIsInactive`, and requires a nonzero address. It existed in live V2 and emits `PrizesWalletAddressChanged`. See `tasks/docs/Prizes-Wallet-Contract-Upgrade-And-Re-Registration.md` and Comment-202607153.
- The deployer becomes the new wallet's owner. `timeoutDurationToWithdrawPrizes` starts at the default of 5 weeks. Transfer ownership and re-apply any customized timeout if needed.
- The old wallet keeps working on its own. Prizes and donations from past rounds stay withdrawable and claimable there. As of the rehearsal, the old wallet's ETH balance was 0 and all 4 donated NFTs had been claimed. A round-0 `DonatedTokenHolder` exists; its remaining token balance was not checked.
- Rounds from the switch onward use the new wallet. Its state starts empty, and `nextDonatedNftIndex` restarts at 0.

##### OpenZeppelin Storage Validation

Slot 259 changed from `bidderAddresses` to `roundStats` (see [Storage Layout](#storage-layout)). The rehearsal ran OpenZeppelin `validateUpgrade` against the layout of the live V2 implementation, with `unsafeAllowRenames` and `unsafeSkipStorageCheck` both `false`. The results:

| Annotation on `roundStats` in `CosmicSignatureGameStorageV2Base` | Result |
| --- | --- |
| As committed (`/// // @custom:oz-renamed-from bidderAddresses` is commented out; no `oz-retyped-from` line exists) | Fails: "Replaced `bidderAddresses` with `roundStats` of incompatible type" |
| Only `/// @custom:oz-renamed-from bidderAddresses` | Fails: incompatible struct, members renamed and retyped |
| `/// @custom:oz-renamed-from bidderAddresses` plus `/// @custom:oz-retyped-from mapping(uint256 => ICosmicSignatureGameStorage.BidderAddresses)` | Passes |

`tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` currently prescribes only the rename annotation, which fails. Both annotations are needed. `test/tests-src/CosmicSignatureGameV3-DeployedV2StorageLayout.js` checks V3 against the deployed V2 layout and covers these cases. The older `CosmicSignatureGameV3-StorageLayout.js` validates against the new V2 source, which already has `roundStats`, so it cannot detect this.

#### Storage Layout

##### V1 -> V2 -> V3 Compatibility

The Game storage layout stays compatible across all three versions. Every variable keeps its slot and type: V2 adds slot 307 from the start of V1's gap, and V3 adds slots 308-313 from V2's gap. In the source layouts the gap always ends at slot 1073742130 (307 + 2^30 - 1).

| Slots | V1 (`main` source) | Live V2 | V3 |
| --- | --- | --- | --- |
| 0-255 | `OwnableUpgradeableWithReservedStorageGaps` gap | same | same |
| 256-306 | Game variables | same slots. Slot 277 was renamed `cstDutchAuctionDurationDivisor` -> `cstDutchAuctionDuration`, and slot 283 `bidCstRewardAmount` -> `bidCstRewardAmountMultiplier` | same as V2, plus the slot-259 change below |
| 307 | gap start | `cstDutchAuctionDurationChangeDivisor` | same |
| 308-313 | gap | gap | 6 new variables |
| gap | `uint256[1 << 30]` at 307 | `uint256[(1 << 30) - 1]` at 308 | `uint256[(1 << 30) - 1 - 6]` at 314 |

Sources of the layouts compared:

- The live V2 layout is the OpenZeppelin manifest entry of the deployed V2 implementation.
- The V3 layout is compiled from this branch.
- The V1 column is the `main` source. The deployed V1 manifest names slot 283 `cstRewardAmountForBidding` and records a much larger gap at 307, which was later reduced in the source as `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` explains. Every variable slot matches.

Slots 277 and 283 were changed by the V1 -> V2 upgrade and are annotated with `@custom:oz-renamed-from`.

##### Slot 259: `bidderAddresses` -> `roundStats` (`V1+`)

`mapping(uint256 => BidderAddresses) bidderAddresses` became `mapping(uint256 => RoundStats) roundStats`. The struct declaration is in `ICosmicSignatureGameStorage`, which every version shares. For round `r`, let `B = keccak256(r . 259)`.

| Struct slot | Old `BidderAddresses` member | New `RoundStats` member | Compatibility |
| --- | --- | --- | --- |
| `B + 0` | `numItems` | `numBids` | Same value |
| `B + 1` | `items`: `mapping(uint256 => address)` | `bidsInfo`: `mapping(uint256 => BidInfo)` | Element `i` is based at `keccak256(i . (B + 1))`. `BidInfo.bidderAddress` sits at offset 0 of that slot, exactly where `items[i]` was. `BidInfo.raffleCumulativeWeight` is at the next slot, which was never written, so it reads 0 for pre-V3 bids. |
| `B + 2` .. `B + 9` | (none) | `numCstBids`, `totalSpentEthAmount`, `totalSpentCstAmount`, `maxEthBidPrice`, `maxCstBidPrice`, `enduranceChampionDuration`, `chronoWarriorDuration`, `flags` | Never written before V3, so they read 0 for pre-V3 rounds |

The struct shape is `V1+`. Only V3 code writes the fields after `bidsInfo` and `raffleCumulativeWeight`, so populating them is a `V3` change. `BidderInfo` (slot 260, `biddersInfo`) is unchanged.

##### New V3 Variables (`V3`)

`CosmicSignatureGameStorageV3Base` declares 6 new public `uint256` variables at slots 308-313:

1. `cstBidPriceDeclineMultiplier`
2. `cstBidPriceDeclineMultiplierChangeDivisor`
3. `roundLateBidDurationDivisor`
4. `roundLateBidPricePremiumAmountBaseMultiplier`
5. `roundLateBidPricePremiumAmountExponent`
6. `mainPrizeNumCosmicSignatureNfts`

`CosmicSignatureGameStorageV3.__gap_persistent` shrinks by 6 to `uint256[(1 << 30) - 1 - 6]` at slot 314. 314 + 1073741817 = 308 + 1073741823, so the end of the gap does not move.

There is no `bidCstRewardAmountPerMinute` variable. The bid CST reward still uses `bidCstRewardAmountMultiplier`.

##### Layout Changes in the V1 and V2 Sources

- New V1 vs old V1: the slot-259 change only. Every other slot, type, and gap is identical.
- New V2 vs old V2: the slot-259 change only. `CosmicSignatureGameStorageV2` was split into `CosmicSignatureGameStorageV2Base` (variables, shared with V3) and `CosmicSignatureGameStorageV2` (the gap only). No slot moved.

#### ABI Changes

These tables compare live V2 with V3. "Silently wrong?" means that a client still using the live V2 ABI gets wrong data without any error, either because a type changed under the same selector or because a value keeps its type but has a new meaning. A changed selector or topic is not silent: the call reverts, the error decodes as unknown, or the event is missed.

The Game must be called through the `CosmicSignatureGameV3` contract ABI. The interface hierarchy was flattened (`V1+`): `ICosmicSignatureGame` now declares only `initialize(address)`, `ICosmicSignatureGameV2` only `reinitialize()`, and `IBidding`, `IMainPrize`, `ISystemManagement*`, `IEthDonations` and the others no longer inherit `ICosmicSignatureGameStorage`, `ISystemEvents` or each other. So no interface artifact carries the whole Game ABI, and there is no `ICosmicSignatureGameV3` aggregate.

##### Functions

| Live V2 | V3 | Version | Selector | Silently wrong? |
| --- | --- | --- | --- | --- |
| `getDurationUntilMainPrize() returns (uint256)`, clamped at 0 | `getDurationUntilMainPrize() returns (int256)`, negative after `mainPrizeTime` | `V1+` | Same, `0x36750d2c` | Yes: a negative value decodes as about 2^256 |
| `getDurationUntilMainPrizeRaw() returns (int256)` | Removed. Use `getDurationUntilMainPrize()`. | `V1+` | `0x37b99cc7` removed | No (reverts) |
| `getCstDutchAuctionDurations() returns (uint256, int256)` | `returns (uint256, uint256)` | Types `V1+`, meaning `V3` | Same, `0xb700db5f` | Elapsed value: no, it is never negative. First value: decodes correctly but has a new meaning, `ceil(beginningPrice / cstBidPriceDeclineMultiplier)` instead of the `cstDutchAuctionDuration` variable ([details](#cst-bidding-and-the-cst-dutch-auction)) |
| `getTotalNumBids(uint256)` | Removed. Use `roundStats(r)` value 0 (`numBids`). | `V1+` | `0xfd77310f` removed | No (reverts) |
| `getBidderAddressAt(uint256, uint256)` | Removed. Use `getBidInfoAt(r, i).bidderAddress`. | `V1+` | `0x000ac9f1` removed | No (reverts) |
| `getBidderTotalSpentAmounts(uint256, address)` | Removed. Use `biddersInfo(r, a)` (`totalSpentEthAmount`, `totalSpentCstAmount`, `lastBidTimeStamp`). | `V1+` | `0xfd9b3747` removed | No (reverts) |
| `bidderAddresses(uint256) returns (uint256 numItems)` | `roundStats(uint256)` returns 9 values: `numBids`, `numCstBids`, `totalSpentEthAmount`, `totalSpentCstAmount`, `maxEthBidPrice`, `maxCstBidPrice`, `enduranceChampionDuration`, `chronoWarriorDuration`, `flags` | `V1+` | `0x2fb3c48f` -> `0x259d33c1` | No |
| (none) | `getBidInfoAt(uint256 roundNum_, uint256 bidIndex_) returns (BidInfo)`, where `BidInfo` is `(address bidderAddress, uint256 raffleCumulativeWeight)` | `V1+` | New, `0xcca98679` | n/a |
| `initializeV2()` | `reinitialize()` | `V2+` (V3 contents: `V3`) | `0x5cd8a76b` -> `0x6c2eb350` | n/a. Live V2 already consumed version 2. |
| `constructor` ABI entry | Removed. The constructor moved to abstract `CosmicSignatureGameV2Base` and still calls `_disableInitializers()`. | `V2+` | n/a | n/a |
| `bidWithCst*(uint256 priceMaxLimit_, ...)` | Parameter renamed to `cstPriceMaxLimit_` | `V1+` | Same | No |
| (none) | `getRoundLateBidDuration()` | `V3` | `0x60ef8841` | n/a |
| (none) | Getters `cstBidPriceDeclineMultiplier()`, `cstBidPriceDeclineMultiplierChangeDivisor()`, `roundLateBidDurationDivisor()`, `roundLateBidPricePremiumAmountBaseMultiplier()`, `roundLateBidPricePremiumAmountExponent()`, `mainPrizeNumCosmicSignatureNfts()` | `V3` | New | n/a |
| (none) | Setters `setCstBidPriceDeclineMultiplier`, `setCstBidPriceDeclineMultiplierChangeDivisor`, `setRoundLateBidDurationDivisor`, `setRoundLateBidPricePremiumAmountBaseMultiplier`, `setRoundLateBidPricePremiumAmountExponent`, `setMainPrizeNumCosmicSignatureNfts`, all taking `(uint256)` | `V3` | New | n/a |
| `setCstDutchAuctionDuration(uint256)`, `setCstDutchAuctionDurationChangeDivisor(uint256)` | Same signatures. They always revert with `NotImplemented()`. | `V3` | Same | n/a |

The live V2 -> V3 function removals are exactly 6 selectors: `getDurationUntilMainPrizeRaw`, `getTotalNumBids`, `getBidderAddressAt`, `getBidderTotalSpentAmounts`, `bidderAddresses`, and `initializeV2`. `bidsInfo` and `championDurations` never existed in any deployed or branch Game ABI.

Functions that keep their selector but change meaning (`V3`, see [Behavior Changes](#behavior-changes)):

- `getNextEthBidPrice[Advanced]` and `getNextCstBidPrice[Advanced]` include the late-bid premium. The CST price uses the decline-multiplier model.
- `getBidCstRewardAmount[Advanced]` is linear and is paid to the previous bidder.
- `bidCstRewardAmountMultiplier()` is a linear multiplier, no longer a square-root radicand multiplier, and `reinitialize()` resets it.
- `nextEthBidPrice()` is the premium-free base, so inside the late window it is not the price to pay.
- `cstDutchAuctionBeginningBidPrice()` is `max(2 * base, minLimit)`, no longer based on the paid price.
- `biddersInfo()` and `roundStats()` spent totals and maximum prices include the premium.
- `cstDutchAuctionDuration()` and `cstDutchAuctionDurationChangeDivisor()` are frozen at their last V2 values, because V3 neither reads nor writes them (Comment-202608317).

##### Events

| Live V2 | V3 | Version | Topic0 | Silently wrong? |
| --- | --- | --- | --- | --- |
| `BidPlaced(uint256 indexed roundNum, address indexed lastBidderAddress, int256 paidEthPrice, int256 paidCstPrice, int256 indexed randomWalkNftId, string message, uint256 bidCstRewardAmount, uint256 cstDutchAuctionDuration, uint256 mainPrizeTime)` | Same types. Field 8 is now `cstBidPriceDeclineMultiplier`. | `V3` | Same, `0x1d1f406c...02ec` | Yes. (1) Field 8 is now the decline multiplier after this bid (CST wei per second), not a duration. (2) `bidCstRewardAmount` is now minted to the previous bidder, not to `lastBidderAddress`, and is 0 on the first bid. (3) `paidEthPrice` and `paidCstPrice` include the late-bid premium. |
| `MainPrizeClaimed(uint256 indexed roundNum, address indexed beneficiaryAddress, uint256 ethPrizeAmount, uint256 cstPrizeAmount, uint256 indexed prizeCosmicSignatureNftId, uint256 timeoutTimeToWithdrawSecondaryPrizes)` | `MainPrizeClaimed(uint256 indexed roundNum, address indexed beneficiaryAddress, uint256 ethPrizeAmount, uint256 cstPrizeAmount, uint256 indexed prizeFirstCosmicSignatureNftId, uint256 prizeNumCosmicSignatureNfts, uint256 timeoutTimeToWithdrawSecondaryPrizes)` | `V3` | `0x8c551ec2...d591` -> `0x9314e785...3788` | No (missed) |
| `FundTransferFailed(string errStr, address indexed destinationAddress, uint256 amount)`, emitted when the charity transfer fails | `EthTransferToCharityFailed(address indexed charityAddress, uint256 amount)` | `V1+` | `0x154fb6c6...215a` -> `0x1b957971...6348` | No (missed) |
| `ArbitrumError(string errStr)` | `ArbSysArbBlockNumberCallFailed()`, `ArbSysArbBlockHashCallFailed()`, `ArbGasInfoGetGasBacklogCallFailed()`, `ArbGasInfoGetL1PricingUnitsSinceUpdateCallFailed()`. They are declared in `ArbitrumHelpers` and emitted by the Game during `claimMainPrize`. | `V1+` | `0xa0f59128...392d` -> `0xa8d743ae`, `0xde09184d`, `0x20bc709a`, `0x1031a982` (in that order) | No (missed) |
| (none) | `CstBidPriceDeclineMultiplierChanged` (`0x5a775510`), `CstBidPriceDeclineMultiplierChangeDivisorChanged` (`0xdca564ea`), `RoundLateBidDurationDivisorChanged` (`0x7acba37d`), `RoundLateBidPricePremiumAmountBaseMultiplierChanged` (`0x169f25ec`), `RoundLateBidPricePremiumAmountExponentChanged` (`0xcb78cca7`), `MainPrizeNumCosmicSignatureNftsChanged` (`0x616bfcaa`), all taking `(uint256 newValue)` | `V3` | New | n/a |
| `CstDutchAuctionDurationChanged`, `CstDutchAuctionDurationChangeDivisorChanged` | Still in the ABI, but they can no longer be emitted | `V3` | Same | n/a |

The non-redeployed `StakingWalletCosmicSignatureNft` still emits the old `FundTransferFailed` event.

##### Errors

Every Game custom error that had a leading `string errStr` parameter lost it, except `ZeroAddress(string)` (`V1+`, `CosmicSignatureErrors`). The 12 errors below therefore have new selectors. No error mis-decodes silently, but an old ABI cannot decode any of them, and revert data no longer carries a message.

| Error (new signature) | Old selector | New selector |
| --- | --- | --- |
| `RoundIsInactive(uint256 roundActivationTime, uint256 blockTimeStamp)` | `0x16df8bd8` | `0x51e3d86a` |
| `RoundIsActive(uint256 roundActivationTime, uint256 blockTimeStamp)` | `0xd0fd11df` | `0xbe20b6ab` |
| `NoBidsPlacedInCurrentRound()` | `0xc42253e8` | `0xc6c08d72` |
| `BidHasBeenPlacedInCurrentRound()` | `0x4283f4b9` | `0xdf784b32` |
| `WrongBidType()` | `0xb5a45a49` | `0xeeb745ea` |
| `InsufficientReceivedBidAmount(uint256 bidPrice, uint256 receivedAmount)` | `0x814ac7ff` | `0x7903b860` |
| `TooLongBidMessage(uint256 messageLength)` | `0x9c750ffc` | `0x48b0a7ea` |
| `UsedRandomWalkNft(uint256 randomWalkNftId)` | `0xc35947c5` | `0x729851a5` |
| `CallerIsNotNftOwner(address nftAddress, uint256 nftId, address callerAddress)` | `0x5c09a138` | `0x87216cf2` |
| `MainPrizeEarlyClaim(uint256 mainPrizeTime, uint256 blockTimeStamp)` | `0x8d31bb15` | `0x1b37f399` |
| `MainPrizeClaimDenied(address lastBidderAddress, address beneficiaryAddress, uint256 durationUntilOperationIsPermitted)` | `0xcd96628c` | `0x2c57366e` |
| `InvalidOperationInCurrentState()` | `0xa29f5c4d` | `0x2d6ebd6f` |

- Removed from the Game ABI: `FundTransferFailed(string, address, uint256)` (`0x154fb6c6`), `V1+`. When a bid-overpayment refund or the main ETH prize transfer fails, the Game now re-throws the recipient's raw revert data, which is empty if the recipient has no `receive` or runs out of gas. It does this through `CosmicSignatureHelpers.transferEthTo`.
- Added: `NotImplemented()` (`0xd6234725`), `V3`.
- Unchanged: `BidCstRewardAmountMinLimitNotReached(uint256, uint256)` (`0x35465b31`) and `ZeroAddress(string)`. Comment-202609299 explains why `ZeroAddress` keeps its string.
- Only the new V1 ABI contains `FirstRound()`, changed from `FirstRound(string)`.
- The non-redeployed contracts and the old `PrizesWallet` keep their string-carrying errors (Comment-202609134, Comment-202609144).

#### Behavior Changes

All items in this section are `V3` unless labeled otherwise. The section describes production builds; `#enable_asserts` code is excluded.

##### ETH Bidding

- **Late-bid premium.** A premium is added to every non-first bid, ETH or CST, inside the late window before `mainPrizeTime`. It is computed in `BiddingV3._addRoundLateBidPricePremiumAmountIfNeeded` (Comment-202607119):
  - `L = getRoundLateBidDuration() = mainPrizeTimeIncrementInMicroSeconds / roundLateBidDurationDivisor` (seconds).
  - `d = getDurationUntilMainPrize() - currentTimeOffset_`. Then `e = L - d`, and if `d < 0`, `e = L`. There is no premium when `e <= 0`.
  - `premium = ((e * roundLateBidPricePremiumAmountBaseMultiplier / mainPrizeTimeIncrementInMicroSeconds) ** roundLateBidPricePremiumAmountExponent * basePrice) >> (roundLateBidPricePremiumAmountExponent * ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT)`. `ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT` is 13.
  - With the defaults, `L` is 1200 s at the initial 1-hour increment, 1236 s at the live increment, and grows 1% per round. The premium is about 1.6% of the base price halfway through the window, 40% at 3/4, 172% at 90%, and about 4x from `mainPrizeTime` on, for a total price of about 5x the base. The premium never applies to the first bid of a round.
- **Toll semantics.** The premium is charged once and recorded as paid: in `BidPlaced.paidEthPrice` / `paidCstPrice`, `biddersInfo.totalSpentEthAmount` / `totalSpentCstAmount`, and `roundStats.totalSpentEthAmount`, `maxEthBidPrice`, `totalSpentCstAmount`, `maxCstBidPrice`. Everything else uses the premium-free base price: `nextEthBidPrice = base + base / ethBidPriceIncreaseDivisor + 1`, the raffle weight, on the first bid `ethDutchAuctionBeginningBidPrice = base * 2`, and after a CST bid the new CST beginning price (`2 * base`). The `nextEthBidPrice()` storage getter therefore no longer equals the price to pay inside the window.
- **Price getters.** `getNextEthBidPrice[Advanced]` and `getNextCstBidPrice[Advanced]` now return the base plus the premium. So after the first bid the ETH price rises every second inside the window and stays at about 5x after `mainPrizeTime`; in live V2 it was constant between bids. The CST price can also rise inside the window, not only fall. A bid that sends exactly the quoted price can revert with `InsufficientReceivedBidAmount` if it is mined later.
- **Random Walk NFT discount.** `paidEthPrice = ceil((base + premium) / 2)`, so the 50% discount also applies to the premium. The raffle weight is the full undiscounted base. `getEthPlusRandomWalkNftBidPrice` is unchanged.
- **Overpayment** handling is unchanged. An excess above `ethBidRefundAmountInGasToSwallowMaxLimit * tx.gasprice` is refunded. A smaller excess is swallowed and counted as paid. A failed refund now reverts with the bidder's raw revert data (`V1+`).
- As in live V2, several bids may be placed in the same second.

##### CST Bidding and the CST Dutch Auction

- **Decline multiplier model** (`BiddingV3._getNextCstBidPriceBaseAdvanced`):
  - `base = max(0, beginningPrice - (now + offset - cstDutchAuctionBeginningTimeStamp) * cstBidPriceDeclineMultiplier)`.
  - `beginningPrice` is `nextRoundFirstCstDutchAuctionBeginningBidPrice` until the round's first CST bid, then `cstDutchAuctionBeginningBidPrice`.
  - The price to pay is `base + premium`.
  - Live V2 used `beginningPrice * remaining / cstDutchAuctionDuration` instead.
- **Multiplier updates.** An ETH bid sets `m = min(m + m / cstBidPriceDeclineMultiplierChangeDivisor, CST_BID_PRICE_DECLINE_MULTIPLIER_MAX_LIMIT)`. A CST bid sets `m = (m + 1) * div / (div + 1)`.
  - The divisor defaults to 100, so each bid changes `m` by about 1%. Live V2 adjusted `cstDutchAuctionDuration` with divisor 250 instead.
  - The cap `CST_BID_PRICE_DECLINE_MULTIPLIER_MAX_LIMIT` is `int256.max / (100 * 366 days)`, about 1.83e67 (Comment-202610093).
  - `m` is never reset between rounds. Each new value appears only in `BidPlaced` field 8, with no `*Changed` event.
  - Because the price is `B - elapsed * m`, raising `m` on an ETH bid instantly lowers the current CST price by about `elapsed * m / div`.
- **Beginning price after a CST bid** is `max(2 * base, cstDutchAuctionBeginningBidPriceMinLimit)`. Live V2 used `2 * paidPrice`, which had no premium to exclude. The first CST bid of a round also stores this value in `nextRoundFirstCstDutchAuctionBeginningBidPrice`. The minimum limit drops from 200 CST to 1 CST.
- **First V3 round.** `nextRoundFirstCstDutchAuctionBeginningBidPrice` keeps its live value of 200 CST. The first CST auction of the first V3 round therefore starts at 200 CST when the round's first ETH bid is placed. That bid has already raised `m` to 16,833,333,333,333,333 (`_tryIncreaseCstBidPriceDeclineMultiplier` runs before `_bidCommon` starts the auction), so the price reaches 0 after about 11,882 s (3.3 hours), or sooner if more ETH bids follow. The value 12000 that `getCstDutchAuctionDurations()` reports before that bid uses the initial multiplier.
- **Zero price.** The base price can reach 0, and a CST bid at price 0 is valid. It still mints the bid CST reward to the previous bidder. If the reward is nonzero, the zero burn is executed as a zero mint to the bidder (Comment-202606074, unchanged).
- **`getCstDutchAuctionDurations()`** now returns `(ceil(beginningPrice / cstBidPriceDeclineMultiplier), now - cstDutchAuctionBeginningTimeStamp)`. The first value is the number of seconds from the auction start until the base price reaches 0. It changes on every bid, because `m` changes and, on a CST bid, the beginning price changes. It also changes on main prize claim, when `lastCstBidderAddress` is reset. It panics with a division by zero if `cstBidPriceDeclineMultiplier == 0`. The elapsed value is meaningless before the round's first bid (Comment-202501022).
- **Frozen getters.** `cstDutchAuctionDuration()` and `cstDutchAuctionDurationChangeDivisor()` keep their last V2 values forever. V3 neither reads nor writes them (Comment-202608317).
- **Rate mismatch.** `m` does not scale with `mainPrizeTimeIncrementInMicroSeconds`, but the bid CST reward rate does. At the live increment, the reward is about 0.97 CST per minute. Right after the upgrade, the CST price declines at about 1 CST per minute (the initial multiplier). From then on, the reward rate falls about 1% per round as the increment grows, while `m` moves about 1% per bid (up on ETH bids, down on CST bids) and is never reset, so the two rates are not tied to each other.

##### Bid CST Reward

- **Formula.** `reward = elapsed * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` if `elapsed > 0`, and 0 otherwise. `elapsed = now + offset - biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp`.
  - With the default multiplier of 6e25, the reward is exactly 1 CST per minute at the initial 1-hour increment, and about 0.97 CST per minute at the live increment.
  - Live V2 used `sqrt(elapsed * multiplier / increment)`. For the first bid, it measured `elapsed` from `roundActivationTime`.
  - `bidCstRewardAmountMultiplier` remains the core reward parameter. Its slot, getter, setter, and event are unchanged, but its unit is now linear.
- **Recipient.** 100% of the reward is minted to the previous bidder, `lastBidderAddress` before this bid, on both ETH and CST bids. There is no split. Live V2 minted it to the caller.
  - A bidder who outbids themselves receives the reward themselves.
  - The final bidder of a round is never rewarded for their last holding period.
  - A bid in the same second as the previous one yields 0.
- **First bid.** An ETH first bid mints nothing, emits `bidCstRewardAmount = 0`, and ignores `bidCstRewardAmountMinLimit_`.
- **`bidCstRewardAmountMinLimit_`** still reverts with `BidCstRewardAmountMinLimitNotReached` if the reward is below the limit. The reward now goes to someone else, so a bidder should pass 0 unless they placed the previous bid themselves, from the same or another account (Comment-202605279).
- **`getBidCstRewardAmount[Advanced]`** now quotes what the current `lastBidderAddress` would receive if someone bid now. Before the first bid of a round, `lastBidderAddress == 0` and the timestamp read is 0. The getters then return a huge meaningless value, about 2.9e25 wei (29 million CST) in the rehearsal. Comment-202501022 applies: the value is invalid until the first bid. Live V2 returned 0 before activation and a valid value after.

##### Bidder Raffle Weights

Live V2 picked raffle winners uniformly per bid. V3 weights each bid by its premium-free ETH price at bid time:

- An ETH bid's weight is its base price.
- An ETH plus Random Walk NFT bid's weight is its undiscounted base price.
- A CST bid's weight is the concurrent ETH base price.

Each pick selects the first bid whose `raffleCumulativeWeight` exceeds `random % totalWeight`. Both the ETH raffle and the CST plus NFT raffle work this way (`MainPrizeV3._pickRaffleWinnerAddress`, Comment-202609098). Details are in [cosmic-signature-game-prizes.md](cosmic-signature-game-prizes.md), section "Bidder Raffle Weight in V3+".

##### Main Prize Claim and Prize Distribution

- **ETH split.** The percentages of the Game balance at claim time change: main 25 -> 20, Chrono-Warrior 8 -> 15, charity 7 -> 5, Cosmic Signature NFT staking 6 -> 5, bidder raffle 4 -> 5 in total, split among `numRaffleEthPrizesForBidders` (default 3). The total is still 50%, and the rest carries over. All amounts are computed from the balance before any transfer (Comment-202501161).
- **NFTs.** The main prize beneficiary receives `mainPrizeNumCosmicSignatureNfts` (3) NFTs with sequential IDs. The CST prize is still a single `cstPrizeAmount`, and all other prize counts are unchanged.
- **NFT ID layout.** Let `F` be the first ID minted in the claim, `L = 1` if there was a CST bid, `B = numRaffleCosmicSignatureNftsForBidders`, `S` the number of Random Walk NFT staker winners (0 if none are staked), and `M = mainPrizeNumCosmicSignatureNfts`.

  | Recipient | Live V2 ID | V3 ID |
  | --- | --- | --- |
  | Main prize beneficiary | `F` | `F + L + 2 + B + S` .. `+ M - 1` (highest) |
  | Last CST bidder (if any) | `F + 1` | `F` |
  | Endurance Champion | `F + 1 + L` | `F + L` |
  | Chrono-Warrior | `F + 2 + L` | `F + L + 1` |
  | Bidder raffle winners | from `F + 3 + L` | from `F + L + 2` |
  | Random Walk NFT staker winners | after the bidders | after the bidders |

  Each `*PrizePaid` event carries the correct ID. Do not derive IDs by offset.
- **`MainPrizeClaimed`** gains `prizeNumCosmicSignatureNfts`, and its indexed ID becomes `prizeFirstCosmicSignatureNftId` (see [Events](#events)). `timeoutTimeToWithdrawSecondaryPrizes` now comes from the new `PrizesWallet`.
- **Event order in `claimMainPrize`:**
  1. Possibly `ArbSys*CallFailed` or `ArbGasInfo*CallFailed` events.
  2. `RaffleWinnerBidderEthPrizeAllocated` for winner indexes N-1 down to 0.
  3. `PrizesWallet` `EthReceived` events.
  4. The staking wallet's `EthDepositReceived`, if any NFTs are staked.
  5. `FundsTransferredToCharity` or `EthTransferToCharityFailed`.
  6. The main ETH transfer.
  7. CST `Transfer` mints.
  8. NFT `Transfer` and `NftMinted` events in ascending ID order.
  9. **`MainPrizeClaimed`**.
  10. `RaffleWinnerPrizePaid` for stakers, then for bidders.
  11. `ChronoWarriorPrizePaid`, `EnduranceChampionPrizePaid`, then `LastCstBidderPrizePaid`.
  12. `MainPrizeTimeIncrementInMicroSecondsChanged`, then `RoundActivationTimeChanged`.

  In live V2, `MainPrizeClaimed` came after `LastCstBidderPrizePaid`. Steps 1-6 and 12 are unchanged apart from the event renames.
- **CST mint order.** `token.mintMany` mints from the last spec to the first. The CST `Transfer` order is now: marketing wallet, beneficiary, stakers, bidders, Chrono-Warrior, Endurance Champion, last CST bidder. Live V2 used: marketing wallet, stakers, bidders, Chrono-Warrior, Endurance Champion, last CST bidder, beneficiary. The amounts are unchanged.
- **Round statistics** are finalized before distribution (see below). The first V3 claim in the rehearsal used 4,472,335 gas with 15 bids.

##### Round Statistics

`roundStats(roundNum)` fields (`ICosmicSignatureGameStorage.RoundStats`):

- **Written by every version** (`V1+`): `numBids` and `bidsInfo[i].bidderAddress`, at each bid in `_bidCommon`. They are valid for all rounds, including pre-V3 rounds.
- **Written at each V3 bid**:
  - `bidsInfo[i].raffleCumulativeWeight`.
  - `numCstBids`. The number of ETH bids is `numBids - numCstBids`.
  - `totalSpentEthAmount` and `maxEthBidPrice`. `maxEthBidPrice` can exceed the last ETH price because of the premium. A Random Walk NFT bid records its discounted price.
  - `totalSpentCstAmount` and `maxCstBidPrice`.
  - Paid amounts include the premium and swallowed overpayments. They exclude refunds and donations (Comment-202610059).
- **Written at V3 main prize claim**, before distribution: `enduranceChampionDuration`, `chronoWarriorDuration`, and `flags`.
  - `flags` is set to `SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES` (`1 << 2`, Comment-202610069) when the same individual bid earned both titles. This happens exactly when the final Chrono-Warrior update at claim time replaced the Chrono-Warrior.
  - The same address winning both titles with two different bids does not set the flag.
  - See [endurance-chrono-README.md](endurance-chrono-README.md).
- **Completeness.** A nonzero `totalSpentEthAmount` means the round was tracked from its start, because every round has an ETH first bid. A round number below `roundNum()` is finalized. For rounds that ended before V3, every field after `bidsInfo` reads 0.
- Supporting changes (`V2+`): `BidStatisticsV2._updateChronoWarriorIfNeeded` now returns whether it replaced the Chrono-Warrior. `claimMainPrize` calls the `_updateRoundStatsOnMainPrizeClaim` hook, which does nothing in V2.

##### Event Order and Revert Behavior

- **ETH bid events** are in the same order as in live V2:
  1. CST `Transfer` mint of the reward.
  2. `FirstBidPlacedInRound`, on the first bid only.
  3. `BidPlaced`.
  4. The refund.
  5. For the `AndDonate` variants, the `PrizesWallet` donation events.

  The reward mint now goes to the previous bidder. It is absent on the first bid, and absent when the reward is 0.
- **CST bid events**: the CST burn `Transfer`, then the reward mint `Transfer` to the previous bidder (only if the reward is greater than 0), then `BidPlaced`, then donations. The order is unchanged; only the mint recipient changed.
- **CST bid before the round's first bid.** It now reverts inside the CST token instead of with `WrongBidType` or `RoundIsInactive`. The reward computed against `lastBidderAddress == 0` is huge, so `mintAndBurnMany` runs before `_bidCommon` and tries to mint to `address(0)`. The failure order is:
  1. `BidCstRewardAmountMinLimitNotReached`, only for an absurd limit.
  2. `InsufficientReceivedBidAmount`.
  3. `ERC20InsufficientBalance`.
  4. `ERC20InvalidReceiver(address(0))`.

  As a result, `TooLongBidMessage`, `RoundIsInactive`, and `WrongBidType` are not reported in this state. This behavior is intentional (Comment-202609074, Comment-202501045).
- **First ETH bid.** It ignores `bidCstRewardAmountMinLimit_`. A transaction that live V2 rejected with `BidCstRewardAmountMinLimitNotReached` (any nonzero limit before activation, or a limit above the reward measured from `roundActivationTime`) now succeeds, or fails with the next applicable error: `InsufficientReceivedBidAmount`, `UsedRandomWalkNft`, `CallerIsNotNftOwner`, `TooLongBidMessage`, or `RoundIsInactive`.
- **New price-quote reverts.** Inside the late-bid window, a quote taken a few seconds earlier can be too low. ETH bids then revert with `InsufficientReceivedBidAmount(bidPrice, msg.value)`, and CST bids with `InsufficientReceivedBidAmount(price, cstPriceMaxLimit_)`.
- **Failed ETH transfers** (`V1+`). The bid refund and the main ETH prize transfer re-throw the recipient's raw revert data instead of `FundTransferFailed`. The position in the flow is unchanged.
- **Removed getters.** Calls to removed selectors revert with empty data. The Game has `receive` but no `fallback`.
- **Checked arithmetic** (`V1+`). The bid paths, champion updates, `claimMainPrize`, `_distributePrizes`, and `halveEthDutchAuctionEndingBidPrice` arithmetic now run in `unchecked` blocks. In live V2 they were checked. With realistic values nothing overflows, so only owner-misconfiguration failure modes differ.
- **Unchanged.** The `claimMainPrize` authorization order (`MainPrizeEarlyClaim`, `NoBidsPlacedInCurrentRound`, `MainPrizeClaimDenied`) and the ETH bid check order are the same, apart from the first-bid minimum-limit skip.

##### Owner Configuration

- **New setters** (`V3`): the 6 setters listed in [Functions](#functions). Each is `onlyOwner` and `_onlyRoundIsInactive`, and emits its `*Changed(uint256)` event. As with existing setters, none validates its argument. Zero values are benevolent-owner footguns:
  - `setCstBidPriceDeclineMultiplierChangeDivisor(0)` makes every ETH bid panic with a division by zero, including the first bid of a round, so no round can start until the owner restores a nonzero divisor.
  - `setRoundLateBidDurationDivisor(0)` makes `getRoundLateBidDuration` and every non-first bid panic.
  - `setCstBidPriceDeclineMultiplier(0)` freezes the CST price at its beginning price permanently, because neither ETH nor CST bids can move the multiplier off 0. `getCstDutchAuctionDurations` then panics with a division by zero. Only another owner call between rounds fixes it.
  - `setMainPrizeNumCosmicSignatureNfts(0)` lets the claim succeed with 0 NFTs for the beneficiary. `MainPrizeClaimed` then reports `prizeNumCosmicSignatureNfts = 0` and an ID that will belong to a later prize.
- **Disabled setters** (`V3`). `setCstDutchAuctionDuration` and `setCstDutchAuctionDurationChangeDivisor` revert with `NotImplemented()` for any caller, before any ownership check. Their events can no longer be emitted (Comment-202608014).
- **Changed meaning.** `setBidCstRewardAmountMultiplier` now takes a linear multiplier. `setCstDutchAuctionBeginningBidPriceMinLimit` now bounds `2 * base` instead of `2 * paidPrice`.
- **`mainPrizeTimeIncrementInMicroSeconds`** now also scales the late-bid window (`getRoundLateBidDuration`) and the premium curve. It already scaled the bid CST reward in live V2, inside the square root, and now scales it linearly. It does not scale `cstBidPriceDeclineMultiplier`.

#### Changes in V1 and V2 Sources

##### New V1 vs Old V1 (`V1+`)

- Renamed `BiddingBase` -> `BiddingCommon` and `MainPrizeBase` -> `MainPrizeCommon`. Their interfaces became `IBiddingCommon` and `IMainPrizeCommon`.
- The interface hierarchy was flattened, as described in [ABI Changes](#abi-changes). `IMainPrize` is now `IMainPrize1` plus `IMainPrize2`.
- Storage slot 259 and the statistics getters changed as described in [Storage Layout](#storage-layout) and [Functions](#functions).
- `getDurationUntilMainPrize` returns `int256`, and `getDurationUntilMainPrizeRaw` was removed. `getCstDutchAuctionDurations` returns `(uint256, uint256)`. The `bidWithCst*` parameter was renamed to `cstPriceMaxLimit_`.
- All Game errors except `ZeroAddress(string)` lost `errStr` (Comment-202609299; non-Game errors such as `UnauthorizedCaller(string, address)` also keep it). `FirstRound(string)` became `FirstRound()`. `require(cond, Error(...))` became `if (!cond) revert`.
- Refunds and the main ETH prize use `transferEthTo`. A charity failure emits `EthTransferToCharityFailed`. `ArbitrumError` was replaced by 4 events.
- Bidding, `claimMainPrize`, `_distributePrizes`, `_prepareNextRound`, champion updates, and `halveEthDutchAuctionEndingBidPrice` are now `unchecked`. In old V1, `_prepareNextRound` was checked, so the Comment-202606235 hardening now applies to V1 too.
- `nextEthBidPrice` uses `CosmicSignatureHelpers.tryIncreaseValueExponentially`, which computes the same formula.
- V1 economics, prize layout, and event order are unchanged.

##### New V2 vs Old V2 (`V2+` plus everything from V1)

- `CosmicSignatureGameV2` was split:
  - `CosmicSignatureGameV2Base` (constructor, `_authorizeUpgrade`, initializer plumbing) is shared with V3.
  - `BiddingV2` became `BiddingV2Base` (shared: `receive`, external bid entry points, ETH pricing `getNextEthBidPriceAdvanced`, the ETH Dutch auction, `_bidCommon`, `_mintBidCstRewardAmountIfNeeded`, `_burnCstBidPriceAndMintBidCstRewardAmountIfNeeded`, `halveEthDutchAuctionEndingBidPrice`) plus `BiddingV2` (V2 `_bidWithEth`, `_bidWithCst`, CST price, `getCstDutchAuctionDurations`, square-root reward).
  - The two reward helpers take a recipient parameter, which V2 sets to `_msgSender()` and V3 to the previous bidder. V2 behavior is unchanged: mint only when the reward is greater than 0, otherwise burn alone. `_bidCommon` became `internal`.
  - `MainPrizeV2` became `MainPrizeV2Base` (`claimMainPrize`, `_prepareNextRound`, prize getters) plus `MainPrizeV2` (`_distributePrizes`).
  - `CosmicSignatureGameStorageV2` became `CosmicSignatureGameStorageV2Base` plus a gap-only `CosmicSignatureGameStorageV2`.
  - `BiddingBaseV2` and `MainPrizeBaseV2` became `BiddingCommonV2` and `MainPrizeCommonV2`.
  - `IBiddingV2` is now `IBidding1V2` plus `IBidding2V2` (the V2 `BidPlaced`). `IBiddingBaseV2`, `IMainPrizeBaseV2`, and `IMainPrizeV2` were deleted, so V2 and V3 implement the shared V1-named `IBiddingCommon`, `IMainPrizeCommon`, and `IMainPrize`.
- `initializeV2()` became `reinitialize()` and sets the same 4 values. The constant `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` was renamed to `DEFAULT_BID_CST_REWARD_AMOUNT_RADICAND_MULTIPLIER` with the same value. The name `DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER` now holds the V3 value.
- `setCstDutchAuctionDuration` and `setCstDutchAuctionDurationChangeDivisor` became `virtual` (V3 overrides them as `public`; the ABI is unaffected). `_checkIfPrevVersionWasInitialized` changed from `private` to `internal virtual`, and its modifier moved to `CosmicSignatureGameV2Base`. The champion-update return value and the round-statistics hook are described in [Round Statistics](#round-statistics).
- V2 economics are unchanged: the square-root reward to the caller, the duration-based CST auction, uniform raffles, `BidPlaced` field 8 as `cstDutchAuctionDuration`, the 6-field `MainPrizeClaimed` emitted after all `*PrizePaid` events (followed only by the `_prepareNextRound` events), and the beneficiary NFT at `F`.

##### Consequence for Tests

The new V1 and V2 bytecode and ABI differ from the deployed implementations. Tests that deploy V1, upgrade to V2, then to V3 exercise the refactored sources, not the live V2 bytecode.

- Live behavior was checked separately. An Arbitrum One fork rehearsal upgraded the real deployed V2 to V3 and played 2 rounds; its scripts are not committed. The committed, reproducible check is `test/tests-src/CosmicSignatureGameV3-DeployedV2StorageLayout.js`, which validates V3 against the deployed V2 layout in `test/data/deployed-storage-layouts/arbitrumOne-CosmicSignatureGameV2.json`.
- To decode historical events and errors, and to verify historical implementations, use `main` artifacts.

#### Contract Structure

##### New V3 Sources

All paths are in `contracts/production/`:

- Contracts: `CosmicSignatureGameV3.sol`, `CosmicSignatureGameStorageV3Base.sol`, `CosmicSignatureGameStorageV3.sol`, `SystemManagementV3.sol`, `BidStatisticsV3.sol`, `BiddingV3.sol`, `MainPrizeV3.sol`.
- Library: `libraries/BidRaffleWeightHelpers.sol`.
- Interfaces: `IBiddingV3.sol`, `IBidding1V3.sol`, `IBidding2V3.sol`, `IMainPrizeV3.sol`, `IMainPrize2V3.sol`, `ICosmicSignatureGameStorageV3.sol`, `ISystemManagementV3.sol`, `ISystemEventsV3.sol`.

##### Inheritance

Linearization of `CosmicSignatureGameV3`, most derived first, with interfaces omitted:

`CosmicSignatureGameV3` > `CosmicSignatureGameStorageV3` > `MainPrizeV3` > `BiddingV3` > `BidStatisticsV3` > `SystemManagementV3` > `CosmicSignatureGameStorageV3Base` > `CosmicSignatureGameV2Base` > `MainPrizeV2Base` > `SecondaryPrizesV2` > `BiddingV2Base` > `BidStatisticsV2` > `NftDonationsV2` > `EthDonationsV2` > `SystemManagementV2` > `MainPrizeCommonV2` > `BiddingCommonV2` > `CosmicSignatureGameStorageV2Base` > `AddressValidator` > `UUPSUpgradeable` > `OwnableUpgradeableWithReservedStorageGaps` > `OwnableUpgradeable` > `ContextUpgradeable` > `ReentrancyGuardTransientUpgradeable` > `Initializable`

This matches the compiler's `linearizedBaseContracts` for `CosmicSignatureGameV3`. `CosmicSignatureGameV2` has the same shape with `CosmicSignatureGameStorageV2`, `MainPrizeV2`, and `BiddingV2` above `CosmicSignatureGameV2Base`. V3 does not inherit those V2 leaf contracts.

Checklist conclusions:

- **Every abstract contract is a base of another contract.** All V1, V2, and V3 abstract Game contracts appear in the linearization of `CosmicSignatureGame`, `CosmicSignatureGameV2`, or `CosmicSignatureGameV3`.
- **No later-version contract is a base of an earlier-version one.** V1 contracts inherit only V1 contracts and shared interfaces. V2 contracts never inherit V3 ones. V3 reuses the V2 modules listed above, which is the intended direction. `MainPrizeV2` implements the V1-named interface `IMainPrize`, whose events V2 did not change.
- **Storage order is correct.** `CosmicSignatureGameStorageV3Base` (the new variables) follows all V2 storage, and `CosmicSignatureGameStorageV3` (the gap) comes last.
- **The correct versions of overridden methods are called:**
  - `getNextEthBidPriceAdvanced`: `CosmicSignatureGameV3` -> `BiddingV3` (base plus premium) -> `BiddingV2Base` (base). Inside `BiddingV3`, `super.getNextEthBidPriceAdvanced` resolves to `BiddingV2Base`, so bids get the premium-free base on purpose.
  - `getNextCstBidPriceAdvanced` and `getBidCstRewardAmountAdvanced` resolve to `BiddingV3`. `BiddingV2Base` declares them abstract.
  - `_bidWithEth` and `_bidWithCst` resolve to `BiddingV3`, `_distributePrizes` to `MainPrizeV3`, and `reinitialize` and `_checkIfPrevVersionWasInitialized` to `CosmicSignatureGameV3`. Each implements an abstract declaration in a `V2Base` contract.
  - `_updateRoundStatsOnMainPrizeClaim`: `CosmicSignatureGameV3` -> `MainPrizeV3` -> `BidStatisticsV3` (writes the statistics) -> `BidStatisticsV2` (no-op). The statistics are written exactly once.
  - `getCstDutchAuctionDurations` and `getRoundLateBidDuration` resolve to `BiddingV3`, and the 6 new setters to `SystemManagementV3`.
  - `setCstDutchAuctionDuration` and `setCstDutchAuctionDurationChangeDivisor`: `CosmicSignatureGameV3` -> `SystemManagementV3`, which reverts. The V2 implementation is never reached.
  - `_authorizeUpgrade` resolves to the non-virtual `CosmicSignatureGameV2Base._authorizeUpgrade` (`onlyOwner`, `_onlyRoundIsInactive`). A future V3 -> V4 upgrade has the same constraints, and V3 cannot change them.
  - The external entry points in shared bases call the virtual implementations above: `receive`, `bidWith*`, `getNextEthBidPrice`, `getNextCstBidPrice`, `getBidCstRewardAmount`, and `claimMainPrize`.
- **Exceptions:** none found. Every function with more than one definition in the V3 linearization resolves as listed, and no unintended V2 implementation is reachable. `BiddingV3` does not inherit `BidStatisticsV3` (that base is commented out), and it does not need to.

#### Other Contracts

##### `PrizesWallet` (New Deployment, `PW`)

- The functions, events, constructor, and storage layout are identical to `main`.
- The error `FundTransferFailed(string, address, uint256)` (`0x154fb6c6`) was removed from the ABI. ETH withdrawals use `transferEthTo`, so a failure bubbles the recipient's raw revert data instead.
- Errors lost `errStr`:

  | Error | Old selector | New selector |
  | --- | --- | --- |
  | `EthWithdrawalDenied` | `0xd4ecac94` | `0x05dc9a46` |
  | `DonatedTokenClaimDenied` | `0xc8568d63` | `0xeabe2ba4` |
  | `DonatedNftClaimDenied` | `0xb97dcd17` | `0xe7ca2cb6` |
  | `InvalidDonatedNftIndex` | `0xe7608fde` | `0xce01a0a5` |
  | `DonatedNftAlreadyClaimed` | `0x581c778d` | `0x176a71b0` |

  `UnauthorizedCaller(string, address)` and `ZeroAddress(string)` are unchanged.
- More loops and arithmetic run in `unchecked` blocks: `registerRoundEndAndDepositEthMany`, `_depositEth`, multi-round `withdrawEth`, `claimManyDonatedTokens`, `donateNft`, and `claimManyDonatedNfts`. Behavior is unchanged for realistic values.
- Comment-202606264 (already in `main`, added in commit `ad198b48` on 2026-06-13): `_registerRoundEnd` runs in `unchecked`, so a huge owner-set `timeoutDurationToWithdrawPrizes` cannot overflow round-end registration and block `claimMainPrize` (same class as Comment-202606235). The old wallet was deployed before this commit, so the redeployment is what brings the fix on chain. The branch also corrects the method name in the comment (`_prepareNextRound` -> `_registerRoundEnd`).
- `setBypassSomeAsserts` and `bypassSomeAsserts` exist only in `#enable_asserts` builds (Comment-202610038). They are not in the production ABI.

##### Contracts That Are Not Redeployed

`CosmicSignatureToken`, `CosmicSignatureNft`, `RandomWalkNFT`, `StakingWalletCosmicSignatureNft`, `StakingWalletRandomWalkNft`, `CharityWallet`, `MarketingWallet`, and `CosmicSignatureDao` keep their deployed bytecode. Their source changes are comments only, with two exceptions:

- `CosmicSignatureDao` now references a new alias constant, `DAO_DEFAULT_PROPOSAL_THRESHOLD` (defined as `DEFAULT_BID_CST_REWARD_AMOUNT`, 100 CST). The value and the compiled runtime bytecode are unchanged.
- `CryptographyHelpers` is now marked `memory-safe`, which changes the compiled bytecode of `CosmicSignatureNft` (8340 -> 7730 bytes) and `StakingWalletRandomWalkNft` (2582 -> 2541 bytes). The runtime bytecode of the other 6, metadata excluded, is identical.

Their ABIs and storage layouts are identical, and V3 calls them through unchanged interfaces (`ICosmicSignatureToken`, `ICosmicSignatureNft`, `IRandomWalkNFT`, `IStakingWallet*`, `ICharityWallet`, `IMarketingWallet`), so V3 is compatible with the deployed contracts. They keep their string-carrying errors. `StakingWalletCosmicSignatureNft` still emits the `FundTransferFailed` event (`0x154fb6c6...215a`) when its charity transfer fails, and `CharityWallet` and `StakingWalletCosmicSignatureNft` still revert with the `FundTransferFailed(string,address,uint256)` error.

#### Frontend and Backend Changes

Checklist for Nick. "Upgrade block" means the block of the `Upgraded` event on the proxy. The proxy address does not change.

##### Indexer and Events

- [ ] Keep the live V2 (`main`) ABI for blocks before the upgrade and use the V3 ABI from then on.
- [ ] `BidPlaced` has the same topic in both versions, so switch decoding by block number.
  - From the upgrade block on, field 8 is `cstBidPriceDeclineMultiplier` (CST wei per second).
  - `bidCstRewardAmount` belongs to the bidder of the previous `BidPlaced` in the same round. It is 0 on the first bid. If you match CST `Transfer` logs instead, take the nonzero mint immediately before that `BidPlaced` log: a zero-price CST bid also emits a zero-value mint to the bidder (Comment-202606074), there is no mint when the reward is 0, and a transaction can contain several bids.
  - Do not rely on generated ABI docs for this field: Comment-202607273 and the `getBidCstRewardAmountAdvanced` NatSpec still say the reward is minted to the bidder placing the bid.
  - Rename or add the database column for field 8. Never mix duration and multiplier values in one series.
- [ ] Subscribe to the new `MainPrizeClaimed` topic (`0x9314e785...`) and keep the old one for history. Store `prizeFirstCosmicSignatureNftId` and `prizeNumCosmicSignatureNfts`.
- [ ] Do not treat `MainPrizeClaimed` as the last prize event of a claim. Finalize a claim at the end of the transaction, or at `RoundActivationTimeChanged`.
- [ ] Take NFT IDs from each `*PrizePaid` event and the `MainPrizeClaimed` range. The beneficiary's NFTs are now the highest IDs of the claim.
- [ ] Update CST `Transfer` matching for the new mint order at claim time, and for reward mints going to the previous bidder.
- [ ] Add `EthTransferToCharityFailed`, the 4 `Arb*CallFailed` events, and the 6 new `*Changed` events. `ArbitrumError` and the Game's `FundTransferFailed` event will not appear again.
- [ ] `reinitialize()` emits no `*Changed` events. Snapshot every parameter getter at the upgrade block (see [the table](#values-written-by-reinitialize)).
- [ ] Track `cstBidPriceDeclineMultiplier` through `BidPlaced`, because bids change it without an event.
- [ ] Record the first V3 round number: `roundNum()` at the upgrade block. The upgrade can only land while the round is inactive, so this is round 3 if it lands before round 3's activation, and otherwise round 4.

##### Contract Calls and ABI

- [ ] Regenerate the Game ABI from the `CosmicSignatureGameV3` contract artifact. The `ICosmicSignatureGame*` interface artifacts no longer carry the Game ABI.
- [ ] `getDurationUntilMainPrize()` now returns `int256`. Clamp it to 0 for countdowns. Replace every use of `getDurationUntilMainPrizeRaw()`.
- [ ] Replace removed getters:
  - `getTotalNumBids(r)` -> `roundStats(r).numBids`
  - `getBidderAddressAt(r, i)` -> `getBidInfoAt(r, i).bidderAddress`
  - `getBidderTotalSpentAmounts(r, a)` -> `biddersInfo(r, a)`
  - `bidderAddresses(r)` -> `roundStats(r)`
- [ ] `getCstDutchAuctionDurations()` now returns `(uint256, uint256)`. The first value is the total time for the CST price to fall to 0 from the auction start, and it changes on each bid and on main prize claim.
- [ ] Stop reading `cstDutchAuctionDuration()` and `cstDutchAuctionDurationChangeDivisor()`, which are frozen.
- [ ] Decode errors with the new selectors. Map error names to messages client-side, because revert data has no string.
  - A failed refund or ETH prize transfer to a contract wallet returns raw or empty revert data.
  - A CST bid can fail with CST token errors (`ERC20InsufficientBalance`, `ERC20InvalidReceiver`).
  - Keep the old error ABIs for history and for the non-redeployed contracts.
- [ ] Admin tooling: add the 6 new setters and remove `setCstDutchAuctionDuration` and `setCstDutchAuctionDurationChangeDivisor`. `setBidCstRewardAmountMultiplier` now takes linear units.

##### UI and Economics

- [ ] Do not show the bid CST reward until the first bid of the current round, while `lastBidderAddress() == 0` (Comment-202501022). Label it as the reward the current last bidder receives when outbid. Compute the rate from the getters instead of hard-coding 1 CST per minute.
- [ ] `bidCstRewardAmountMinLimit_`: offer 2 easy choices, zero and nonzero. Preselect nonzero only when the connected address equals `lastBidderAddress()`, and default to 0 otherwise (Comment-202605279). The value is ignored on the first bid.
- [ ] Disable CST bidding while `lastBidderAddress() == 0`.
- [ ] Late-bid window:
  - After the round's first bid, show the window start (`mainPrizeTime - getRoundLateBidDuration()`) and the current ETH premium (`getNextEthBidPrice() - nextEthBidPrice()`). Before the first bid there is no premium, and `nextEthBidPrice` is stale (Comment-202501022), so do not compute the difference.
  - Re-quote every block near `mainPrizeTime`.
  - For ETH bids, quote with `getNextEthBidPriceAdvanced(+N seconds)` and send a margin. For ETH plus Random Walk NFT bids, quote `getEthPlusRandomWalkNftBidPrice(getNextEthBidPriceAdvanced(+N))`, because the discount also applies to the premium. The excess is refunded above `ethBidRefundAmountInGasToSwallowMaxLimit * gasprice`.
  - For CST bids, set `cstPriceMaxLimit_` with headroom.
- [ ] Never derive the next ETH price from the last paid price.
- [ ] Update CST auction charts and progress bars for the fixed-rate decline. The price can reach 0, the minimum restart price is 1 CST, and inside the late window the premium can make the CST price rise. Hide the CST price and progress before the round's first bid.
- [ ] Raffle odds for V3 rounds: a bid's weight is `raffleCumulativeWeight[i] - raffleCumulativeWeight[i-1]` (from `getBidInfoAt(r, i)`), the total is `raffleCumulativeWeight[numBids-1]`, and a bidder's odds per pick are their summed weights divided by the total. For rounds before the first V3 round the weights read 0, so keep the old formula: bid count divided by `numBids`.
- [ ] Prize text: 3 NFTs for the main prize, and the ETH split 20/15/5/5/5. Read percentages and `mainPrizeNumCosmicSignatureNfts()` from the chain instead of hard-coding them.

##### `PrizesWallet`

- [ ] Read `prizesWallet()` from the Game at runtime. Token and NFT donation approvals must target the new wallet.
- [ ] Keep showing the old wallet (`main` ABI) until users withdraw. Past rounds' prizes and donations stay there.
- [ ] Index both addresses, filtering by emitter, because they emit the same event topics. Store the wallet address per round.
- [ ] Route `withdrawEth`, `withdrawEverything`, and the claim calls to the wallet that holds the round. Do not mix rounds from both wallets in one `withdrawEverything` call.
- [ ] Key donated NFTs by `(walletAddress, index)`, because indexes restart at 0 in the new wallet.
- [ ] Read withdrawal timeouts per wallet and per round.
- [ ] Use the new wallet's ABI for its errors. It no longer has `FundTransferFailed`.
- [ ] If you rebuild prize lists from wallet events: a claim's `EthReceived` events and `MainPrizeClaimed.timeoutTimeToWithdrawSecondaryPrizes` come from the wallet the Game points to at claim time, and deposits are emitted Chrono-Warrior first, then bidder raffle indexes N-1 down to 0.

##### Statistics for Prediction Questions

Read `roundStats(r)` after the claim of round `r`. A round `r` below `roundNum()` is final, and a nonzero `totalSpentEthAmount` means the round was tracked from its start.

| Question | Source |
| --- | --- |
| More bids than the previous round? | `numBids`, valid for every round |
| Odd or even number of bids? | `numBids` |
| More ETH spent than the previous round? | `totalSpentEthAmount` |
| Higher maximum CST bid price than the previous round? | `maxCstBidPrice` |
| More CST bids than ETH bids? | `numCstBids` vs `numBids - numCstBids` |
| Longer Endurance Champion or Chrono-Warrior duration than the previous round? | `enduranceChampionDuration`, `chronoWarriorDuration` (final values, written at claim) |
| Did the same bid earn both the Endurance Champion and Chrono-Warrior titles? | `(flags & 4) != 0` |

- Some per-bidder data stays in `biddersInfo(r, a)`.
- For live values during a round, use `tryGetCurrentChampions()`.
- Fields other than `numBids` read 0 for rounds before the first V3 round. Comparing the first V3 round with the last V2 round therefore needs off-chain data from indexed events.
