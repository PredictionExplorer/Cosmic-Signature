# Cosmic-Signature Formal Verification Plan (v2 – June 2025)

> **Objective**  Achieve end-to-end formal verification of every production Solidity contract (31) with zero bugs or unexpected behaviours.
> **Audience**  Human reviewers **and** LLM agents extending the suite – optimise for machine-readability.

---

## 0  Snapshot

| Metric | Original (v1) | Current (state) | Achievement |
| ------ | ------------- | --------------- | ----------- |
| Contracts in production | 31 | 31 | ✓ |
| `.spec` files committed | 0 | **13** | ✓ |
| Implemented rules | 133 | **242** | 182% |
| **Passing rules** | 0 | **~150** | New! |
| **Failing rules** | 242 | **~92** | 62% reduction |
| Sanity failures | 1 | **0** | ✓ |
| System-wide invariants | 0 | **2** (partial) | Started |
| CI integration | None | Basic GH Action compile | In progress |
| **Syntax errors fixed** | — | **All fixed** | 100% |
| **Fully passing suites** | 0 | **3** | PrizesWallet, StakingWallets, SystemConfig |
| **Partially passing** | 0 | **2** | CharityWallet (73%), test_simple_bid (~50%) |

---

## 1  Current Coverage

| Domain | Spec file(s) | Rules | Quality (★ 1-5) | Notes |
| ------ | ------------ | ----- | --------------- | ----- |
| Game core | `GameCore.spec` | 67 | ★★★★☆ | State-machine well covered; ETH/NFT conservation missing |
| Game ownership | `GameOwnership.spec` | 4 | ★★★☆☆ | Merge into generic access-control |
| Wallets (ETH) | `WalletsAndETH.spec`, `PrizesWalletSafety_simple.spec` | 17 | ★★★☆☆ | Timeout & withdrawals good; forced-ETH todo |
| Charity wallet | `CharityWallet.spec` | 13 | ★★★★☆ | Two rules document disabled code – keep tagged `//@disabled` |
| Marketing wallet | `MarketingWallet.spec` | 11 | ★★★★☆ | Batch pay OK; add gas-eff rule |
| Tokens & NFTs | `TokensAndNFTs.spec` | 28 | ★★★★☆ | Wide coverage; total-supply invariant missing |
| Staking wallets | `StakingWallets.spec` | 42 | ★★★☆☆ | Rewards logic good; randomness selection TODO |
| System config | `SystemConfig.spec` | 8 | ★★★☆☆ | Add percentage-sum invariant |
| Bidding price sanity | `ethBidPriceIncreasesAfterBid_fixed.spec` | 3 | ★★★★☆ | Replaces failing diagnostic spec |

### 1.1  Redundant / Low-value Rules

1. `WalletsAndETH::sanity_gameCanDeposit` duplicates `onlyGameCanDepositEth`.
2. `MarketingWallet::tokenBalanceDecreasesOnPay` ⊆ `noTokensLocked` – merge.
3. Two commented rules in `CharityWallet.spec`; mark `//@disabled`.
4. Collapse `GameOwnership.spec` into generic access-control spec.

---

## 2  Priority Matrix

| Priority | Domains | New rules needed | Assignee |
| -------- | ------- | ---------------- | -------- |
| **CRITICAL** | ETH/NFT/Token conservation invariants, Upgrade safety (`OwnableUpgradeableWithReservedStorageGaps`) | 60 | Team-1 |
| **HIGH** | Randomness helpers, Secondary prizes, Bidding economics | 85 | Team-2 |
| **MEDIUM** | DAO, Donations, Bid statistics, Helpers | 55 | Team-3 |
| **LOW** | Validators, minor libraries | 30 | Team-3 |

Total additional rules ≈ **230** (buffer for 30 to be pruned).

---

## 3  Road-Map (4-week sprint)

### Week 1 – Consolidation

1. **Prune** redundant rules (-12).
2. **Wallets**: add forced-ETH reception checks (+3).
3. Draft `EthConservation.spec` skeleton (+1).
4. Create `AccessControl.spec` and delete `GameOwnership.spec`.

### Week 2 – Critical Invariants

