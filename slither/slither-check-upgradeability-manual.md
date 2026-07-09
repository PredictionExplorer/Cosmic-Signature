### Online Docs

https://github.com/crytic/slither/wiki/Upgradeability-Checks

### How to Use

- Make sure Slither works.\
See its manual in another document.

- Execute the `slither-check-upgradeability-*.bash` scripts.

- Review the script output in the terminal.

### ToDo-1

- If you later develop another version of the upgradeable contract you will need to add a script for it.

### Notes

- Any storage variable renames will be reported as errors. This utility does not support any decorators similar to `@custom:oz-renamed-from`.\
Comment-202607169 relates.

- This utility is not aware of the special gap array that we tagged with Comment-202412142. Therefore it will report an error if the first item in the gap array was replace with a new storage variable.
