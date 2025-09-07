### Compiling Cosmic Signature Contracts

As a matter of fact, you should never need to explicitly compile the contracts. Tasks and scripts in this project will automatically compile changed source code as needed. But if you suspect that for some reason the auto-compile doesn't work well, you can clean compiled artifacts by executing `../runners/clean.bash` and then run other tasks and scripts. In this case it's pretty much guaranteed that the autocompile will do a good job.

With that note out of the way, here are a few words about how to explicitly compile the contarcts.

#### Prerequisites

1. Clone the GitHub repo if you haven't already.
   ```bash
   git clone https://github.com/PredictionExplorer/Cosmic-Signature.git
   ```

2. Install Node.js dependencies.
   ```bash
   npm install
   ```
   or
   ```bash
   npm ci
   ```

3. Install the Solidity Compiler.\
   This Hardhat project uses the binary solc compiler (not solc-js) 0.8.30.\
   We recommend using solc-select:
   ```bash
   pip3 install solc-select
   solc-select use 0.8.30 --always-install
   ```   
   For more info on solc setup and about other solc setup options see Comment-202409011.

#### Environment Varibles

This Hardhat project requires that prior to initializing Hardhat the `HARDHAT_MODE_CODE` environment variable was set. Our scripts do it, so you don't need to. See Comment-202510221 for details.

Other environment varibles are listed further.

#### Compilation Commands

1. **Basic compilation**.\
   Execute one of the compile scripts under the `../runners` folder.

2. **Compilation with parameters**.\
   Following are optional environment variables that affect the compilation:\
   `ENABLE_HARDHAT_PREPROCESSOR` enables or disables a preprocessor for conditional compilation.\
   `ENABLE_ASSERTS`.\
   `ENABLE_SMTCHECKER`.\
   They are documented in comments in `${workspaceFolder}/hardhat.config.js`.\
   The variables (or lack thereof) affect the compiler output folders. Relevant logic is located near Comment-202503272 and Comment-202503302.\
   To compile with SMTChecker, execute `${workspaceFolder}/smtchecker/compile-1.bash`. (Be sure to review a manual file in the same folder.)\
   To compile (and immediately run tests) with other sensible combinations of the variables, execute `${workspaceFolder}/test/runners/test-1.bash`.

#### Notes

- ABI files of all contracts are exported to the `${workspaceFolder}/artifacts` folder.

- The Solidity compiler is configured in `${workspaceFolder}/hardhat.config.js`, in the `hardhatUserConfig.solidity` object.
