### Prizes Wallet Contract Upgrade And Re-Registration

#### Introduction

There is commented code that deploys and registers a new `PrizesWallet`. The relevant code is coupled with the tasks that upgrade and register the Game contract. The contract owner has an option to uncomment and execute the code.

The old `PrizesWallet` will remain live afterwards. Prize winners will still be able to withdraw their prizes from it.

#### How to Upgrade `PrizesWallet`

- Uncomment the blocks of code near Comment-202607153 and Comment-202607156.

- Upgrade the Game contract.

- Note the new `PrizesWallet` address logged to the console.

- In the contract deployment report JSON file, update `prizesWalletAddress` with the new value. Remember to edit all your copies of the file.

- Near Comment-202607156, provide the correct hardcoded addresses.

- Register the upgraded Game contract.

- Make sure that the Game proxy `prizesWallet` state variable now points at the new `PrizesWallet`. Make sure that in the new `PrizesWallet`, the `game` state variable points at the Game proxy.

#### Web Site Changes

- Update `PrizesWallet` address.

- It could make sense for the web site to keep showing and/or using both the old and the new `PrizesWallet`s until people withdraw their assets from the old one.

#### Afterwards

- Revert any temporary edits you made in files.
