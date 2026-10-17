### Compiling Cosmic Signature Contracts

The Hardhat test command and the deployment and upgrade tasks compile changed sources as needed. Explicit compilation is useful for inspecting a build without deploying or testing. Use `--force` when a fresh compiler run is required, including SMTChecker runs (Comment-202409012).

Run the commands below from the repository root unless a different working directory is shown. The Bash wrappers assume their own directory is the working directory and use Linux paths such as `/usr/bin/bash` and `/usr/bin/clear`.

#### Prerequisites

1. Clone the GitHub repo if you haven't already.
   ```bash
   git clone https://github.com/PredictionExplorer/Cosmic-Signature.git
   cd Cosmic-Signature
   ```

2. Install Node.js dependencies.
   ```bash
   npm ci
   ```
   `npm ci` uses the committed lockfile. The project uses Hardhat 2 and Ethers 6.

3. Install the Solidity Compiler.\
   This Hardhat project uses the binary solc compiler (not solc-js) 0.8.34.\
   We recommend using solc-select:

   ```bash
   pip3 install solc-select
   solc-select use 0.8.34 --always-install
   ```

   For more info on solc setup, see Comment-202409011.

   `hardhat.config.js` first looks for `~/.solc-select/artifacts/solc-0.8.34/solc-0.8.34`, then `~/.local/bin/solc`. Verify that the selected native executable reports `0.8.34+commit.80d5c536`; the configuration does not validate the executable's actual version. A compiler installed elsewhere is not selected merely because it is on `PATH`.

#### Environment Variables

We recommend that prior to initializing Hardhat the `HARDHAT_MODE_CODE` environment variable was set. Our scripts already do it, so you rarely if ever need to. See Comment-202510221 for details.

Other environment variables are listed further.

#### Compilation Commands

1. **Production compilation**.

   ```bash
   HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=false npx hardhat compile
   ```

   Add `--force` for a full rebuild. The equivalent wrappers are `compile.bash` and `compile-force.bash` under `contracts-compiling/runners/`; run them from that directory. `clean.bash` clears the project's configured build variants and Hardhat's global cache, so it is a broader cleanup than a force compile.

2. **Compilation with parameters**.\
   Following are optional environment variables that affect the compilation:\
   `ENABLE_HARDHAT_PREPROCESSOR` enables or disables a preprocessor for conditional compilation.\
   `ENABLE_ASSERTS`.\
   `ENABLE_SMTCHECKER`.\
   They are documented in comments in `${workspaceFolder}/src/Helpers.js`.\
   The variables (or lack thereof) affect the compiler output folders. Relevant logic is located near Comment-202503272 and Comment-202503302.\
   `ENABLE_SMTCHECKER=1` changes preprocessing but does not run the solver; `2` also enables the solver. Both require `ENABLE_HARDHAT_PREPROCESSOR=true`. To run SMTChecker, change to `smtchecker/` and run `python3 compile-1.py`; review `compile-1-manual.txt` first. The current model-checker contract list selects only `CharityWallet`, not V3 or every production contract.\
   To exercise the four test build variants with the quick profile, run `npm run hardhat-test-quick` from the repository root. The medium and full profiles are `npm run hardhat-test-medium` and `npm run hardhat-test-full`; they are longer runs, not prerequisites for compiling.

   On systems without `/usr/bin/bash` (including a default macOS installation), invoke the shared runner through the installed Bash instead:

   ```bash
   cd test/runners
   TERM=dumb LONG_TEST_MODE_CODE=1 bash test.bash -b
   ```

   This selects the same quick profile and four build variants as the npm quick command. `-b` makes failure reporting noninteractive.

#### Notes

- Contract artifacts, including ABIs, are written under `${workspaceFolder}/artifacts` in configuration-dependent subfolders (Comment-202503272).

- The Solidity compiler is configured in `${workspaceFolder}/hardhat.config.js`, in the `hardhatUserConfig.solidity` object.

- The current settings are `viaIR: true`, optimizer enabled with 400 runs, and EVM target `osaka`. Production artifacts are in `artifacts/production`; preprocessed artifacts are in the corresponding `artifacts/debug-*` directory. Keep the compiler, settings, dependencies, source revision, and preprocessing flags with any release or verification result.
