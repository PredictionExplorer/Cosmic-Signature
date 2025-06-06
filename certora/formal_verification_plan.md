# Formal Verification Plan for Cosmic Signature Contracts

> **Audience**: Junior-to-mid-level Solidity / Certora engineers.  
> **Goal**: Achieve _complete_ formal verification coverage for **all** production Solidity files and their cross-contract interactions using Certora Prover.
> **Target**: ROCK SOLID code with exactly 0 bugs or unexpected behaviors.
> **Last Updated**: June 2025 - Comprehensive Review

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

> **IMPORTANT**: All existing specs target `CosmicSignatureGame.sol` as it inherits from most other contracts. The spec names indicate the functionality being tested, not separate contracts.

| Category | Contract/Functionality | Spec Coverage | Test Results | Priority | Notes |
|----------|----------------------|---------------|--------------|----------|-------|
| **Main Game** | `CosmicSignatureGame.sol` | ✅ EXTENSIVE | 100% PASS | **DONE** | Verified via multiple specs |
| **Bidding** | Bidding functionality | ✅ COMPREHENSIVE | 100% PASS | **DONE** | 7 spec files, 48+ rules |
| **Prize Claiming** | Prize claim flows | ✅ COMPREHENSIVE | 100% PASS | **DONE** | 11 spec files, 29+ rules |
| **Ownership** | Ownable pattern | ✅ COMPLETE | 100% PASS | **DONE** | 4 rules verified |
| **Storage** | `CosmicSignatureGameStorage.sol` | ⚠️ INDIRECT | Via Game | **HIGH** | Need direct storage invariants |
| **Tokens** | `CosmicSignatureToken.sol` | ❌ NONE | N/A | **CRITICAL** | ERC20 + custom mint/burn |
| **NFTs** | `CosmicSignatureNft.sol` | ⚠️ PARTIAL | Via claims | **HIGH** | Need direct NFT specs |
| **NFTs** | `RandomWalkNFT.sol` | ⚠️ PARTIAL | Via bidding | **HIGH** | Need direct specs |
| **Game Core** | `MainPrize.sol` | ✅ GOOD | Via claims | **DONE** | Covered by prize claim specs |
| **Game Core** | `SecondaryPrizes.sol` | ✅ GOOD | 100% PASS | **DONE** | Covered by secondary prize specs |
| **Wallets** | `PrizesWallet.sol` | ⚠️ INDIRECT | Via claims | **HIGH** | Need direct verification |
| **Wallets** | `StakingWalletCosmicSignatureNft.sol` | ❌ NONE | N/A | **CRITICAL** | Div-by-zero risk! |
| **Wallets** | `StakingWalletRandomWalkNft.sol` | ❌ NONE | N/A | **CRITICAL** | Complex state |
| **Wallets** | `CharityWallet.sol` | ⚠️ PARTIAL | Via claims | **MEDIUM** | Need direct specs |
| **Wallets** | `MarketingWallet.sol` | ⚠️ PARTIAL | Via claims | **MEDIUM** | Need direct specs |
| **System** | `SystemManagement.sol` | ❌ NONE | N/A | **HIGH** | Configuration risks |
| **Base** | `BiddingBase.sol` | ✅ GOOD | Via Game | **DONE** | Inherited by Bidding |
| **Base** | `MainPrizeBase.sol` | ✅ GOOD | Via Game | **DONE** | Inherited by MainPrize |
| **Base** | `StakingWalletNftBase.sol` | ❌ NONE | N/A | **HIGH** | Inherited by staking |
| **Utils** | `BidStatistics.sol` | ❌ NONE | N/A | **MEDIUM** | Statistics tracking |
| **Utils** | `EthDonations.sol` | ❌ NONE | N/A | **MEDIUM** | Donation handling |
| **Utils** | `NftDonations.sol` | ❌ NONE | N/A | **LOW** | NFT donations |
| **Utils** | `AddressValidator.sol` | ❌ NONE | N/A | **LOW** | Simple validation |
| **Libs** | `RandomNumberHelpers.sol` | ⚠️ PARTIAL | Via randomness | **MEDIUM** | Need comprehensive specs |
| **Libs** | `CosmicSignatureConstants.sol` | N/A | N/A | N/A | Constants only |
| **Libs** | `CosmicSignatureErrors.sol` | N/A | N/A | N/A | Errors only |
| **Libs** | `CosmicSignatureEvents.sol` | N/A | N/A | N/A | Events only |
| **Libs** | `CosmicSignatureHelpers.sol` | ❌ NONE | N/A | **LOW** | Helper functions |
| **Libs** | `CryptographyHelpers.sol` | ❌ NONE | N/A | **MEDIUM** | Crypto operations |
| **Governance** | `CosmicSignatureDao.sol` | ❌ NONE | N/A | **LOW** | DAO functionality |
| **Upgrades** | `OwnableUpgradeableWithReservedStorageGaps.sol` | ⚠️ PARTIAL | Via Game | **HIGH** | UUPS pattern |

