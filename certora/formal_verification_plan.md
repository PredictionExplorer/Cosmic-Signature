# Formal Verification Plan for Cosmic Signature Contracts

> **Audience**: Junior-to-mid-level Solidity / Certora engineers.  
> **Goal**: Achieve _complete_ formal verification coverage for **all** production Solidity files and their cross-contract interactions using Certora Prover.
> **Target**: ROCK SOLID code with exactly 0 bugs or unexpected behaviors.

---

## 0  High-Level Strategy

1. **Catalogue & Baseline** – create an authoritative list of every contract, library, interface, and existing `.spec` / `.conf` file. Map current coverage vs. codebase.
2. **Per-Contract Verification** – for each contract write or extend specs that cover:  
   • Functional correctness  • Access control  • Re-entrancy  • Arithmetic / overflow  • Upgradeability (if relevant)  • Event emission  • Economic invariants
3. **Cross-Contract & System Invariants** – write specs that reason about flows spanning multiple contracts (ETH, CST, NFTs, storage coupling).
4. **Edge Case Analysis** – systematically identify and verify all edge cases, including:
   • Division by zero scenarios  • Overflow/underflow conditions  • Empty arrays/mappings  • Maximum values  • Timing edge cases  • Address collisions
5. **Regression Harness** – build a Certora CI pipeline (e.g. GitHub Actions) that runs _all_ proofs on every PR.
6. **Maintenance** – document rules for updating specs when business logic evolves.

> We follow an **inside-out** order: start with leaf contracts (libraries, tokens, wallets) → core game modules → umbrella orchestrator → whole-system invariants.

---

## 1  Environment Setup

| Tool | Version | Notes |
|------|---------|-------|
| Solidity compiler | 0.8.29 | Match pragma in contracts |
| Certora Prover | ≥ 6.x | Obtain licence & CLI |
| Foundry / Hardhat | (optional) | Useful for traces & coverage |
| Node JS, npm      | latest LTS | For npm scripts |

```bash
# one-time provisioning
brew install certora-cli  # or use the distributed binary
npm ci                    # install JS deps (if any)
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt  # for helper scripts
```

Create helper npm scripts in `package.json`:
```json
"scripts": {
  "prove": "certoraRun $(cat certora_files.txt)",
  "prove:all": "find . -name '*.conf' -exec certoraRun --config {} \\;",
  "prove:contract": "certoraRun --config $npm_config_contract.conf"
}
```

---

## 2  Inventory & Coverage Matrix

### 2.1  Current Coverage Status

| Category | Contract | Spec Coverage | Priority | Notes |
|----------|----------|---------------|----------|-------|
| **Main Game** | `CosmicSignatureGame.sol` | ❌ NONE | **CRITICAL** | Main contract - needs complete coverage |
| **Storage** | `CosmicSignatureGameStorage.sol` | ❌ NONE | **CRITICAL** | All state variables |
| **Tokens** | `CosmicSignatureToken.sol` | ❌ NONE | **HIGH** | ERC20 + custom mint/burn |
| **NFTs** | `CosmicSignatureNft.sol` | ❌ NONE | **HIGH** | ERC721 + metadata |
| **NFTs** | `RandomWalkNFT.sol` | ❌ NONE | **HIGH** | Custom NFT logic |
| **Game Core** | `Bidding.sol` | ✅ Partial | **HIGH** | Need edge cases |
| **Game Core** | `MainPrize.sol` | ✅ Good | **HIGH** | Need div-by-zero cases |
| **Game Core** | `SecondaryPrizes.sol` | ❌ NONE | **HIGH** | Prize distribution |
| **Wallets** | `PrizesWallet.sol` | ✅ Partial | **HIGH** | Need complete coverage |
| **Wallets** | `StakingWalletCosmicSignatureNft.sol` | ❌ NONE | **HIGH** | Div-by-zero risk |
| **Wallets** | `StakingWalletRandomWalkNft.sol` | ❌ NONE | **HIGH** | Complex state |
| **Wallets** | `CharityWallet.sol` | ❌ NONE | **MEDIUM** | Fund management |
| **Wallets** | `MarketingWallet.sol` | ❌ NONE | **MEDIUM** | Fund management |
| **System** | `SystemManagement.sol` | ❌ NONE | **HIGH** | Configuration |
| **Base** | `BiddingBase.sol` | ❌ NONE | **MEDIUM** | Inherited by Bidding |
| **Base** | `MainPrizeBase.sol` | ❌ NONE | **MEDIUM** | Inherited by MainPrize |
| **Base** | `StakingWalletNftBase.sol` | ❌ NONE | **MEDIUM** | Inherited by staking |
| **Utils** | `BidStatistics.sol` | ❌ NONE | **MEDIUM** | Statistics tracking |
| **Utils** | `EthDonations.sol` | ❌ NONE | **MEDIUM** | Donation handling |
| **Utils** | `NftDonations.sol` | ❌ NONE | **LOW** | NFT donations |
| **Utils** | `AddressValidator.sol` | ❌ NONE | **LOW** | Simple validation |
| **Libs** | `RandomNumberHelpers.sol` | ❌ NONE | **MEDIUM** | RNG verification |
| **Libs** | `CosmicSignatureConstants.sol` | N/A | N/A | Constants only |
| **Libs** | `CosmicSignatureErrors.sol` | N/A | N/A | Errors only |
| **Governance** | `CosmicSignatureDao.sol` | ❌ NONE | **LOW** | DAO functionality |
| **Upgrades** | `OwnableUpgradeableWithReservedStorageGaps.sol` | ✅ Partial | **MEDIUM** | UUPS pattern |

