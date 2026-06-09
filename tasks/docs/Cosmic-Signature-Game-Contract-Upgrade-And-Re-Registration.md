### Cosmic Signature Game Contract Upgrade And Re-Registration

#### Introduction

This is a guide on how to upgrade and re-register the Cosmic Signature Game contract.

Review `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. Assuming you have completed the steps outlined there.

The same blockchains are supported.

#### Validate the deployed and to be deployed contracts

Review, possibly edit, and then execute `${workspaceFolder}/slither/slither-check-upgradeability-*.bash`. See a document in the same folder.

#### Create API Keys

See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

#### Create Blockchain Accounts

Assuming you still have the accounts outlined in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. It's OK if you changed the game contarct owner after the deployment.

#### Edit Configuration Files

- `../config/deploy-cosmic-signature-contracts-config-<network-name>.json`\
Make sure `deployerPrivateKey` matches the current contract owner. But leave it empty for the testnet or mainnet.

- `../config/upgrade-cosmic-signature-game-config-<network-name>-<cosmic-signature-game-contract-name>.json`\
It's unlikely that you need to edit it (but review the Caveats section).\
The production config files and scripts contain the words `arbitrumOne` and `CosmicSignatureGameV2` (or V3+ when upgrading to respective versions) in their names.

#### Create Hardhat Configuration Variables

See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.
Make sure `deployerPrivateKey_<network-name>` matches the current contract owner (unless you provided it in the config file).

#### One More Thing

- Make sure the report file created during the initial V1 deployment still exists.

- Only if you are dealing with a mainnet or a testnet, make sure the `.openzeppelin` subfolder still exists.

- `CosmicSignatureGameV2` requires that at least 1 round has already completed. So, when testing things, before upgrading, you must place a bid and claim the main prize.

#### Run Scripts

- Execute `../runners/run-upgrade-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will upgrade the game contract.

- Observe the newly created `../output/upgrade-cosmic-signature-game-report-<network-name>-<cosmic-signature-game-contract-name>.json` file. It contains the newly deployed implementation contract address. Save it outside the Git repo, but leave the original in-place, so that other scripts could use it. In fact, the current logic only checks that the file does not exist yet. It's not used near Comment-202606198.

- Only if you are dealing with a mainnet or a testnet, execute `../runners/run-register-upgraded-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will verify and register the source code of the previously deployed game contract implementation on ArbiScan.

- Only if you are dealing with a mainnet or a testnet, on ArbiScan, examine the proxy and implementation contract addresses. Make sure the evidence of the re-registration is there.

#### Caveats

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

- You might want to test the initial deployment of all contracts and then upgrading the game contract to `CosmicSignatureGameV2` and then to `CosmicSignatureGameOpenBid`. This is just for a test. It would be incorrect to do it in the production, event if `CosmicSignatureGameOpenBid` was a real useful contract. See Comment-202606084 and Comment-202606126 for details.\
OpenZeppelin would actually disallow the upgrade from `CosmicSignatureGameV2` to `CosmicSignatureGameOpenBid`. Storage check would fail. Therefore, in `upgrade-cosmic-signature-game-config-<network-name>-CosmicSignatureGameOpenBid.json` you must temporarily set `unsafeSkipStorageCheck` to `true`.

- I made 2 changes in V1's `CosmicSignatureGameStorage`.\
(1) I renamed `cstRewardAmountForBidding` to `bidCstRewardAmount` (which I further renamed in V2).\
(2) I reduced `__gap_persistent` size, because OpenZeppelin's upgradeable contract validator was crashing due to overflow. The change broke nothing, because the given storage variable is the last.\
The old state of affairs still exist in `.openzeppelin`. Therefore OpenZeppelin's upgradeable contract validator would complain. To silence it, before making the production upgrade, in `../config/upgrade-cosmic-signature-game-config-arbitrumOne-CosmicSignatureGameV2.json`, temporarily set `unsafeAllowRenames` and `unsafeSkipStorageCheck` to `true`.

#### Afterwards

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.
