### Online Docs

https://github.com/crytic/slither/wiki/Upgradeability-Checks

### How to Use

- Make sure Slither works.\
  See its manual in another document.

- From `slither/`, execute the appropriate `slither-check-upgradeability-*.bash` script. Note that the V3 wrapper compares `CosmicSignatureGameV2` with `CosmicSignatureGameV3`, both compiled from the current source. It does not read the deployed proxy or its historical compiler layout.

- Review the script output in the terminal.

### ToDo-1

- If you later develop another version of the upgradeable contract you will need to add a script for it.

### Notes

- Keep OpenZeppelin storage validation enabled in the upgrade task. Slither's source comparison is supplementary; it does not replace that validation or the deployed-V2-layout regression suite. See [the upgrade guide](../tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md).

- Any storage variable renames will be reported as errors. This utility does not support any annotations similar to `@custom:oz-renamed-from`.\
  ToDo-202607169-1 relates.

- This utility is not aware of the special gap array that we tagged with Comment-202412142. Therefore it will report an error if the first item in the gap array was replaced with a new storage variable.