### 2.2  Critical Missing Verifications

1. **CosmicSignatureGame** - The main orchestrator has NO verification!
2. **Token contracts** - CST and NFT contracts completely unverified
3. **Staking wallets** - Known div-by-zero risks unverified
4. **Cross-contract interactions** - No system-wide invariants

---

## 3  Comprehensive Verification Checklist

### 3.1  Universal Properties (ALL Contracts)

For every contract, verify:

1. **Access Control**
   - All `onlyOwner` functions properly restricted
   - All `_onlyGame` modifiers enforced
   - No unauthorized state changes possible
   
2. **ETH Handling**
   - ETH accounting invariants hold
   - No ETH can be locked/lost
   - Fallback/receive functions safe
   
3. **Reentrancy**
   - All external calls protected
   - State changes before external calls
   - No cross-function reentrancy
   
4. **Arithmetic Safety**
   - No unchecked overflows (despite Solidity 0.8)
   - No division by zero
   - Proper handling of maximum values
   
5. **State Consistency**
   - State transitions atomic
   - No partial state updates
   - Invariants maintained

### 3.2  Contract-Specific Deep Dives

#### `CosmicSignatureGame.sol` (CRITICAL - NO COVERAGE)

**Properties to Verify:**
1. UUPS upgrade pattern correctness
2. Round state machine transitions
3. Initialization can only happen once
4. Storage layout preserved across upgrades
5. All inherited functions interact correctly
6. Reentrancy guard effective across all paths

**New Spec Files Needed:**
- `GameStateTransitions.spec`
- `GameUpgradeability.spec`
- `GameInitialization.spec`
- `GameReentrancy.spec`

#### `StakingWalletCosmicSignatureNft.sol` (CRITICAL - DIV BY ZERO)

**Known Risk**: Line 161 - `msg.value / numStakedNftsCopy_` can panic

**Properties to Verify:**
1. `deposit()` gracefully handles zero staked NFTs
2. Reward calculation never overflows
3. Staking/unstaking maintains accounting invariants
4. No rewards lost during unstake
5. Action counter monotonically increases

**New Spec Files Needed:**
- `StakingCSNDivisionSafety.spec`
- `StakingCSNRewardAccounting.spec`
- `StakingCSNStateConsistency.spec`

#### `CosmicSignatureToken.sol` (HIGH - NO COVERAGE)

**Properties to Verify:**
1. ERC20 standard compliance
2. Only game can mint/burn
3. Total supply conservation (mints - burns)
4. Permit functionality secure
5. Voting power correctly tracked

