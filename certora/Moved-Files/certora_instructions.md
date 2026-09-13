# Running Certora Verification for Cosmic Signature

## Prerequisites

1. **Certora Prover License**: 
   - Sign up at https://www.certora.com to get a license key
   - Set your API key: `export CERTORAKEY=<your-key>`

2. **Install Certora CLI**:
   ```bash
   pip install certora-cli
   ```

3. **Activate the Virtual Environment**:
   ```bash
   cd certora
   source .venv/bin/activate
   ```

4. **Compile Contracts First**:
   ```bash
   cd ..
   npm install
   npx hardhat compile
   ```

## Running Certora Verification

### Basic Usage

From the certora directory:

```bash
# Run a specific verification
certoraRun ./BiddingMechanicsAllPass.conf

# Or using Python
certoraRun.py ./BiddingMechanicsAllPass.conf
```

### Available Verification Suites

The project includes 18 verification suites:

#### Bidding Mechanics
- `BiddingMechanics.conf` - Core bidding rules
- `BiddingMechanicsCore.conf` - Essential bidding properties  
- `BiddingMechanicsExtended.conf` - Extended bidding scenarios
- `BiddingMechanicsComplete.conf` - Comprehensive bidding verification
- `BiddingMechanicsAllPass.conf` - All bidding rules (should pass)
- `BiddingMechanicsAdditional.conf` - Additional edge cases

#### Prize Claiming
- `PrizeClaimAccessTiming.conf` - Access control and timing
- `PrizeClaimBoundaryConditions.conf` - Edge cases
- `PrizeClaimEconomicInvariants.conf` - Economic properties
- `PrizeClaimEthFlow.conf` - ETH flow verification
- `PrizeClaimRandomness.conf` - Randomness properties
- `PrizeClaimReentrancyFailure.conf` - Reentrancy protection
- `PrizeClaimRoundConsistency.conf` - Round state consistency
- `PrizeClaimSecondaryPrizes.conf` - Secondary prize distribution
- `PrizeClaimStateTransitions.conf` - State machine verification
- `PrizeClaimTokenNftMinting.conf` - Token/NFT minting logic

#### Ownership
- `CosmicGameOwnable.conf` - Ownership pattern verification

### Running Multiple Verifications

To run all verifications (this will take significant time):

```bash
# Run all .conf files
for conf in *.conf; do
    echo "Running $conf..."
    certoraRun "$conf"
done
```

### Understanding Results

- **PASSED**: All rules in the spec passed verification
- **FAILED**: At least one rule failed - check counterexamples
- **TIMEOUT**: Verification didn't complete in time limit
- **UNKNOWN**: Prover couldn't determine the result

### Common Options

Add these to your conf files or command line:

```bash
# Increase timeout (default is often too short)
certoraRun ./BiddingMechanics.conf --timeout 7200

# Run specific rules only
certoraRun ./BiddingMechanics.conf --rule randomWalkNftDiscountCorrectFixed

# Generate detailed reports
certoraRun ./BiddingMechanics.conf --msg "Testing bidding mechanics"
```

## Verification Coverage Status

Based on the formal verification plan, current coverage:

### ✅ Good Coverage
- Bidding mechanics
- Prize claiming flows
- Ownership patterns

### ⚠️ Partial Coverage  
- `PrizesWallet.sol`
- `OwnableUpgradeableWithReservedStorageGaps.sol`

### ❌ No Coverage (Critical Gaps)
- `CosmicSignatureGame.sol` - Main orchestrator
- `CosmicSignatureToken.sol` - ERC20 token
- `CosmicSignatureNft.sol` - NFT contract
- `StakingWalletCosmicSignatureNft.sol` - Has division-by-zero risk!
- Most wallet and system contracts

## Critical Issues to Verify

1. **Division by Zero** in `StakingWalletCosmicSignatureNft.sol:161`
   ```solidity
   msg.value / numStakedNftsCopy_  // Can panic if numStakedNftsCopy_ is 0
   ```

2. **Reentrancy** - Several external calls lack guards

3. **Access Control** - Missing verification across contracts

4. **Upgrade Safety** - UUPS pattern needs verification

## Best Practices

1. **Start Small**: Run individual rules before full specs
2. **Check Logs**: Review Certora's web interface for detailed traces
3. **Fix Issues Incrementally**: Address one failing rule at a time
4. **Use Ghost Variables**: Track cumulative state across transactions
5. **Verify Invariants**: Focus on properties that must always hold

## Troubleshooting

1. **"No such file" errors**: Ensure you've compiled contracts first
2. **Timeout issues**: Increase timeout or simplify rules
3. **Path issues**: Run from the certora directory
4. **Solc version mismatch**: Ensure conf files specify `"solc": "solc8.29"`

## Next Steps

1. First compile the contracts:
   ```bash
   cd ..
   npm install
   npx hardhat compile
   ```

2. Then run a simple verification:
   ```bash
   cd certora
   source .venv/bin/activate
   certoraRun ./BiddingMechanicsCore.conf
   ```

3. Review results on Certora's web dashboard

4. Prioritize verifying the critical gaps identified in the formal verification plan 