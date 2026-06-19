# Upgrading The Deployed Game To CosmicSignatureGameV2 When Round 0 Ends

## Introduction

This document describes exactly what we will have to do, on Arbitrum One, to upgrade the deployed `CosmicSignatureGame` proxy to `CosmicSignatureGameV2` once bidding round 0 ends. It is based on the `v2` branch sources, the task tooling under `tasks/`, and the live on-chain state.

Companion documents: `v1-refactorings.md` (what changed in the V1 sources), `v2-vs-v1-changes.md` (what V2 changes for users and off-chain code), `v2-upgrade-audit.md` (upgrade safety findings), `v2-upgrade-recommended-tests.md` (additional tests recommended before the upgrade), and `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` (the generic upgrade runbook this procedure builds on).

## Live Deployment Facts (as of 2026-06-11)

Addresses from https://app.cosmicsignature.com/contracts, mapped to repo contract names (the site uses different display names):

| Repo contract | Site name | Address |
|---|---|---|
| `CosmicSignatureGame` proxy | Cosmic Signature Protocol | `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2` |
| `CosmicSignatureGame` implementation (V1) | — | `0x7739148013777c485AD9f3d971e1005Eca686661` (read from the proxy's EIP-1967 implementation slot) |
| Game contract owner (`owner()`) | — | `0x14C82cE4E5713E88C9462680e9C02BF4A3089871` (an EOA; the DAO is *not* the owner, so no governance proposal is needed) |
| `CosmicSignatureToken` | Cosmic Signature Token (CST) | `0xAD91843e6A58Ba560F577E676986AFb1dba6FBA0` |
| `CosmicSignatureNft` | Cosmic Signature NFT | `0xbb84Be3500A63581d3F2d5AC3bdF8685AAedad25` |
| `RandomWalkNFT` | RandomWalk | `0x895a6F444BE4ba9d124F61DF736605792B35D66b` |
| `CosmicSignatureDao` | Cosmic Council | `0xF3D52E1c681949be7E624778dB13DaD7F8c729db` |
| `CharityWallet` | Public Goods Vault | `0x96bB0ADB414d5350f435E52f94946B6C7A0760a9` |
| `MarketingWallet` | Outreach Reserve | `0xa3802c799f5e3D3D3562A9B513a41C6aAF92e25e` |
| `PrizesWallet` | Allocations Wallet | `0xE1b619e9B39ea4109D2F429Ea5eAA307759b0011` |
| `StakingWalletCosmicSignatureNft` | Cosmic Signature NFT Anchoring Wallet | `0x6308A405B4FF1eA890870Efe2a6D036750B81F7C` |
| `StakingWalletRandomWalkNft` | RWLK Anchoring Wallet | `0x5EB3396092841E6c5b0b51141699F6711E830529` |

Only the Game **implementation** changes in this upgrade. The proxy address and all other contracts stay exactly as they are.

Relevant live state read from the proxy (snapshot, 2026-06-11):

- `roundNum()` = 0 — round 0 is still in progress, with bids placed (`lastBidderAddress` is nonzero, `nextEthBidPrice` ≈ 0.137 ETH).
- `mainPrizeTime()` ≈ 2026-06-07 12:09 UTC — already in the past, so **the last bidder can claim the round 0 main prize at any moment** (each new bid pushes the deadline to roughly now + 1 hour, but if bidding stalls, the round can end at any time; after `mainPrizeTime + timeoutDurationToClaimMainPrize` anybody can claim). Be prepared.
- `delayDurationBeforeRoundActivation()` = 1800 (30 minutes) — this is the length of the natural upgrade window after the claim.
- `timeoutDurationToClaimMainPrize()` = 86400 (1 day; V2's `initializeV2` will set it to 2 days).
- `cstDutchAuctionDurationDivisor()` = 83333 and `cstRewardAmountForBidding()` = 100 CST — the two storage slots that `initializeV2` will overwrite with the new V2 meanings.

## Why The Upgrade Can Only Happen Right After Round 0 Ends

1. `CosmicSignatureGame._authorizeUpgrade` is `onlyOwner` + `_onlyRoundIsInactive`. A round is inactive only while `block.timestamp < roundActivationTime`. Round 0 is active and has bids, so:
   - `upgradeToAndCall` reverts with `RoundIsActive` today.
   - `setRoundActivationTime` cannot be used to deactivate mid-round either: it requires `_onlyBeforeBidPlacedInRound`, and bids have been placed.
   - There is deliberately no mid-round escape hatch (Comment-202412188 — trustlessness).
2. `CosmicSignatureGameV2` assumes at least one completed round (`initializeV2` is `_onlyNonFirstRound`; `BiddingV2` removed the round-0 ETH-price fallback — see `v2-vs-v1-changes.md`). `tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md` states this requirement explicitly. Upgrading before round 0 completes would leave the game with a broken ETH price of zero. **Do not upgrade before the round 0 main prize is claimed.**
3. The moment someone calls `claimMainPrize()` for round 0:
   - `roundNum` becomes 1, and `roundActivationTime` is set to `claim time + 30 minutes`.
   - For those 30 minutes the round is inactive → the upgrade is authorized.
   - If the 30 minutes elapse but **no round-1 bid has been placed yet**, the owner can still call `setRoundActivationTime(farFuture)` (allowed while no bid is placed in the round) to reopen the inactive window.
   - Hard deadline: **the first bid of round 1**. Once it lands, the upgrade is blocked until round 1 completes, and the whole procedure repeats at the next round boundary.

## Phase 0 — Preparation (do all of this now, before round 0 ends)

1. **Freeze and review the code.** The upgrade deploys `contracts/production/CosmicSignatureGameV2.sol` from the `v2` branch. Make sure the branch state you will deploy from is final, reviewed, and committed.
2. **Restore the deployment artifacts** that the task tooling requires:
   - `tasks/output/deploy-cosmic-signature-contracts-report-arbitrumOne.json` — the report produced by the V1 deployment (the upgrade task reads `cosmicSignatureGameProxyAddress` from it). It was moved outside the Git repo after deployment; copy it back. If it's lost, recreate it manually with the addresses in the table above (keys: `cosmicSignatureTokenAddress`, `randomWalkNftAddress`, `cosmicSignatureNftAddress`, `prizesWalletAddress`, `stakingWalletRandomWalkNftAddress`, `stakingWalletCosmicSignatureNftAddress`, `marketingWalletAddress`, `charityWalletAddress`, `cosmicSignatureDaoAddress`, `cosmicSignatureGameImplementationAddress`, `cosmicSignatureGameProxyAddress`).
   - `tasks/runners/.openzeppelin/` — the OpenZeppelin Upgrades network manifest for Arbitrum One created during the V1 deployment (also moved outside the repo afterwards; copy it back). Without it, `upgradeProxy` will refuse to run.
   - Make sure `tasks/output/upgrade-cosmic-signature-game-report-arbitrumOne-CosmicSignatureGameV2.json` does **not** exist (the task refuses to overwrite it).
3. **Configure secrets** (the deployer must be the current owner, `0x14C8…9871`):
   ```bash
   npx hardhat vars set deployerPrivateKey_arbitrumOne 0x_OWNER_PRIVATE_KEY
   npx hardhat vars set etherScanApiKey_arbitrumOne YOUR_ETHERSCAN_API_KEY
   ```
   Keep `deployerPrivateKey` empty in `tasks/config/deploy-cosmic-signature-contracts-config-arbitrumOne.json` so it is taken from the Hardhat configuration variable. Make sure the owner account holds enough ETH on Arbitrum One for the implementation deployment plus a few small transactions.
4. **Set the documented unsafe flags** in `tasks/config/upgrade-cosmic-signature-game-config-arbitrumOne-CosmicSignatureGameV2.json`:
   ```json
   "unsafeAllowRenames": true,
   "unsafeSkipStorageCheck": true,
   ```
   These are required (and safe) for this specific upgrade because the `.openzeppelin` manifest recorded the layout of the *deployed* V1 (`cstRewardAmountForBidding`, `__gap_persistent[1 << 255]`), while the `v2`-branch sources renamed that variable (`bidCstRewardAmount` → V2's `bidCstRewardAmountMultiplier`) and shrank the gap. The layouts were manually verified compatible: V2 repurposes the two slots intentionally and appends one variable into the gap region (see `v2-vs-v1-changes.md`, "Public storage getters renamed"). Revert the flags to `false` after the upgrade so future upgrades get full validation. Leave `newInitializerMethodName` as `"initializeV2"`.
5. **Run the static upgrade-safety check**: from `slither/`, execute `slither-check-upgradeability-CosmicSignatureGameV2.bash` (compares `CosmicSignatureGame` → `CosmicSignatureGameV2`) and review the findings.
6. **Rehearse the full procedure** at least twice:
   - Locally: deploy V1 on Hardhat (`tasks/runners/run-deploy-cosmic-signature-contracts-hardhat_on_localhost.bash`), place a bid, claim the main prize, then run `run-upgrade-cosmic-signature-game-hardhat_on_localhost-CosmicSignatureGameV2.bash`.
   - On Arbitrum Sepolia with the corresponding `arbitrumSepolia` scripts, including the registration step.
   - Ideally also on a mainnet fork using the real proxy address, to rehearse with the production manifest and state.
7. **Prepare the round-1 plan**: decide the intended round 1 activation time to set after the upgrade, and have the `setRoundActivationTime` transaction ready. Optionally pre-build a small bot/script that watches for the round 0 `MainPrizeClaimed` event and immediately submits the "freeze" transaction of Phase 1.
8. **Coordinate off-chain work** (frontend/backend/indexer) so the new ABI can be shipped immediately after the upgrade — see Phase 4.

## Phase 1 — The Moment Round 0 Ends

Watch the proxy for `MainPrizeClaimed(roundNum = 0, ...)` (or poll `roundNum()` until it returns 1).

1. **Immediately freeze round 1's activation** to remove all time pressure (recommended even though the upgrade itself fits in the 30-minute window):
   ```text
   CosmicSignatureGame(0x6a714A…63F2).setRoundActivationTime(221845392000)
   ```
   `221845392000` is `TIMESTAMP_9000_01_01`, the same far-future placeholder used at deployment. This call must come from the owner; it succeeds because no bid has been placed in round 1 yet. If you skip this step, the upgrade must complete within 30 minutes of the claim, and a fast first bid in round 1 after activation would block it.
2. Verify the state: `roundNum() == 1`, `getDurationUntilRoundActivation() > 0`, `lastBidderAddress() == address(0)`.

## Phase 2 — Run The Upgrade

From `tasks/runners/`:

```bash
cd tasks/runners
./run-upgrade-cosmic-signature-game-arbitrumOne-CosmicSignatureGameV2.bash
```

What this does (task `upgrade-cosmic-signature-game` in `tasks/src/cosmic-signature-tasks.js`):

1. Compiles the contracts (the runner exports `HARDHAT_MODE_CODE='2'`; the Hardhat preprocessor stays disabled, so `#enable_asserts` code is *not* compiled in).
2. Validates V2 against the recorded V1 layout via OpenZeppelin Hardhat Upgrades (subject to the two unsafe flags).
3. Deploys the new `CosmicSignatureGameV2` implementation contract.
4. Sends `upgradeToAndCall(newImplementation, abi.encodeCall(initializeV2, ()))` to the proxy from the owner account. In that single transaction:
   - V1's `_authorizeUpgrade` checks `onlyOwner` and `_onlyRoundIsInactive` (this is why Phase 1 matters).
   - `initializeV2()` runs as `reinitializer(2)` and sets exactly four storage values:

   | Variable (slot) | Value before | Value after |
   |---|---|---|
   | `cstDutchAuctionDuration` (reuses the `cstDutchAuctionDurationDivisor` slot, which held 83333) | 83333 (divisor semantics) | 43200 = 12 hours (duration semantics) |
   | `cstDutchAuctionDurationChangeDivisor` (new; first slot of the old gap) | 0 | 250 |
   | `bidCstRewardAmountMultiplier` (reuses the `bidCstRewardAmount` slot, which held 100e18) | 100 CST (fixed reward) | 1.08e46 (multiplier semantics) |
   | `timeoutDurationToClaimMainPrize` | 86400 (1 day) | 172800 (2 days) |

   Everything else (round counters, bid statistics, prices, prize percentages, token/wallet addresses, owner) is preserved untouched.
5. Writes the new implementation address to `tasks/output/upgrade-cosmic-signature-game-report-arbitrumOne-CosmicSignatureGameV2.json`. Save a copy of this file outside the Git repo, and leave the original in place.

## Phase 3 — Verify And Register

1. **On-chain sanity checks** (read calls against the proxy):
   - EIP-1967 implementation slot now returns the new implementation address (matches the report file); `owner()` is unchanged.
   - `roundNum() == 1`; `getDurationUntilRoundActivation() > 0` (still frozen).
   - New getters work: `cstDutchAuctionDuration() == 43200`, `cstDutchAuctionDurationChangeDivisor() == 250`, `bidCstRewardAmountMultiplier() == 10800000000000000000000000000000000000000000000`, `timeoutDurationToClaimMainPrize() == 172800`, `getBidCstRewardAmount()` responds (it returns 0 while the round is frozen with no bids, because the reward clock starts at `roundActivationTime`).
   - Old selectors are gone: `cstDutchAuctionDurationDivisor()`, `cstRewardAmountForBidding()` / `bidCstRewardAmount()`, and the old 2-arg `bidWithEth(int256,string)` now revert as unknown functions.
   - A second `initializeV2()` call reverts with `InvalidInitialization`.
2. **Register the implementation source on ArbiScan**:
   ```bash
   cd tasks/runners
   ./run-register-upgraded-cosmic-signature-game-arbitrumOne-CosmicSignatureGameV2.bash
   ```
   Then, on ArbiScan, check the proxy page ("Read/Write as Proxy" must show the V2 ABI) and the new implementation page (source verified). If verification fails with "Already Verified" and the proxy is not linked to the new implementation, link them manually on ArbiScan ("Is this a proxy?").
3. Revert `unsafeAllowRenames`/`unsafeSkipStorageCheck` to `false` in the config file and commit; move the updated `.openzeppelin/` manifest (now containing the V2 implementation) back to its safe storage location, keeping a copy.

## Phase 4 — Reconfigure And Reopen Bidding

1. While the round is still inactive, apply any desired parameter changes with the owner setters (all require an inactive round). Nothing is mandatory: `initializeV2` already set the four V2 parameters, and all V1-era parameters carry over.
2. Update the off-chain world before reopening (this upgrade is ABI-breaking; see `v2-vs-v1-changes.md` for the complete list):
   - Frontend/backend/bots: new bid method signatures (extra `bidCstRewardAmountMinLimit_` parameter), new `BidPlaced` topic/layout (two extra fields), renamed getters/setters, the new `CstDutchAuctionDurationChanged` / `CstDutchAuctionDurationChangeDivisorChanged` / `BidCstRewardAmountMultiplierChanged` events, the new `BidCstRewardAmountMinLimitNotReached` error, and the new `getBidCstRewardAmount*` views.
   - Indexers/monitoring keyed on the old `BidPlaced` signature must be migrated, or round 1+ bids will not be indexed.
   - Update the implementation address shown on https://app.cosmicsignature.com/contracts (and any `cg_contracts` database record holding the implementation address).
3. **Reopen bidding** by scheduling round 1's start:
   ```text
   CosmicSignatureGameV2(0x6a714A…63F2).setRoundActivationTime(<intended round 1 start timestamp>)
   ```
   From that moment the round 1 ETH Dutch auction begins (beginning bid price = 2 × the last round 0 ETH bid price, declining over ~2 days toward 1/200 of the beginning price plus 1 Wei, per the unchanged V1 formulas and the current divisor values `ethDutchAuctionDurationDivisor = 20833`, `ethDutchAuctionEndingBidPriceDivisor = 200`).
4. Afterwards: keep the upgrade report and manifest copies outside the repo, and consider deleting the Hardhat secrets:
   ```bash
   npx hardhat vars delete deployerPrivateKey_arbitrumOne
   npx hardhat vars delete etherScanApiKey_arbitrumOne
   ```

## Contingencies

- **A round-1 bid lands before the upgrade** (you missed the window): nothing is broken — the game simply continues on V1 for round 1. Wait for round 1's `MainPrizeClaimed` and repeat Phases 1–4 at that round boundary. (This is also the fallback if anything in Phase 2 fails validation: freeze via `setRoundActivationTime` is still possible only while round 1 has no bids, so if you froze first you have unlimited time to investigate.)
- **OpenZeppelin validation complains about renames/layout** despite the flags: do not improvise on mainnet. Reproduce on the fork rehearsal, fix, and retry at the same (still frozen) round boundary.
- **The upgrade transaction reverts with `RoundIsActive`**: round 1 activated before the transaction was mined. If no bid has been placed yet, call `setRoundActivationTime(221845392000)` and retry; otherwise see the first contingency.
- **The upgrade succeeded but something is wrong in V2**: the proxy owner can upgrade again (deploy a fixed implementation and `upgradeToAndCall`) while the round is still frozen — `_authorizeUpgrade` in V2 has the same `onlyOwner` + `_onlyRoundIsInactive` rules. Note that `initializeV2` cannot run twice; a corrective upgrade would need its own `reinitializer(3)` initializer if it must write state.
- **Accidental early claim by a third party**: after `mainPrizeTime + 1 day` (current timeout), *anyone* may claim the round 0 main prize and thereby open the upgrade window at an unpredictable moment. The watcher from Phase 0 step 7 covers this case too.