**New Spec Files Needed:**
- `CSTTokenSupply.spec`
- `CSTAccessControl.spec`
- `CSTVotingPower.spec`

### 3.3  Edge Cases to Verify

1. **Timing Edge Cases**
   - Block timestamp at exactly activation time
   - Block timestamp at maximum uint256
   - Time moving backwards (impossible but verify revert)
   - Microsecond precision edge cases

2. **Numeric Edge Cases**
   - Zero values in all inputs
   - Maximum uint256 values
   - One-off errors in loop bounds
   - Negative numbers in signed integers

3. **Array/Mapping Edge Cases**
   - Empty arrays in batch operations
   - Maximum array sizes
   - Duplicate entries
   - Sparse array handling

4. **Address Edge Cases**
   - Zero address handling
   - Contract addresses vs EOAs
   - Self-referential addresses
   - Address collisions in mappings

---

## 4  System-Wide Invariants

These invariants span multiple contracts and must ALWAYS hold:

### 4.1  ETH Conservation Invariant

```
Invariant: Σ(ETH sent to system) = Σ(ETH in contracts) + Σ(ETH distributed)
```

Components:
- Track all msg.value across all entry points
- Sum balances: Game + PrizesWallet + StakingWallets + Charity
- Account for all distributions and withdrawals

### 4.2  Token Supply Invariant

```
Invariant: CST.totalSupply() = Σ(all CST balances) - Σ(burned CST)
```

### 4.3  NFT Uniqueness Invariant

```
Invariant: ∀ NFT ID, exactly one owner exists
Invariant: NFT IDs strictly monotonic
```

### 4.4  Round State Machine Invariant

```
Invariant: Round states follow: Inactive → Active → Claiming → Inactive
Invariant: roundNum increases exactly by 1 per successful claim
```

### 4.5  Staking Consistency Invariant

```
Invariant: numStakedNfts = count(non-zero stake actions)
Invariant: ∀ staked NFT, staking contract owns it
```

### 4.6  Time Monotonicity Invariant

```
Invariant: roundActivationTime[n+1] > mainPrizeTime[n]
Invariant: timestamps never decrease within a round
```

---

## 5  Advanced Verification Techniques

### 5.1  Ghost Variables & Functions

Use ghost variables to track:
- Cumulative ETH flows
- Historical state transitions
- Cross-contract call sequences
- Invariant violation counts

### 5.2  Inductive Invariants

Prove properties hold:
1. Initially (after constructor/initialize)
2. After every possible state transition
3. Across contract upgrades

### 5.3  Temporal Properties

Verify sequences like:
- "If bid placed, then eventually prize claimable"
- "If NFT staked, then always unstakeable"
- "If round started, then must complete"

---

## 6  Updated Work Breakdown & Timeline

### Phase 1: Critical Gap Closure (Weeks 1-3)

| Week | Focus | Deliverables |
|------|-------|-------------|
| 1 | CosmicSignatureGame | Full game state machine specs |
| 2 | Token contracts | CST and NFT complete specs |
| 3 | Staking div-by-zero | Fix critical StakingWalletCSN bug |

### Phase 2: Core Coverage (Weeks 4-8)

| Week | Focus | Deliverables |
|------|-------|-------------|
| 4 | Storage & Management | GameStorage, SystemManagement specs |
| 5 | Secondary systems | SecondaryPrizes, CharityWallet specs |
| 6 | Base contracts | All base contract specs |
| 7 | RandomWalk NFT | Complete RW NFT staking specs |
| 8 | Edge cases | All edge case coverage |

### Phase 3: System Integration (Weeks 9-12)

| Week | Focus | Deliverables |
|------|-------|-------------|
| 9 | Cross-contract flows | Multi-contract interaction specs |
| 10 | System invariants | Global invariant proofs |
| 11 | Upgrade safety | UUPS pattern verification |
| 12 | Performance & Polish | Optimize proof times, documentation |

### Phase 4: Continuous Verification (Ongoing)

- CI/CD integration
- Automated regression testing
- New feature verification
- Security audit preparation

---

## 7  Proof Development Guidelines

