### Cosmic Signature Game Upgrade Storage Annotations

#### Introduction

This document explains why the Game contract sources carry OpenZeppelin storage annotations such as `@custom:oz-renamed-from`, why they must never be removed, and why the committed sources can be deployed as they are, without the manual edits that earlier versions of the upgrade guide prescribed. It records the evidence behind these decisions: the validator's exact rule, the layouts the live deployment manifest records, a matrix of validation outcomes for every annotation variant, and two fork rehearsals of the live V2 to V3 upgrade. Comment-202611032 in `contracts/production/CosmicSignatureGameStorageV2Base.sol` is the short form of this document.

The deployment procedure itself is in `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md`. Behavior and ABI changes are in `docs/v3-vs-v2-changes.md`.

#### How OpenZeppelin Validates an Upgrade

The Game is a UUPS proxy. `hre.upgrades.upgradeProxy` first validates the new implementation against the layout that the OpenZeppelin manifest (`tasks/runners/.openzeppelin/arbitrum-one.json` for Arbitrum One) recorded when the current implementation was deployed. Only then does it deploy the new implementation and send `upgradeToAndCall`. If validation fails, nothing is sent.

The manifest records, for each deployed implementation, every storage variable with its slot, type, and the `renamedFrom` and `retypedFrom` values taken from that implementation's annotations. The recorded values matter for the next upgrade, not only for the current one.

The comparator (`@openzeppelin/upgrades-core`, `storage/compare.js`, `getFieldChange`) decides per variable:

- A **rename** is reported when the recorded name differs from the new variable's `oz-renamed-from` value, and either the names differ, or the names are equal but the new variable's `oz-renamed-from` is set and differs from the recorded `renamedFrom`.
- A **type change** is reported when the types differ, unless the new variable's `oz-retyped-from` equals the recorded type name (with `struct` and contract prefixes stripped). The named old type need not exist in the new sources.
- `unsafeAllowRenames` disables rename reports, but it also changes how the comparator pairs a consumed storage gap with the variables that replaced it, so the Game's layout then fails with an "incompatible type" error at slot 308. `unsafeSkipStorageCheck` disables the whole check. The project keeps both flags `false`.

Two consequences follow. First, an annotation that repeats what the manifest already records is harmless: equal `renamedFrom` values on both sides produce no report. Second, dropping an annotation from the sources is harmless for the next deployment, but that deployment records no `renamedFrom`, so the deployment after it, built from sources that still carry the annotation, fails with an error like "Renamed `cstDutchAuctionDuration` to `cstDutchAuctionDuration`".

#### The Game's Storage History

Three storage slots were renamed or retyped across versions.

| Slot | Deployed V1 | Deployed V2 (manifest) | V3 sources |
| --- | --- | --- | --- |
| 259 | `bidderAddresses`, `mapping(uint256 => BidderAddresses)` | same name and type | `roundStats`, `mapping(uint256 => RoundStats)`, annotated `oz-renamed-from bidderAddresses` and `oz-retyped-from mapping(uint256 => ICosmicSignatureGameStorage.BidderAddresses)` |
| 277 | `cstDutchAuctionDurationDivisor` | `cstDutchAuctionDuration`, recorded `renamedFrom cstDutchAuctionDurationDivisor` | same name, annotated `oz-renamed-from cstDutchAuctionDurationDivisor` |
| 283 | `bidCstRewardAmount` | `bidCstRewardAmountMultiplier`, recorded `renamedFrom bidCstRewardAmount` | same name, annotated `oz-renamed-from bidCstRewardAmount` |

The repository also contains V1 and V2 sources, which the tests deploy and upgrade in sequence (V1 to V2 to V3) before every V3 test. Those sources were refactored after the live deployments: in particular, the in-repo V1 already declares slot 259 as `roundStats` with the V3 struct. So there are two validation chains with different "recorded" layouts:

- The **live chain**: the Arbitrum One manifest's V2 layout versus the V3 sources. At slot 259 the names differ, so both annotations on `roundStats` are required.
- The **test chain**: the in-repo V1 layout versus the V2 sources, then V2 versus V3. At slot 259 the names are equal, so the rename annotation on `roundStats` is accepted only if the in-repo V1 records the same `renamedFrom`.

