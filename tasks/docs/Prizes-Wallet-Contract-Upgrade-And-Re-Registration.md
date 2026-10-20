### Prizes Wallet Contract Upgrade And Re-Registration

#### Introduction

There is commented code that deploys and registers a new `PrizesWallet`. The relevant code is coupled with the tasks that upgrade and register the Game contract. The contract owner has an option to uncomment and execute the code.

`PrizesWallet` is not upgraded through the Game's UUPS proxy. This procedure deploys a separate contract and changes `CosmicSignatureGameStorageV2Base.prizesWallet` in the Game proxy contract.

The old `PrizesWallet` will remain live afterwards. Its state will not be migraded to its newly deployed version. Prize winners will still be able to withdraw their prizes from the old contract.

That said, ideally, all prizes should be withdrawn before the upgrade, because playing bots could read `PrizesWallet` to withdraw from address from the Game contract.

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

- Preserve the association between historical rounds and their wallet address in indexers and retrieval interfaces. The local `PrizesWallet-Replacement` test suite checks retrieval from the old wallet after the Game moves to a replacement.

#### Notes

- You have an option to test things on assert-enabled (and, optionally, also SMTChecker-enabled) contracts. When replacing `PrizesWallet` after one or more rounds in an assert-enabled build, have the wallet owner call `setBypassSomeAsserts(true)` on the new wallet immediately before the first main prize claim using it, then `setBypassSomeAsserts(false)` afterwards. This bypasses assertions about the old wallet's round history. See Comment-202610038.