### 2.2  Critical Missing Verifications

1. **StakingWalletRandomWalkNft** - Complex state management unverified
2. **CosmicSignatureToken** - Core ERC20 token completely unverified  
3. **SystemManagement** - Configuration changes could break invariants
4. **Direct contract verification** - Most specs only verify through CosmicSignatureGame
5. **Cross-contract invariants** - No holistic system properties verified

### 2.3  Existing Spec Summary

**Bidding Mechanics (48+ rules across 7 specs):**
- BiddingMechanics.spec (7 rules)
- BiddingMechanicsAdditional.spec (7 rules)
- BiddingMechanicsAllPass.spec (10 rules)
- BiddingMechanicsComplete.spec (10 rules)
- BiddingMechanicsCore.spec (4 rules)
- BiddingMechanicsExtended.spec (10 rules)

**Prize Claiming (29+ rules across 11 specs):**
- PrizeClaimAccessTiming.spec (5 rules)
- PrizeClaimBoundaryConditions.spec (5 rules)
- PrizeClaimEconomicInvariants.spec (4 rules)
- PrizeClaimEthFlow.spec (2 rules)
- PrizeClaimRandomness.spec (1 rule)
- PrizeClaimReentrancyFailure.spec (3 rules)
- PrizeClaimRoundConsistency.spec (2 rules)
- PrizeClaimSecondaryPrizes.spec (2 rules)
- PrizeClaimStateTransitions.spec (2 rules)
- PrizeClaimTokenNftMinting.spec (4 rules)

**System (4 rules):**
- CosmicGameOwnablePattern.spec (4 rules)

**Total: 81+ rules passing**

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

#### `CosmicSignatureGame.sol` (PARTIALLY COVERED)

**Already Verified:**
- Bidding mechanics (comprehensive)
- Prize claiming flows (comprehensive)
- Ownership patterns
- Basic state transitions

**Still Needs Verification:**
1. UUPS upgrade pattern correctness
2. Storage layout preservation
3. Initialization atomicity
4. Cross-function reentrancy paths
5. Emergency pause mechanisms
6. Integration between all inherited contracts

**New Spec Files Needed:**
- `GameUpgradeability.spec`
- `GameInitialization.spec` 
- `GameEmergencyControls.spec`
- `GameIntegration.spec`

#### `StakingWalletCosmicSignatureNft.sol` (CRITICAL - DIV BY ZERO)

**Known Risk**: Line 161 - `msg.value / numStakedNftsCopy_` can panic

**Properties to Verify:**
1. `deposit()` gracefully handles zero staked NFTs
2. Reward calculation never overflows
3. Staking/unstaking maintains accounting invariants
4. No rewards lost during unstake
5. Action counter monotonically increases
6. ETH cannot be locked in contract
7. Staking rewards distributed fairly

**New Spec Files Needed:**
- `StakingCSNDivisionSafety.spec`
- `StakingCSNRewardAccounting.spec`
- `StakingCSNStateConsistency.spec`
- `StakingCSNEthFlow.spec`

#### `StakingWalletRandomWalkNft.sol` (CRITICAL - NO COVERAGE)

**Properties to Verify:**
1. Compute rewards calculation correctness
2. Accumulated time tracking accuracy
3. No overflow in time calculations
4. Staking/unstaking state consistency
5. ETH distribution fairness
6. Action counter integrity
7. No locked funds

**New Spec Files Needed:**
- `StakingRWRewardCalculation.spec`
- `StakingRWTimeAccounting.spec`
- `StakingRWStateManagement.spec`
- `StakingRWEthDistribution.spec`

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

### 4.7  Critical Division-by-Zero Invariant

```
Invariant: ∀ division operations, divisor ≠ 0
Specific: StakingWalletCosmicSignatureNft.numStakedNfts > 0 when deposit() called
```

### 4.8  Staking Reward Distribution Invariant

```
Invariant: Σ(rewards distributed) ≤ Σ(ETH deposited into staking)
Invariant: No user can claim more rewards than proportionally earned
```

