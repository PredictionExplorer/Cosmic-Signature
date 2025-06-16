# Certora Formal Verification Best Practices

## Overview
This guide distills industry experience and Certora recommendations into a concise play‑book for writing **CVL** specifications that *prove* the correctness of complex Ethereum contracts. It is intended for engineers and LLM agents who already know the basics of Certora's Verification Language.

## 1 · Think Specifications, Not Tests
* Describe what the contract **must always guarantee**, not how it currently behaves.  
* Avoid mirroring implementation details or individual code paths.  
* Express requirements as logical predicates about contract state (e.g., *total supply equals sum of balances*).  
* One invariant can cover infinite scenarios that unit tests would need to enumerate.

## 2 · State Global Invariants
* Use `invariant { … }` blocks or universal `rule` patterns (`method f`) to express properties that hold after *any* public function.  
* Prefer `forall` quantifiers to cover every address, token ID, or market.

```cvl
invariant totalSupplyConsistency() {
    forall(address a) balances[a] >= 0;
    totalSupply == sum(balances);
}
```

## 3 · Generalise Over Functions
Write rules that receive an arbitrary `method f` so they are checked against every reachable function.

```cvl
rule preservesSolvency(method f, env e, calldataarg data) {
    require assets() >= liabilities();
    f(e, data);
    assert assets() >= liabilities();
}
```

Use `filter {}` only when a property truly involves a subset (e.g., admin‑only functions).

## 4 · Use Preconditions Sparingly
`require` should model **guaranteed** truths (constructor post‑conditions, environment assumptions), not silence failing proofs.  
If a `require` is needed just to make the rule pass, either strengthen the contract to enforce it or add it to an invariant and prove it inductively.

## 5 · Prove Inductiveness
1. **Base case** – show the property holds in the deployed state (or after initialisation).  
2. **Inductive step** – prove every public function preserves it. Failure here means either the property is wrong or the contract is buggy.

## 6 · Harness Advanced CVL Features

| Feature | Typical Use‑Case |
|---------|-----------------|
| **Ghost variables** | Track conceptual values (e.g., ideal total assets) not stored on‑chain. |
| **Hooks** | Detect patterns like reentrancy, delegate‑call usage, or external calls following state changes. |
| **Uninterpreted functions / axioms** | Abstract oracles and external contracts to keep the proof focused. |

### Example – Reentrancy Flag
```cvl
ghost bool reentered = false;

hook afterExternalCall() {
    if(storageWritten && externalCall) {
        reentered = true;
    }
}

rule noReentrancy(method f, env e, calldataarg data) {
    f(e, data);
    assert !reentered;
}
```

## 7 · Real‑World Patterns

| Project | Key Proven Property | Lessons |
|---------|--------------------|---------|
| **Uniswap v4** | `tickAtSqrtRatio(sqrtP) == tick` always | Math relations make powerful invariants. |
| **Compound v3** | Multiple views of collateral stay in sync | Cross‑module consistency invariants find "corner‑case" bugs. |
| **Aave v3 Token** | Delegated votes + balances = total supply | Conservation laws are simple yet critical. |
| **Lido Dual Governance** | Escrow is always solvent; fair share on withdrawal | Combine arithmetic + temporal properties. |
| **SushiSwap Trident** | No action gives free profit / donation attack | Economic invariants reveal pool‑drain exploits. |
| **Morpho Blue** | Each market's borrowed ≤ supplied; no reentrancy | Ghost state + hooks handle complex lending logic. |

## 8 · Practical Checklist
- [ ] Identify high‑level goals (safety, solvency, uniqueness, access control).  
- [ ] Draft invariants in plain English.  
- [ ] Encode each invariant in CVL using universal rules or `invariant {}`.  
- [ ] Prove base case after constructor/init.  
- [ ] Add inductive rule with `method f`.  
- [ ] Iterate on solver feedback; strengthen or split invariants as needed.  
- [ ] Introduce ghost variables/hooks for hidden state or multi‑step properties.  
- [ ] Keep specs readable—clear names, comments, one concept per rule.  
- [ ] Treat counter‑examples as design feedback, not just proof errors.  
- [ ] Run specs in CI so every PR must satisfy the prover.

---

## Sources
1. Certora Technology White Paper – *Invariant vs. Testing* (2025)  
   <https://www.certora.com/blog/white-paper>  
2. Certora Blog – *"The Holy Grail: Proving Against the Unknown for DeFi Protocols"* (2024)  
   <https://www.certora.com/blog/the-holy-grail>  
3. Certora Examples Repository (CVL patterns)  
   <https://github.com/Certora/Examples>  
4. Certora Documentation – CVL Reference & User Guide  
   <https://docs.certora.com/>  
5. Morpho Docs – Formal Verification Overview  
   <https://docs.morpho.org/morpho/concepts/security/formal-verification/>  
6. Morpho Blog – *Formally Verifying Morpho with Certora* (2024)  
   <https://morpho.org/blog/formally-verifying-morpho-with-certora/>  
7. Certora Report – Uniswap v4 Formal Verification  
   <https://www.certora.com/reports/uniswap-v4>  
8. Certora Medium – *Detecting Corner Cases in Compound v3* (2022)  
   <https://medium.com/certora/detecting-corner-cases-in-compound-v3-with-formal-specifications-b7abf137fb15>  
9. Lido Blog – *Dual Governance 101* (2025)  
   <https://blog.lido.fi/dual-governance-101-explainer/>  
10. Certora Blog – *Uniswap v4 Audits: What We Learned* (2025)  
    <https://www.certora.com/blog/uniswap-v4-audits-what-we-learned-about-defi-security>  
11. Certora Blog – *Securing SushiSwap's Trident* (2021)  
    <https://www.certora.com/blog/securing-sushiswap-trident>

