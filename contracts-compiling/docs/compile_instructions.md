# Compiling Cosmic Signature Contracts

## Prerequisites

1. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

2. **Install Solidity Compiler**:
   The project uses Solidity 0.8.30. The hardhat config looks for the compiler in these locations:
   - `~/.solc-select/artifacts/solc-0.8.30/solc-0.8.30`
   - `~/.local/bin/solc`
   - `/usr/bin/solc`

   Install using solc-select:
   ```bash
   pip install solc-select
   solc-select install 0.8.30
   solc-select use 0.8.30
   ```

## Compilation Commands

1. **Basic compilation**:
   ```bash
   npx hardhat compile
   ```

2. **Clean and compile**:
   ```bash
   npx hardhat clean
   npx hardhat compile
   ```

3. **Compile with specific settings**:
   The project supports different compilation modes via environment variables:
   
   - **Production mode** (default - optimized):
     ```bash
     ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat compile
     ```
   
   - **Debug mode with assertions**:
     ```bash
     ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true npx hardhat compile
     ```
   
   - **With SMTChecker** (formal verification during compilation):
     ```bash
     ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true ENABLE_SMTCHECKER=2 npx hardhat compile
     ```

## Important Notes

- The project uses Solidity 0.8.30 with optimization enabled
- EVM version is set to "prague" (latest Arbitrum-compatible)
- Via-IR is enabled for better optimization
- Different cache folders are used based on compilation mode
- The project includes a preprocessor for conditional compilation

## Compilation Output

Compiled artifacts will be in:
- Production mode: `./artifacts/production/`
- Debug mode: `./artifacts/debug-[true/false]-[true/false]/`

ABI files for key contracts are exported to `./abi/` directory. 