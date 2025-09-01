### Slither Docs

https://github.com/crytic/slither

https://github.com/crytic/slither/wiki

https://github.com/crytic/slither/wiki/Usage

### How to Use

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

- Slither supports a number of command line parameters, some of which the "slither-1.bash" script provides.

- Don't run Slither from the command line; run the script instead.\
It will generate a Markdown report file named <!-- Comment-202409112 applies. --> "slither-1-output.md".

- Open the file in VS Code and press Ctrl+Shift+V to open Markdown Preview. In there, you can click links to navigate to relevant locations in Solidity source files.