## 9 · Cosmic Signature Project-Specific Play-Book
The **Cosmic Signature** protocol contains more than 30 on-chain modules covering auctions, tokenomics, staking, NFT minting, and DAO governance. The diversity of components means that *generic* CVL templates often miss subtle cross-contract interactions. This section distils lessons learned while reading the Solidity sources under `contracts/production/*` and curates invariants that will matter most for **our** verification campaign.

### 9.1 Core Modules & High-Impact Properties

| Area | Contract(s) | What *must* hold | Why it matters |
|------|-------------|------------------|----------------|
| **Auctions** | `Bidding.sol`, `BiddingBase.sol`, `BidStatistics.sol` | • Highest bid never decreases  \\ • Bidder ETH/CSN balance ≥ committed amount  \\ • Sum(all item highestBids) ≤ `PrizesWallet` balance | Prevents phantom bids & insolvency;
market integrity. |
| **Game State** | `CosmicSignatureGame*.sol`, `SystemManagement.sol` | • `currentRoundId` monotonically increases  \\ • Only *one* main-prize winner per round  \\ • Phase transitions follow enum order | Detect logic bugs that skip rounds or
award multiple prizes. |
| **Treasury Flows** | `PrizesWallet.sol`, `CharityWallet.sol`, `MarketingWallet.sol` | • ETH/CSN conservation: inflows – outflows == Δbalance  \\ • Withdrawals only to whitelisted recipients | Ensures solvency; stops treasury drain. |
| **Tokenomics** | `CosmicSignatureToken.sol`, `CosmicSignatureNft.sol` | • `totalSupply == Σ balances` (ERC20/721)  \\ • Staking escrow + liquid == total  \\ • No duplicate token IDs | Canonical supply invariants many
bugs slip on. |
| **Randomness** | `RandomNumberHelpers.sol`, `FairRandomNumberGenerator.js` | • Output is uniform & unpredictable (model via `uninterp rnd`)  \\ • Winner selection unbiased | Game fairness & legal compliance. |
| **Access Control** | *All* modules inheriting `OwnableUpgradeableWithReservedStorageGaps` | • Only owner/DAO can call restricted fns  \\ • Ownership cannot be renounced while contract holds funds | Critical for upgrade & emergency controls. |
| **Upgradeability** | Proxy + `upgrade-prototype/` | • Storage layout compatibility  \\ • New logic preserves public invariants | Prevents silent fund loss on upgrade. |

### 9.2 Sample CVL Templates
Below are *ready-to-adapt* snippets that target high-risk behaviours we saw in the codebase.

#### 9.2.1 Auction Cannot Lose Money
```cvl
rule highestBidNondecreasing(method f, env e, calldataarg data) {
    uint prevHighest = highestBid();
    f(e, data);
    assert highestBid() >= prevHighest;
}
```
Attach `filter {method.name == "placeBid" || method.name == "increaseBid"}` if needed.

#### 9.2.2 Prize Wallet Solvency
```cvl
invariant prizeWalletSolvent() {
    forall(address t) prizesDue[t] <= address(this).balance;
}
```

#### 9.2.3 Token Supply Conservation Across Staking
```cvl
invariant cstSupplyConserved() {
    totalSupply == sum(balances) + sum(stakedBalances);
}
```

#### 9.2.4 Round Uniqueness
```cvl
rule oneMainPrizePerRound(method f, env e, calldataarg data) {
    uint round = currentRoundId();
    uint beforeWinners = winners[round].length;
    f(e, data);
    uint afterWinners = winners[round].length;
    assert afterWinners <= 1;
}
```

### 9.3 Heuristics for Our Specs
1. **Ghost tracking of escrowed tokens** – several contracts move CSN/NFTs between user wallets and staking contracts; introduce ghost variable `totalEscrowed` to reconcile flows.
2. **Time-window checks** – file names like *set-short-durations.js* hint at configurable delays; encode temporal predicates using block.timestamp snapshots.
3. **Reentrancy hooks** – `Bidding.sol` emits external calls after state-changes; add `afterExternalCall()` hook to ensure bid maps not mutated twice.
4. **Role separation** – Model DAO vs. owner powers via environment `env e` roles to prevent capability overlap.
5. **Batch operations** – Many `*_batch` functions loop over arrays; use `forall(uint i)` quantifiers to generalise proofs.

### 9.4 Specification Roadmap
| Milestone | Target Contracts | Deliverable |
|-----------|-----------------|-------------|
| **Phase 1** | Token + NFT + Staking trio | Supply & ownership invariants proven |
| **Phase 2** | Auction & Game logic | Economic invariants; no-loss proofs |
| **Phase 3** | Treasury wallets | Solvency, access control, withdrawal limits |
| **Phase 4** | Upgradeability | Storage compatibility & invariant carry-over |
| **Continuous** | Fuzz-ingesting CVL `method f` harness | Detect new public functions automatically |

---
### Appendix A – Contract → Invariant Cheat-Sheet
```
Bidding.sol                  : Highest bid monotonic, bidder balance check
CosmicSignatureGame.sol      : Round uniqueness, phase order
PrizesWallet.sol             : ETH balance ≥ sum(prizes)
CosmicSignatureToken.sol     : totalSupply conservation, allowance ≤ balance
CosmicSignatureNft.sol       : Unique token IDs, ownerOf token exists
StakingWallet*.sol           : Escrow balance accounting, unlock time ≥ minLimit
SystemManagement.sol         : OnlyOwner modifiers, emergencyStop halts state-changing ops
RandomWalkNFT.sol            : Random seed one-time use, id collisions impossible
```

Incorporating these bespoke patterns early will cut the number of failed proof iterations by an order of magnitude and focus the prover on true safety violations instead of false positives.