Before this change, the rename annotation on `roundStats` was kept commented out so that the test chain passed, and the upgrade guide asked the deployer to uncomment it on a deployment branch, and to comment out the slot 277 and 283 annotations as well. The committed sources therefore failed validation against the live manifest, and the guide's second instruction would have set a trap for the next upgrade.

#### What the Validator Reports

The table was produced with `@openzeppelin/upgrades-core` 1.44.2 and `getStorageUpgradeReport`, with both unsafe flags `false`, on layouts extracted from the V3 sources compiled in the production variant (preprocessor disabled). "V2 live" is the manifest's V2 layout; `test/data/deployed-storage-layouts/arbitrumOne-CosmicSignatureGameV2.json` is a byte-identical copy of it. "Deployed as X" means the layout the manifest would record after deploying variant X; "sources X" means the layout compiled from variant X.

| Recorded layout | New layout | Result |
| --- | --- | --- |
| V2 live | sources with the `roundStats` rename annotation commented out (the former committed state) | fails: "Renamed `bidderAddresses` to `roundStats`" |
| V2 live | sources as now committed (all annotations active) | passes |
| V2 live | committed, with the slot 277 and 283 annotations removed | passes |
| V2 live | committed, with the `oz-retyped-from` on `roundStats` removed | fails: "Upgraded `roundStats` to an incompatible type", because the struct members were renamed and retyped |
| deployed as committed | sources as committed | passes |
| deployed as committed | sources without the slot 277 and 283 annotations | passes |
| deployed without the slot 277 and 283 annotations | sources as committed | fails: "Renamed `cstDutchAuctionDuration` to `cstDutchAuctionDuration`" and the same for `bidCstRewardAmountMultiplier` |
| V2 live, `unsafeAllowRenames` true | sources as committed | fails: "Upgraded `roundLateBidDurationDivisor` to an incompatible type" at slot 308 |

`test/tests-src/CosmicSignatureGameV3-DeployedV2StorageLayout.js` asserts the first, second, fourth, and the two "deployed as" rows on every test run, and asserts that the compiled V3 layout records all three slots' annotations.

A NatSpec pitfall was found while producing the table. A line of the form `/// // @custom:oz-retyped-from ...` placed directly after an active `/// @custom:oz-renamed-from ...` line is not a comment to the compiler: it is appended to the preceding tag's value, which then reads `bidderAddresses\n // @custom:oz-retyped-from ...` and no longer matches anything. Commented-out annotations must be placed before the active tags or in a separate comment.

#### Decisions

1. **All storage annotations stay in the sources permanently.** Removing one never helps the next deployment and harms the one after it. The deployed V3 layout will record `renamedFrom` at slots 259, 277, and 283 and `retypedFrom` at slot 259, so every later version built from these sources validates without edits. A future version that renames or retypes a variable adds its own annotation next to the existing ones.

2. **The `roundStats` rename annotation is active in the committed sources, and the in-repo V1 declares the same annotation.** Both chains then see equal `renamedFrom` values at slot 259: the live chain compares the recorded name `bidderAddresses` with the annotation, and the test chain compares the in-repo V1's recorded `renamedFrom bidderAddresses` with the same annotation. The statement is also true for the in-repo V1 itself, whose slot 259 was `bidderAddresses` in the deployed V1. No deployment branch edits are needed any more, and the sources that are tested are the sources that are deployed.

3. **The upgrade guide no longer asks for annotation edits.** The guide's V3 bullet now points here. The historical V2 bullet is kept for the record but marked as not to be replayed, because with the current line order it would trigger the NatSpec pitfall above.

4. **No unsafe validation flags.** `unsafeAllowRenames` does not work for this layout, and `unsafeSkipStorageCheck` would remove the only automated protection against a storage collision.

#### Evidence From Fork Rehearsals

Two rehearsals of the live upgrade were run on 2026-10-12 against forks of Arbitrum One (blocks 514227126 and 514227280) with the real manifest, the owner impersonated, and the test fakes installed at the Arbitrum precompile addresses. Both used the sources at commit 8aa3c396 compiled in the production variant.