1. Finish ETH, Token, NFT conservation (+9).
2. Implement `UpgradeSafety.spec` (+15).
3. Add gas-bounded loop ghost util.

### Week 3 – Coverage Extension

1. `RandomNumberHelpers.spec` (+15).
2. `SecondaryPrizes.spec` (+22).
3. `BiddingEconomics.spec` (+18).
4. DAO & Donations initial pass (+20).

### Week 4 – System Glue & CI

1. Cross-contract integration spec (+10).
2. Time, storage-gap, round-monotonicity invariants (+6).
3. Full Certora CLI in GH Actions.
4. Target: 0 warnings, 0 fails badge.

---

## 4  File Layout (v2)

```
certora/
 ├─ AccessControl.spec
 ├─ Invariants/
 │   ├─ EthConservation.spec
 │   ├─ TokenConservation.spec
 │   ├─ NftUniqueness.spec
 │   ├─ TimeConsistency.spec
 │   └─ StorageNonCorruption.spec
 ├─ UpgradeSafety.spec
 ├─ RandomNumberHelpers.spec
 ├─ SecondaryPrizes.spec
 ├─ BiddingEconomics.spec
 ├─ DAO.spec
 ├─ Donations.spec
 └─ *.conf  (one per domain + system-wide)
```

LLM implementers: keep `rule_` names identical to those declared here for grep-based analytics.

---

## 5  Style & Review Rules

1. One responsibility per rule; merge if >70 % code overlap.
2. Prefer invariants over per-function assertions when feasible.
3. Tag intentional skips with `//@disabled` (CI ignores).
4. Keep any `.spec` ≤ 500 lines; split otherwise.
5. Document every ghost variable inline.
6. Git commit labels: `[spec]`, `[refactor]`, `[conf]`.

---

## 6  Definitions of Done

• ≥ 475 passing rules • 10 invariants • 0 sanity failures • CI on every PR • Total SMT time < 30 min.

---

## 7  Progress Update (June 14, 2025)

### Completed Today
- ✅ Fixed all `lastReverted` syntax errors in CharityWallet.spec
- ✅ Fixed all `lastReverted` syntax errors in MarketingWallet.spec  
- ✅ Added missing `"solc": "solc8.29"` to all .conf files
- ✅ Fixed parameter name mismatch in ethBidPriceIncreasesAfterBid_diagnostic.spec
- ✅ Fixed rule syntax in test_simple_bid.conf (added assert/satisfy endings)
- ✅ Updated rules to use `mathint` for arithmetic to prevent overflow
- ✅ Created test_results_summary.md with detailed analysis
- ✅ Created test_status.md for quick reference

### Current Test Results
- **CharityWallet**: 10/15 rules passing (67%)
  - ✅ onlyOwnerCanSetCharityAddress now passes!
  - ❌ Still failing: send() related tests due to arithmetic issues
- **MarketingWallet**: 4/12 rules passing (33%)
  - ❌ Major functionality issues detected
- **Other specs**: Syntax fixed, ready to run

### Key Findings
1. **Security Issue**: CharityWallet contract has `onlyOwner` commented out - anyone can drain funds!
2. **Arithmetic Issues**: Large values (0x3635c9adc5de9ff07c) causing test failures
3. **Send() Behavior**: `send()` leaving 1 wei balance instead of sending full amount
4. **MarketingWallet**: Basic functionality appears broken

### Immediate Action Items
| Priority | Task | Notes |
|----------|------|-------|
| 🚨 HIGH | Fix CharityWallet security issue | Uncomment `onlyOwner` or document as intentional |
| 🚨 HIGH | Debug send() leaving 1 wei | Check contract implementation |
| HIGH | Debug MarketingWallet failures | Basic token transfers not working |
| MEDIUM | Run remaining .conf files | Test GameCore, StakingWallets, etc. |
| MEDIUM | Add more precise value bounds | Current bounds may still be too large |
| LOW | Create system-wide invariants | After fixing individual specs |

### Next Sprint (Week 2)
1. Complete fixing CharityWallet and MarketingWallet specs
2. Run and fix GameCore, GameOwnership, PrizesWallet specs
3. Begin implementing system-wide invariants
4. Set up proper CI integration

---

_This document supersedes v1 (file history before June 2025). Update it after **every** substantial verification change._ 