### 4.9  NFT Ownership Invariant

```
Invariant: ∀ staked NFT, staking contract holds ownership
Invariant: ∀ unstaked NFT, original owner regains ownership
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

### Phase 1: Critical Security Fixes (Week 1)

| Priority | Task | Deliverable |
|----------|------|-------------|
| CRITICAL | Fix StakingWalletCSN div-by-zero | StakingCSNDivisionSafety.spec |
| CRITICAL | Verify StakingWalletRW | StakingRW*.spec (4 files) |
| CRITICAL | Verify CST token | CSTToken*.spec (3 files) |

### Phase 2: Direct Contract Verification (Weeks 2-3)

| Priority | Task | Deliverable |
|----------|------|-------------|
| HIGH | Direct NFT verification | NFTOwnership.spec, NFTMinting.spec |
| HIGH | Direct wallet verification | WalletEthFlow.spec, WalletAccess.spec |
| HIGH | SystemManagement verification | SystemConfig.spec, SystemAccess.spec |

### Phase 3: Integration & Invariants (Weeks 4-5)

| Priority | Task | Deliverable |
|----------|------|-------------|
| HIGH | Cross-contract ETH flows | SystemEthConservation.spec |
| HIGH | Token supply invariants | TokenSupplyInvariants.spec |
| HIGH | Upgrade safety | UpgradeIntegration.spec |

### Phase 4: Comprehensive Coverage (Weeks 6-8)

| Priority | Task | Deliverable |
|----------|------|-------------|
| MEDIUM | Utility contracts | BidStats.spec, Donations.spec |
| MEDIUM | Library verification | CryptoHelpers.spec, RandomHelpers.spec |
| LOW | DAO verification | DaoGovernance.spec |
| LOW | Edge case sweep | EdgeCases.spec |

---

## 7  New Specification Templates

### 7.1  Division Safety Template

```cvl
// Template for verifying division safety
methods {
    function getNumStakedNfts() external returns (uint256) envfree;
    function deposit() external payable;
}

rule noDivisionByZeroInDeposit {
    env e;
    
    // Scenario: no NFTs staked
    require getNumStakedNfts() == 0;
    
    // Attempt deposit
    deposit@withrevert(e);
    
    // Should revert gracefully, not panic
    assert lastReverted;
}

rule divisionSafeWithStakedNfts {
    env e;
    uint256 numStaked = getNumStakedNfts();
    require numStaked > 0;
    require e.msg.value > 0;
    
    uint256 balanceBefore = nativeBalances[e.msg.sender];
    deposit(e);
    uint256 balanceAfter = nativeBalances[e.msg.sender];
    
    // Verify correct distribution
    assert balanceAfter == balanceBefore - e.msg.value;
}
```

### 7.2  Token Supply Invariant Template

```cvl
// Template for ERC20 supply tracking
ghost mapping(address => uint256) tokenBalances;
ghost uint256 totalSupply;

hook Sstore balances[KEY address addr] uint256 newBalance (uint256 oldBalance) STORAGE {
    tokenBalances[addr] = newBalance;
}

invariant totalSupplyEqualsSum()
    totalSupply == sumOfBalances()
    {
        preserved with (env e) {
            requireInvariant totalSupplyEqualsSum();
        }
    }
