### Online Docs

https://github.com/crytic/slither/wiki/Upgradeability-Checks

### How to Use

- Make sure Slither works.\
See its manual in another document.

- Execute the `slither-check-upgradeability-*.bash` scripts.

- Review the script output in the terminal.

- Note that any storage variable renames will be reported as errors. This usility does not support decorators similar to `@custom:oz-renamed-from`.

- If you later develop another version of the upgradeable contract you will need to add a script for it.\
See online docs for more info.
