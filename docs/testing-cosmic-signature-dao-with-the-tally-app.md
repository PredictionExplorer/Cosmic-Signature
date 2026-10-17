### Testing Cosmic Signature DAO With the Tally App

todo-2 This doc is yet to be improved and finished.

#### Introduction

This document provides guidance on how to deploy contracts to Arbitrum Sepolia and use the Tally app to change `CharityWallet.charityAddress`.

The Tally UI steps below are historical integration notes, not a verified description of its current interface or compatibility. The contract-level procedure is authoritative: obtain sufficient delegated CST, propose the target call, wait until the proposal is Active, vote, wait until it is Succeeded, and execute. `CharityWallet` must be owned by the Governor before execution. Changing the Game implementation does not change ownership of this separate wallet.

I have provided a similar unit test in `${workspaceFolder}/test/tests-src/CosmicSignatureDao.js`. There is also a test in there that changes `MarketingWallet.treasurerAddress`.

My relevant ChatGPT chat is located at https://chatgpt.com/share/e/68d2db25-db18-800d-b095-d2fd1cd25480 .

#### Deploying the Contracts And Seeding Them With CST

- Hack the DAO contract configuration to make durations shorter. Open `${workspaceFolder}/contracts/production/libraries/CosmicSignatureConstants.sol` and change `DAO_DEFAULT_VOTING_DELAY` and `DAO_DEFAULT_VOTING_PERIOD` to something like 1 and 3 minutes respectively.

- Execute live blockchain tests to deploy contracts to Arbitrum Sepolia and play the game. Before executing the script, change the live blockchain tests configuration to access Arbitrum Sepolia. See `${workspaceFolder}/live-blockchain-testing/docs/live-blockchain-tests.md` for details. Check the resulting CST balances rather than assuming that every bid rewards its sender: V3 rewards the previous bidder, and the first bid produces no Participation CST. The proposer needs at least the current `proposalThreshold()` in delegated weight, not merely an undelegated token balance.

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

- The original integration attempt stopped when Tally could not fetch the registered Governor. The cause was not established; this is not evidence that Tally currently lacks OpenZeppelin 5 support or that the contract needs a legacy signature overload. Check current integration support independently. The contract operations below can also be performed directly with the Governor ABI and a compatible wallet or script.

- So further steps are theoretical for now. I haven't done them myself.

- Reconnect MetaMask as the bidder1 account.

- Delegate bidder1 votes to itself. Wait for the checkpoint to precede the proposal transaction's timestamp: the Governor checks proposer weight at `clock() - 1`.

- On bahalf of bidder1, create a proposal to change `CharityWallet.charityAddress` to some address. `CharityWallet` address is found in the same report file.

- Reconnect MetaMask as the bidder2 account.

- Delegate bidder2 votes to itself before the proposal's snapshot timestamp. Voting weight is fixed at that snapshot; delegation after it does not increase weight for this proposal.

- Wait until `state(proposalId)` is Active. With the token's timestamp clock, the active period begins strictly after `proposalSnapshot(proposalId)`.

- Vote for the proposal.

- On ArbiScan.io, connect MetaMask as the owner account.

- Call `CharityWallet.transferOwnership` to transfer ownership to the DAO contract address.

- On Tally.xyz, reconnect MetaMask as the owner account.

- Wait until `state(proposalId)` is Succeeded, strictly after the proposal deadline. For votes must exceed Against, and For plus Abstain must reach quorum (3% of snapshot supply by default). This Governor has no separate timelock or queue step.

- Execute the proposal.

- Observe that `CharityWallet.charityAddress` has changed.

- You can try some actions that will fail. The existing unit test tries most, if not all of these.

	- Create a proposal from any account whose delegated weight at the checked timestamp is below the current proposal threshold. Ownership alone does not grant proposal weight.

	- Vote before voting delay ends.

	- Vote after voting period ends.

	- Execute the proposal before voting period ends.

	- Attempt to execute when total For plus Abstain weight is below quorum. Voting with zero or insufficient weight is allowed; the unsuccessful proposal cannot execute.

	- Attempt to execute when total For weight does not exceed Against. A single Against vote does not necessarily defeat a proposal if other accounts supply enough For weight.

#### Afterwards

- See the same named section in `${workspaceFolder}/live-blockchain-testing/docs/live-blockchain-tests.md`.
