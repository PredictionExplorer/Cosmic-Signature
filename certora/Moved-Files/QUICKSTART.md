### Cosmic Signature - Quick Start Guide

> **Archived quick start.** The commands, file counts, suite names, coverage labels, and issue descriptions below are historical and are not instructions or findings for the current V3 code. `BiddingMechanicsAllPass.conf` is absent, the final documentation paths refer to old locations, and the prover configurations require reconciliation with the current compiler and interfaces. Use [the parent status page](../README.md) and [current compilation instructions](../../contracts-compiling/docs/contracts-compiling.md). The old division-by-zero claim needs its caller context: `StakingWalletCosmicSignatureNft.deposit` still panics when the count is zero, but `MainPrizeV3` explicitly catches that panic and retains the unpaid allocation in the Game. It is not an unhandled failure of the normal zero-staker claim path.

#### What is This?

Cosmic Signature is an NFT gaming project with:
- **Solidity contracts** in `${workspaceFolder}/contracts/production/` - the game logic, tokens, NFTs, wallets.
- **Certora specifications** in `${workspaceFolder}/certora/` - formal verification to prove correctness.

#### Step 1. Compile Contracts

todo-1 Nick, your Certora scripts should execute the "hardhat compile" task. Take a look at what I wrote in `contracts-compiling.md`. Then delete this step (and this todo).

See `${workspaceFolder}/contracts-compiling/docs/contracts-compiling.md` for details.

#### Step 2. Run Certora Verification

```bash
# Navigate to certora directory
cd certora

# Activate virtual environment
source .venv/bin/activate

# Install Certora (if not installed)
pip install certora-cli

# Set your API key (get one on certora.com)
export CERTORAKEY=<your-key>

# Run a verification
certoraRun ./BiddingMechanicsAllPass.conf
```

#### Project Structure

```
Cosmic-Signature/
├── contracts/production/   # 23 Solidity contracts
│   ├── CosmicSignatureGame.sol     # Main game logic
│   ├── CosmicSignatureToken.sol    # ERC20 governance token
│   ├── CosmicSignatureNft.sol      # ERC721 NFTs
│   ├── Bidding.sol                 # Bidding mechanics
│   ├── MainPrize.sol               # Prize distribution
│   └── ... (wallets, staking, etc.)
│
├── certora/               # Formal verification
│   ├── *.spec files       # 18 verification specifications
│   ├── *.conf files       # 18 configuration files
│   └── formal_verification_plan.md  # Comprehensive plan
│
└── hardhat.config.js      # Build configuration
```

#### Critical Issues Found

The formal verification plan identifies several critical issues:

1. **Division by Zero Bug** in `StakingWalletCosmicSignatureNft.sol` line 161
2. **No verification** for main contracts (CosmicSignatureGame, tokens, NFTs)
3. **Missing reentrancy guards** in several contracts
4. **Unverified upgrade safety** for UUPS pattern

#### Verification Coverage

- ✅ **Good**: Bidding mechanics, prize claiming
- ⚠️ **Partial**: Some wallet contracts  
- ❌ **Missing**: Main game, tokens, NFTs, staking (critical!)

#### For Details, See

- `${workspaceFolder}/docs/contracts-compiling.md` for detailed compilation options. todo-1 But see a related todo above.
- `${workspaceFolder}/certora_instructions.md` for comprehensive Certora usage.
- `${workspaceFolder}/certora/formal_verification_plan.md` for the full verification roadmap.