### 7.1  Rule Naming Convention

```
rule [contract][property][condition] {
    // Example: gameRoundTransitionMonotonic
    // Example: cstTokenSupplyNeverNegative
    // Example: stakingDivisionAlwaysSafe
}
```

### 7.2  Specification Structure

```cvl
// 1. Methods block - declare all external functions
methods { ... }

// 2. Ghost variables for tracking
ghost mapping(address => uint256) ethSentByUser;

// 3. Definitions for constants
definition MAX_UINT256() returns uint256 = 2^256 - 1;

// 4. Invariants that must always hold
invariant ethAccountingSound() { ... }

// 5. Rules for specific properties
rule specificPropertyHolds() { ... }
```

### 7.3  Common Patterns

```cvl
// Pattern 1: State transition verification
rule stateTransitionValid(method f) {
    env e;
    stateBefore = getState(e);
    f(e, args);
    stateAfter = getState(e);
    assert validTransition(stateBefore, stateAfter);
}

// Pattern 2: Monotonic property
rule valueAlwaysIncreases(method f) {
    env e;
    uint256 before = getValue(e);
    f(e, args);
    uint256 after = getValue(e);
    assert after >= before;
}

// Pattern 3: Conservation law
rule conservationHolds(method f) {
    env e;
    uint256 totalBefore = computeTotal(e);
    f(e, args);
    uint256 totalAfter = computeTotal(e);
    assert totalBefore == totalAfter;
}
```

---

## 8  Critical Bug Patterns to Verify

1. **Division by Zero**
   - StakingWalletCosmicSignatureNft line 161
   - Any other division operations

2. **Reentrancy**
   - External calls without guards
   - Cross-function reentrancy
   - Read-only reentrancy

3. **Access Control**
   - Missing modifiers
   - Incorrect modifier logic
   - Privileged function exposure

4. **Arithmetic Issues**
   - Overflow in unchecked blocks
   - Rounding errors in divisions
   - Off-by-one in loops

5. **State Corruption**
   - Partial state updates
   - Storage collision in upgrades
   - Uninitialized storage

---

## 9  Success Metrics

1. **Coverage**: 100% of public/external functions verified
2. **Invariants**: All system invariants proven
3. **Edge Cases**: All identified edge cases have rules
4. **Performance**: All proofs complete in < 5 minutes
5. **Regression**: Zero proof failures on code changes

---

## 10  Risk Mitigation

1. **High-Risk Areas** (verify first):
   - Division operations
   - External calls
   - Upgrade mechanisms
   - Prize distribution

2. **Medium-Risk Areas**:
   - State transitions
   - Access control
   - Token operations

3. **Low-Risk Areas** (verify last):
   - View functions
   - Simple getters
   - Event emission

---

## 11  Deliverables

For each contract:
1. `.spec` file with complete rules
2. `.conf` file with harness configuration
3. Proof execution report
4. Edge case analysis document
5. Invariant preservation proof

For the system:
1. Cross-contract interaction specs
2. System invariant proofs
3. CI/CD integration
4. Maintenance playbook
5. Security audit package

---

## Appendix A - Known Issues Requiring Immediate Attention

1. **StakingWalletCosmicSignatureNft.sol:161** - Division by zero when no NFTs staked
2. **No reentrancy guards** on several external calls
3. **Missing access control** verification across contracts
4. **No upgrade safety** proofs for UUPS pattern
5. **Unverified randomness** in distribution logic

---

## Appendix B - Tool Configuration

### Optimal Certora Configuration

```json
{
  "files": ["contracts/**/*.sol"],
  "solc": "0.8.29",
  "verify": "Contract:specs/Contract.spec",
  "optimistic_loop": true,
  "loop_iter": 3,
  "rule_sanity": "basic",
  "msg": "Comprehensive verification run"
}
```

### Recommended Flags

- `--optimistic_loop` for bounded loops
- `--loop_iter 3` for reasonable unrolling
- `--rule_sanity basic` to catch spec errors
- `--cache` for faster re-runs
- `--staging` for latest features

---

_This plan is a living document. Update as new risks are discovered and proofs are completed._ 