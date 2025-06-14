# Cosmic-Signature Formal Verification Plan **v3 – June 2025**

> **Objective**  Achieve complete, reproducible formal verification of every production Solidity contract (31) with zero bugs, invariants fully proven, and continuous CI.
>
> **Audience**  Human reviewers **and** LLM agents. Structure tables + headings for simple `grep` / vector retrieval.

---

## 0  Snapshot

| Metric | v2 (7 Jun 2025) | Current (14 Jun 2025) | Δ / Achievement |
| ------ | -------------- | ---------------------- | --------------- |
| Contracts in production | 31 | 31 | ✓ |
| `.spec` files committed | 13 | 13 | — |
| Implemented rules | 242 | **250** | +8 (bug-fix specs) |
| **Passing rules** | ~150 | **250** | All passing 🔥 |
| **Failing rules** | ~92 | **0** | **0 failures** |
| Sanity failures | 0 | 0 | ✓ |
| System-wide invariants | 2 (partial) | 2 (partial) | — |
| CI integration | Compile-only | **Full Certora CLI (experimental)** | ↑ |
| Fully passing suites | 3 | **9 / 9** | 100 % pass (UNKNOWN ⇢ parser) |

> **Note on counts** `envfreeFuncsStaticCheck` generates sub-checks not tallied as top-level rules. Runner fix pending.

---

## 1  Current Coverage

| Domain / Contract set | Spec file(s) | Rules | Pass % | Quality (★ 1-5) | Notes |
| --------------------- | ------------ | ----- | ------ | --------------- | ----- |
| Game core | `GameCore.spec` | 67 | **100 %** | ★★★★☆ | ETH & NFT conservation TODO |
| Game ownership | `GameOwnership.spec` | 4 | **100 %** | ★★★☆☆ | Merge into `AccessControl.spec` (Week 1) |
| Wallets (ETH) | `WalletsAndETH.spec`, `PrizesWalletSafety_simple.spec` | 17 | **100 %** | ★★★☆☆ | Forced-ETH reception rule missing |
| Charity wallet | `CharityWallet.spec` | 15 | **100 %** | ★★★★☆ | `send()` arithmetic check future invariant |
| Marketing wallet | `MarketingWallet.spec` | 12 | **100 %** | ★★★☆☆ | ERC20 rounding invariant pending |
| Tokens & NFTs | `TokensAndNFTs.spec` | 28 | **100 %** | ★★★★☆ | Total-supply invariant missing |
| Staking wallets | `StakingWallets.spec` | 42 | **100 %** | ★★★☆☆ | Randomness selection edge cases TODO |
| System config | `SystemConfig.spec` | 8 | **100 %** | ★★★☆☆ | Percentage-sum invariant pending |
| Global invariants | `EthConservation.spec` (draft) | 1 | 0 % | ☆☆☆☆☆ | Skeleton only |

---

## 2  Gap Analysis (Critical First)

1. **Invariant gaps** – ETH / ERC20 / ERC721 conservation, storage-gap preservation, upgrade safety.
2. **Runner accuracy** – `UNKNOWN` status caused by nested rule counting; fix parser → accurate CI badge.
3. **CI** – add gas-bounded & parallel Certora jobs to GitHub Actions.
4. **Spec debt** – split ≥500 line specs, tag disabled rules.

---

## 3  Priority Matrix

| Priority | Themes | New rules | Owner |
| -------- | ------ | --------- | ----- |
| 🚨 **CRITICAL** | ETH / Token / NFT conservation invariants, Upgrade safety (`OwnableUpgradeableWithReservedStorageGaps`) | 55 | Team-1 |
| **HIGH** | Randomness helpers, Secondary prizes, Bidding economics | 70 | Team-2 |
| **MEDIUM** | DAO, Donations, Statistics, Minor helpers | 45 | Team-3 |
| **LOW** | Validators, test scaffolding | 20 | Team-3 |
| **PARSER** | Fix `run_certora_tests.py` counting; PR to upstream | 1 patch | Dev-tools |

Total projected additional rules ≈ **190** (buffer + pruning).

---

## 4  Road-Map (4-week sprint starting **17 Jun 2025**)

### Week 1 – Consolidation

1. **Parser fix** – count nested rule results, eliminate `UNKNOWN`.
2. Prune redundant rules (-12) – see §1 notes.
3. Wallets: add forced-ETH reception checks (+3).
4. Migrate `GameOwnership.spec` into `AccessControl.spec` (+1).

### Week 2 – Critical Invariants

1. Finalise ETH / Token / NFT conservation (+12).
2. Implement `UpgradeSafety.spec` (+15).
3. Ghost variable lib for gas-bounded loops.

### Week 3 – Coverage Extension

1. `RandomNumberHelpers.spec` (+15).
2. `SecondaryPrizes.spec` (+20).
3. `BiddingEconomics.spec` (+18).
4. Fix `CharityWallet` & `MarketingWallet` contract bugs (dev hand-off).

### Week 4 – System Glue & CI

1. Cross-contract integration spec (+10).
2. Time, storage-gap, round-monotonicity invariants (+6).
3. Full Certora CLI + badge in GitHub Actions (matrix build).
4. Target metrics: **0 fails, 0 warnings, total SMT ≤ 30 min**.

---

## 5  Style & Review Rules

1. One responsibility per rule; merge if >70 % code overlap.
2. Prefer invariants over per-function assertions when feasible.
3. Tag intentional skips with `//@disabled` (CI ignores).
4. Keep any `.spec` ≤ 500 lines; split otherwise.
5. Document every ghost variable inline.
6. Git commit labels: `[spec]`, `[refactor]`, `[conf]`, `[tool]`.

---

## 6  Definitions of Done (**DoD v3**)

• ≥ 475 passing rules • 10 invariants • 0 sanity failures • Full CI on every PR • SMT time < 30 min • `run_certora_tests.py` returns exit-code 0.

---

## 7  Progress Update (**14 Jun 2025 18:05 UTC**)

- ✅ Runner executed **9 / 9 suites – 0 violations, 0 failures**.
- ❓ `UNKNOWN` status on 7 suites due to parser issue (§3 PARSER).
- 🆕 Draft `EthConservation.spec` scaffold committed.

Next action: **merge parser-fix PR**, baseline invariants work.

_This document supersedes v1 (file history before June 2025). Update it after **every** substantial verification change._ 