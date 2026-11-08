### Compiling Cosmic Signature Contracts

The Hardhat test command and the deployment and upgrade tasks compile changed sources as needed. Explicit compilation is useful for inspecting a build without deploying or testing. Use `--force` when a fresh compiler run is required, including SMTChecker runs (Comment-202409012).

But instead of executing loose commands in the terminal, prefer executing scripts under the `contracts-compiling/runners/` folder. Each script assumes that CWD is the folder where the script file is located.

#### Prerequisites

1. Install the Solidity Compiler.

   This Hardhat project uses the binary solc compiler (not solc-js) 0.8.34.\
   We recommend using solc-select:

   ```bash
   pip3 install solc-select
   solc-select use 0.8.34 --always-install
   ```

   For more info on solc setup and other relevant info and code, see Comment-202409011 and locations where it's referenced.

2. Clone the GitHub repo if you haven't already.

   ```bash
   git clone https://github.com/PredictionExplorer/Cosmic-Signature.git
   cd Cosmic-Signature
   ```

3. Install Node.js dependencies using the committed lockfile.

   ```bash
   npm ci
   ```

#### Environment Variables

We recommend setting the `HARDHAT_MODE_CODE` environment variable before initializing Hardhat. Our scripts do it, so you rarely need to do it explicitly. See Comment-202510221 for details.

Other environment variables are listed further.

#### Compilation Commands

1. **Compile all builds**.

   ```bash
   cd contracts-compiling/runners
   ./compile.bash
   ```

   `compile.bash` incrementally compiles the build configurations used by the Hardhat test runner script (Comment-202503282).

   `./compile-force.bash` compiles the build configurations with `--force`.

   `clean.bash` deletes all compiled files and clears Hardhat's global cache, so it is a broader cleanup than a force-compile.

2. **Compile a single build**.

   Set the desired environment variables below and run `npx hardhat compile` from the project root. Add `--force` to force recompilation.

   Following are optional environment variables that affect the compilation:\
   `ENABLE_HARDHAT_PREPROCESSOR = true` enables a preprocessor for conditional compilation. \
   `ENABLE_ASSERTS` (according to Comment-202408155, ignored and assumed to be `false` when `ENABLE_HARDHAT_PREPROCESSOR` is not `true`).\
   `ENABLE_SMTCHECKER` (according to Comment-202410099, ignored and assumed to be zero when `ENABLE_HARDHAT_PREPROCESSOR` is not `true`).\
   They are documented in comments in `src/Helpers.js`.\
   The variables (or lack thereof) affect the compiler output folders. Relevant logic is located near Comment-202503272 and Comment-202503302.

   For how to compile with SMTChecker, see the `smtchecker/` folder.

   For how to compile contracts and run Hardhat tests, see the `test/` folder.

#### Notes

- Contract artifacts, including ABIs, are written under `artifacts/`; compiler caches are under `cache/`. Both use build configuration-dependent subfolders (Comment-202503272).

- The Solidity compiler is configured in `hardhat.config.js`, in the `hardhatUserConfig.solidity` object.
