# Certora: Historical Specifications and Reports

Issue. Files in this folder tree are all stale.\
ToDo-3 Revisit them.\
ToDo-3 Revisit relevant notes in `docs/cosmic-signature-contracts-audit-considerations.md`.\
ToDo-3 Review Git Blame for these files and review changes over past year or two. AI agents edited them.

These files do not establish formal verification of the current V3 release. The June 2025 plan, coverage tables, and success summaries below this directory belong to earlier source and specification revisions. Their differing counts are retained as historical notes, not reconciled into a current pass rate.

The committed `.conf` files select `solc8.29`, whereas current contracts require exactly Solidity 0.8.34. Game configurations target `CosmicSignatureGame` (V1), not `CosmicSignatureGameV3`; specifications also contain obsolete interfaces. The archived runner in `Moved-Files/run_certora_tests.py` overrides the compiler with `solc8.29`. Its summary is not a substitute for inspecting a prover's complete results, assumptions, loop bounds, and counterexamples. There is no current V3 proof result supplied by this directory.

Before reviving a suite, choose its intended source revision, reconcile the configuration and specification with that code, and record the actual compiler, prover version, assumptions, and result URL. The `.conf` source paths are relative to the repository root. Merely compiling the current contracts with Hardhat does not update those configurations. Do not run the historical commands below as a release check: `BiddingMechanicsAllPass.conf` is not present in this repository.

To inspect the committed configuration inventory without starting a remote proof, run `rg --files certora -g '*.conf'` from the repository root. For current compilation and local tests, see [the compilation guide](../contracts-compiling/docs/contracts-compiling.md). SMTChecker, local tests, and coverage are separate checks; none supplies a blanket formal-verification claim.

## Step 1. Activate virtual environment

source .venv/bin/activate

## Step 2. Run the prover

certoraRun ./BiddingMechanicsAllPass.conf

or

certoraRun.py ./BiddingMechanicsAllPass.conf