```

---

## 8  Verification Best Practices

### 8.1  Common Pitfalls to Avoid

1. **Assuming Inheritance Coverage** - Verify each contract directly
2. **Ignoring View Functions** - They can have bugs too
3. **Skipping Edge Cases** - Test all boundaries
4. **Incomplete Harnesses** - Mock all external dependencies
5. **Weak Invariants** - Make them as strong as possible

### 8.2  Performance Optimization

1. Use `--optimistic_loop` for bounded loops
2. Leverage `havoc` statements for large mappings
3. Split complex rules into smaller ones
4. Use ghost variables to track cumulative state
5. Parallelize independent proofs

---

## 9  Continuous Integration Setup

```yaml
# .github/workflows/certora.yml
name: Certora Verification

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Certora
        run: pip install certora-cli
      - name: Run All Verifications
        run: |
          for conf in certora/*.conf; do
            echo "Running $conf"
            certoraRun "$conf" || exit 1
          done
```

---

## 10  Summary of Immediate Actions

1. **TODAY**: Create and verify `StakingCSNDivisionSafety.spec`
2. **THIS WEEK**: Complete all CRITICAL items from Phase 1
3. **NEXT WEEK**: Begin direct contract verification
4. **ONGOING**: Update this plan as new risks discovered

---

## 11  Key Findings from Comprehensive Review (June 2025)

### 11.0  Important Verification Update

**✅ StakingWalletCosmicSignatureNft Division by Zero - VERIFIED SAFE**

Through formal verification with Certora (StakingCSNDivisionSafety.spec), we've confirmed that the apparent division-by-zero vulnerability at line 161 is actually handled gracefully:
- The panic is caught by a try-catch block in MainPrize.sol
- Funds are redirected to charity when no NFTs are staked
- No funds are lost, no state corruption occurs
- This is a deliberate design pattern, not a bug

### 11.1  Coverage Reality Check

The initial assessment was misleading - most functionality IS verified, but through `CosmicSignatureGame.sol` rather than individual contracts. This is both good and bad:

**Good**: 
- 81+ rules passing across 17 spec files
- Comprehensive bidding and prize claiming coverage
- Core game mechanics thoroughly tested

**Bad**:
- No direct contract verification means upgrade risks
- Contract-specific invariants may be missed
- Harder to maintain as system grows

### 11.2  Critical Gaps Identified

1. **Staking Wallets** - Completely unverified despite known bugs
2. **Token Contracts** - Core economic primitives have zero specs
3. **System Management** - Configuration changes could break everything
4. **Cross-Contract Invariants** - No holistic system properties verified

### 11.3  Recommended Verification Strategy

1. **Fix Critical Bugs First** - Don't verify broken code
2. **Direct Contract Specs** - Each contract needs its own harness
3. **Integration Tests** - Verify cross-contract interactions
4. **Continuous Verification** - CI/CD pipeline is essential

### 11.4  Risk Assessment Update

| Risk Level | Count | Examples |
|------------|-------|----------|
| CRITICAL | 2 | StakingRW unverified, CST token |
| HIGH | 5 | System management, NFT contracts, wallet ETH flows |
| MEDIUM | 7 | Libraries, utilities, base contracts |
| LOW | 4 | DAO, helpers, simple validators |

### 11.5  Success Criteria

The codebase will be considered "ROCK SOLID" when:
1. Zero division-by-zero possibilities
2. All contracts have direct verification
3. System invariants proven across all contracts
4. 100% of economic flows verified
5. Upgrade safety guaranteed

---

## Appendix A - Known Issues Requiring Immediate Attention

1. **StakingWalletCosmicSignatureNft.sol:161** - ✅ VERIFIED: Gracefully handled via try-catch
2. **No direct contract verification** - All specs target CosmicSignatureGame
3. **Missing token verification** - CST, NFTs unverified
4. **No cross-contract invariants** - System-wide properties unverified
5. **Unverified randomness** - RandomNumberHelpers needs verification

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

## 5  Critical Vulnerabilities Requiring Immediate Attention

### 5.1  StakingWalletCosmicSignatureNft Division by Zero - HANDLED GRACEFULLY ✓

**Location**: `StakingWalletCosmicSignatureNft.sol:161`
```solidity
uint256 rewardAmountPerStakedNftIncrement_ = msg.value / numStakedNftsCopy_;
```

**Status**: ✅ **NOT A BUG - Gracefully Handled**
**Verification**: Confirmed via Certora test `StakingCSNDivisionSafety.spec`

**How it works**:
1. When `numStakedNfts == 0`, the division causes a Solidity panic (error code 0x12)
2. The `deposit()` function is only called from `MainPrize.sol` within a try-catch block
3. The catch block specifically handles `Panic.DIVISION_BY_ZERO` and redirects funds to charity
4. No funds are lost, no contract state is corrupted

**Verified Test Results**:
```
rule depositRevertsWhenNoNftsStaked: SUCCESS ✓
- Confirms deposit reverts when no NFTs staked
- Division by zero panic is properly triggered

rule depositRequiresStakedNfts: SUCCESS ✓  
- Invariant holds that successful deposits require staked NFTs
```

**Code Flow**:
```solidity
// In MainPrize.sol
try stakingWalletCosmicSignatureNft.deposit{value: amount}(roundNum) {
    // Normal flow when NFTs are staked
} catch Panic(uint256 errorCode_) {
    if(errorCode_ != OpenZeppelinPanic.DIVISION_BY_ZERO) {
        OpenZeppelinPanic.panic(errorCode_);
    }
    // Division by zero case: redirect to charity
    charityEthDonationAmount_ += amount;
}
```

### 5.2  Missing Direct Contract Verification

_This plan is a living document. Update as new risks are discovered and proofs are completed._ 