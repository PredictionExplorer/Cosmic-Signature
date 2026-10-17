### Slither Online Docs

https://github.com/crytic/slither

https://github.com/crytic/slither/wiki

https://github.com/crytic/slither/wiki/Usage

### How to Use

Run the project wrapper from `slither/`: `bash slither-1.bash`. It points Slither at `..` and uses `artifacts/production`, so invoking it from the repository root changes its target. Install the Node dependencies and the native Solidity compiler described in [the compilation guide](../contracts-compiling/docs/contracts-compiling.md) first. Use a production build with `ENABLE_HARDHAT_PREPROCESSOR=false`.

The wrapper expects Linux utilities (`/usr/bin/clear` and `gio trash`) and searches a developer-specific virtual environment before falling back to `PATH`. If those utilities are unavailable, this equivalent analysis command from the repository root avoids the cleanup wrapper:

```bash
HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=false slither --filter-paths '/contracts/tests/|/node_modules/' --hardhat-artifacts-directory artifacts/production --show-ignored-findings --checklist . > slither/slither-1-output.md
```

The report is a static-analysis result for the compiled revision, not a proof of correctness. Inspect findings and command errors; a nonzero Slither status can report findings as well as tool failure.

- Make sure Python is already installed.
```
python3  --version
```

- If necessary, install PIP.\
Begin with checking that it's not yet installed.
```
pip3  --version

sudo apt install python3-pip

pip3  --version
```

- Install Slither.\
It would probably be a good idea to install it into a virtual environment (per project), but, to keep it simple, let's install it globally.
```
python3 -m pip install slither-analyzer
```

- If Slither is already installed, upgrade it to the latest version.
```
python3 -m pip install --upgrade slither-analyzer
```

- You can run Slither in a Hardhat/Foundry/Dapp/Brownie project folder.
```
slither .
```

- Or, you can run it in a different folder and specify a project folder in the command line.
```
slither path/to/hardhat-project
```

- Slither supports a number of command line parameters, some of which the `slither-1.bash` script provides.

- The script (or the equivalent command above) generates a Markdown report file named <!-- Comment-202409112 applies. --> `slither-1-output.md` in the `slither/` directory.

- Open the file in VS Code and press Ctrl+Shift+V to open Markdown Preview. In there, you can click links to navigate to relevant locations in Solidity source files.
