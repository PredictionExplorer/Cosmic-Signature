### Prizes Wallet Contract Upgrade And Re-Registration

#### Introduction

There is commented code that deploys and registers a new `PrizesWallet`. The relevant code is coupled with the tasks that upgrade and register the Game contract. The contract owner has an option to uncomment and execute the code.

The old `PrizesWallet` will remain live afterwards. Prize winners will still be able to withdraw their prizes from it.

`PrizesWallet` is not upgraded through the Game's UUPS proxy. This procedure deploys a separate wallet and changes the Game's pointer while the round is inactive. It does not migrate old balances, donations, or retrieval deadlines. The commented blocks remain disabled in the standard V3 upgrade task, so a Game upgrade alone keeps the existing wallet.

#### How to Upgrade `PrizesWallet`

- Uncomment the blocks of code near Comment-202607153 and Comment-202607156.

- Upgrade the Game contract.

- Note the new `PrizesWallet` address logged to the console.

- In the current Git branch that you are using for this upgrade, in the V1 contract deployment report JSON file, update `prizesWalletAddress` with the new value. Note the Game upgrade and re-registration tasks do not actually read that report field.

- Near Comment-202607156, provide the correct hardcoded addresses.

- Register the upgraded Game contract.

- On ArbiScan, make sure that the Game proxy `prizesWallet` state variable now points at the new `PrizesWallet` and in the new `PrizesWallet` the `game` state variable points at the Game proxy.

#### Web Site Changes

- Update `PrizesWallet` address.

- It could make sense for the web site to keep showing and/or using both the old and the new `PrizesWallet`s until people withdraw their assets from the old one.

  Preserve the association between historical rounds and their wallet address in indexers and retrieval interfaces. The new wallet's getters do not contain the old wallet's records. The local `PrizesWallet-Replacement` test suite checks retrieval from the old wallet after the Game moves to a replacement.

#### Notes

- You have an option to test things on assert-enabled (and, optionally, also SMTChecker-enabled) contracts. When replacing `PrizesWallet` after one or more rounds in an assert-enabled build, have the wallet owner call `setBypassSomeAsserts(true)` on the new wallet immediately before the first main prize claim using it, then `setBypassSomeAsserts(false)` afterwards. This bypasses assertions about the old wallet's round history. See Comment-202610038.
