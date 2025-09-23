### Testiging Cosmic Signature DAO With the Tally App

#### Introduction

This document provides guidance on how to deploy contracts to Arbitrum Sepolia and use the Tally app to change `CharityWallet.charityAddress`.

I have provided a similar unit test in `${workspaceFolder}/test/test-src/CosmicSignatureDao.js`. There is also a test in there that changes `MarketingWallet.treasurerAddress`.

My relevant ChatGPT chat is located at https://chatgpt.com/share/e/68d2db25-db18-800d-b095-d2fd1cd25480 .

#### Deploying the Contracts And Seeding Them With CST

- Hack the DAO contract configuration to make durations shorter. Open `${workspaceFolder}/contracts/production/libraries/CosmicSignatureConstants.sol` and change `DAO_DEFAULT_VOTING_DELAY` and `DAO_DEFAULT_VOTING_PERIOD` to something like 1 and 3 minutes respectively.

- Execute live blockchain tests to deploy production contarcts to Arbitrum Sepolia and play the game. As a result, bidder accounts will get some CST amounts that the DAO will use for voting power. Before executing the script, change the live blockchain tests configuration to access Arbitrum Sepolia. See `${workspaceFolder}/live-blockchain-testing/docs/live-blockchain-tests.md` for details.

- Observe the console output. You are going to need it, so keep this terminal open and execute other scripts in a different terminal.

- Under `${workspaceFolder}/live-blockchain-testing`, observe the newly created `output` and `runners/.openzeppelin` folders.

- Restore the live blockchain tests configuration.

- Verify and register the newly deployed contracts by executing `${workspaceFolder}/live-blockchain-testing/runners/run-register-cosmic-signature-contracts-arbitrumSepolia-SelfDestructibleCosmicSignatureGame.bash`. See `${workspaceFolder}/tasks/docs/Cosmic-Signature-Contracts-Deployment-And-Registration.md` for details.

- Restore the DAO contract configuration.

#### Use the Tally App

- The live-blockchain-tests script logged a few accounts to the console. Add those nicknamed owner, bidder1, and bidder2 to MetaMask.

- In the web browser, open https://www.tally.xyz/ , click "Use Tally", click "Connect Wallet". Make sure you connect MetaMask as connected to Arbitrum Sepolia and using the owner account.

- Click "Add DAO", click "Deploy myself", click "Deploy contracts myself", check checkboxes, click "Get started". A form will show up.

- In `${workspaceFolder}/live-blockchain-testing/output/deploy-cosmic-signature-contracts-report-arbitrumSepolia-SelfDestructibleCosmicSignatureGame.json`, copy `cosmicSignatureDaoAddress` and paste it into the "Governor address" field. Select the "Arbitrum Sepolia Rollup Testnet" network. Click "Fetch details".

- A problem is that, apparently due to bugs, Tally has failed to fetch our registered DAO contract from ArbiScan. I tried to manually specify that it's the OpenZeppelin Governor contract, but that didn't work either because, according to ChatGPT, Tally expects the legacy OpenZeppelin 4.x `castVoteBySig` method signature. ChatGPT provided code to patch our DAO with this legacy method, but I dislike the idea of doing that. I would rather wait until Tally supports OpenZeppelin 5. If somehow after they add this support our DAO proves to be inadequate we will still have an option to fix and redeploy it.

- So further steps are theoretical for now. I haven't done them myself.

- Reconnect MetaMask as the bidder1 account.

- Delegate bidder1 votes to itself.

- On bahalf of bidder1, create a proposal to change `CharityWallet.charityAddress` to some address. `CharityWallet` address is found in the same report file.

- Reconnect MetaMask as the bidder2 account.

- Delegate bidder2 votes to itself.

- Wait until voting delay ends.

- Vote for the proposal.

- On ArbiScan.io, connect MetaMask as the owner account.

- Call `CharityWallet.transferOwnership` to transfer ownership to the DAO contract address.

- On Tally.xyz, reconnect MetaMask as the owner account.

- Wait until voting period ends.

- Execute the proposal.

- Observe that `CharityWallet.charityAddress` has changed.

- You can try some actions that will fail. The existing unit test tries most, if not all of these.

	- Create a proposal on behalf of the owner account. It will fail because the account does not hold at least the configured proposal threshold CST amount.

	- Vote before voting delay ends.

	- Vote after voting period ends.

	- Execute the proposal before voting period ends.

	- Vote with an account that holds too little CST to reach quorum and then execute the proposal.

	- Vote against the proposal and then execute it.

#### Afterwards

- See the same named section in `${workspaceFolder}/live-blockchain-testing/docs/live-blockchain-tests.md`.