- With only the `roundStats` rename annotation activated (the committed state of this document's commit, except for the in-repo V1 annotation, which does not affect the V3 layout): validation passed; `upgradeToAndCall` with `reinitialize` succeeded, emitting `Upgraded` and `Initialized(3)`; a second `reinitialize` reverted with `InvalidInitialization`; the six pre-existing parameters changed to their V3 defaults and the four new ones were written (ten writes in total); the four unused V2 variables (`cstDutchAuctionBeginningBidPriceMinLimit`, `nextRoundFirstCstDutchAuctionBeginningBidPrice`, `cstDutchAuctionDuration`, `cstDutchAuctionDurationChangeDivisor`) kept their live values through the upgrade, the round, and the claim; the three disabled setters reverted with `NotImplemented`; the round-2 statistics were readable through the retyped `roundStats` (1257 bids); a new `PrizesWallet` was deployed and set; round 3 was played with ETH bids, a paid CST bid, a zero-price CST bid, a late-window bid, and a claim, all matching the rules in `docs/cosmic-signature-game-cst-bid-pricing.md`; and round 4 started with the CST auction at `C` again.
- With the slot 277 and 283 annotations commented out as well: the live upgrade also passed, but the manifest written by the plugin recorded no `renamedFrom` at those slots, and validating the committed sources against that recorded layout failed with the two "Renamed `x` to `x`" errors. This is the trap that decision 1 avoids.

The rehearsal scripts are not committed. The reproducible, committed checks are `CosmicSignatureGameV3-DeployedV2StorageLayout.js` for the live chain and `CosmicSignatureGameV3-StorageLayout.js` plus every test that deploys V1 and upgrades to V2 and V3 for the test chain.

One fork artifact is worth knowing: the Hardhat fork has no Arbitrum precompiles, and `FakeArbSys` reads its mode from storage slot 0 of its address, which on the fork holds a nonzero value, so `claimMainPrize` emits `ArbSysArbBlockNumberCallFailed` and falls back to the other entropy sources. The real chain provides the precompiles natively; the live round-2 claim emitted no such event.

#### Deployment Prerequisites Found During the Review

These are procedural, not contract-level, and are listed here so that they are not rediscovered during the deployment.

- The manifest `tasks/runners/.openzeppelin/arbitrum-one.json` and the V1 deployment report `tasks/output/deploy-cosmic-signature-contracts-report-arbitrumOne.json` were never committed. The upgrade task reads the proxy address from the report and the validator reads the manifest, so both must be copied into the checkout from the backup copy before running the upgrade runner, and the updated manifest and the new upgrade report must be committed or backed up afterwards.
- The upgrade runner takes the owner's key from the Hardhat configuration variable `deployerPrivateKey_arbitrumOne` and the registration runner takes `etherScanApiKey_arbitrumOne`.
- The runner scripts start with `#!/usr/bin/bash`, which does not exist on macOS. Run them as `bash ./run-...bash` from `tasks/runners`.
- `_authorizeUpgrade` requires the owner and an inactive round, and so does `setPrizesWallet`. Read `roundActivationTime()` immediately before running; the owner moves it. `setRoundActivationTime` is guarded only by "no bid placed in the current round yet", so the window can be reopened after activation as long as nobody has bid; after a bid, the upgrade waits for the claim and the next round becomes the first V3 round.
- Replacing `PrizesWallet` is optional for V3: V3 calls the same wallet function as V2. If it is replaced, the deploy and `setPrizesWallet` code in `tasks/src/cosmic-signature-tasks.js` must be uncommented before the run, and the registration addresses filled in afterwards.
- `reinitialize` overwrites ten parameters unconditionally. If the owner had tuned any of them on V2, they must be re-applied with the V3 setters while the round is still inactive. The CST rules need no parameter step.
- Before a round's first bid, `getBidCstRewardAmount()` and the elapsed value of `getCstDutchAuctionDurations()` are meaningless (Comment-202501022); a frontend should hide them until the first bid.
