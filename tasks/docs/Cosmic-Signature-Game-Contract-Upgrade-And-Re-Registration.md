### Cosmic Signature Game Contract Upgrade And Re-Registration

#### Introduction

This is a guide on how to upgrade and re-register the Cosmic Signature Game contract.

Review `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. Assuming you have completed the steps outlined there.

The same blockchains are supported.

#### Make Copies of Old Files

- Switch to the Git branch you used when deploying or upgrading to the previous version of the contract and copy `../output/` and `../runners/.openzeppelin/` to a folder outside the Git repo. If those folders were never committed, take them from the backup copy you made after the previous deployment; the upgrade task reads the proxy address from the deployment report, and OpenZeppelin validates the new implementation against the manifest.

- Switch back to the `main` branch.

#### Before You Make Any Changes in the Project

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

#### Add Old Files

- Move the copies back to `../output/` and `../runners/.openzeppelin/` in the new branch.

#### Validate the Deployed and to be Deployed Contracts

- Review, possibly edit, and then execute `${workspaceFolder}/slither/slither-check-upgradeability-*.bash`. In fact, it's a lousy tool that will likely report errors. See a document in the same folder.

#### Create API Keys

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

#### Create Blockchain Accounts

- Assuming you still have the accounts discussed in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. It's OK if you changed the game contract owner after the deployment.

#### Edit Configuration Files

- `../config/deploy-cosmic-signature-contracts-config-<network-name>.json`\
Make sure `deployerPrivateKey` matches the current contract owner. But leave it empty for the testnet or mainnet.

- `../config/upgrade-cosmic-signature-game-config-<network-name>-<cosmic-signature-game-contract-name>.json`\
It's unlikely that you need to edit it (but review the Caveats section).\
The production config files and scripts contain the words `arbitrumOne` and `CosmicSignatureGameV2` (or V3+ when upgrading to respective versions) in their names.

#### Create Hardhat Configuration Variables

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. Make sure `deployerPrivateKey_<network-name>` matches the current contract owner (unless you provided it in the config file).

#### When Testing

- `CosmicSignatureGameV2` requires that `CosmicSignatureGame` was deployed first and at least 1 bidding round has already completed. So, when testing things, before upgrading, you must place a bid and claim the main prize.

#### Run Scripts

- Execute `../runners/run-upgrade-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will upgrade the game contract.

- Observe the newly created `../output/upgrade-cosmic-signature-game-report-<network-name>-<cosmic-signature-game-contract-name>.json` file. It contains the newly deployed implementation contract address. The upgrade task checks that its to-be-created report file does not exist yet. It does not access the previous version of the file near Comment-202606198. The file will be read by the registration task.

- Only if you are dealing with a mainnet or a testnet, execute `../runners/run-register-upgraded-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will verify and register the source code of the deployed game contract implementation on ArbiScan.

- Only if you are dealing with a mainnet or a testnet, on ArbiScan, examine the proxy and implementation contract addresses. Make sure the evidence of the re-registration is there. Review what variables the new contract's `reinitialize` method modified and confirm on ArbiScan that the variables have the expected values.

#### Caveats

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

- The upgrade transaction will revert unless the current bidding round is inactive. To increase the inactivity duration, while the current bidding round is active, increase `delayDurationBeforeRoundActivation`, and while no bid has been placed in the current bidding round yet, increase `roundActivationTime` by calling respective setters. Read `roundActivationTime()` immediately before upgrading.

- The contract upgrade configuration supports the `unsafeAllowRenames` and `unsafeSkipStorageCheck` params. Try to avoid setting any of them to `true`.

- You might want to test the initial deployment of all contracts and then upgrading the game contract to `CosmicSignatureGameV2`, `CosmicSignatureGameV3`, ..., and then to `CosmicSignatureGameOpenBid`. This is just for a test. It would be incorrect to upgrade to `CosmicSignatureGameOpenBid` after an arbitrary version in the production, even if it was a real useful contract. See Comment-202606084 and Comment-202606126 for details.\
OpenZeppelin would actually disallow the upgrade from V2+ to `CosmicSignatureGameOpenBid`. Storage check would fail. Therefore, in `upgrade-cosmic-signature-game-config-<network-name>-CosmicSignatureGameOpenBid.json` you must set `unsafeSkipStorageCheck` to `true`.

- When developing V2, I made 2 refactorings in V1's `CosmicSignatureGameStorage`.\
(1) I renamed `cstRewardAmountForBidding` to `bidCstRewardAmount` (which I further renamed in V2).\
(2) I reduced `__gap_persistent` length a few orders of magnitude, because OpenZeppelin's upgradeable contract validation logic executed by `HardhatRuntimeEnvironment.upgrades.upgradeProxy` was crashing due to an overflow. But storage layout remains compatible because the given storage variable is the last. Testing with `CosmicSignatureGameOpenBid` has not run into this case because it added a storage variable after the gap (which is actually a violation of Comment-202412148).\
The problem is that the initially deployed `CosmicSignatureGame` storage layout still exists in the tracking info stored in `../runners/.openzeppelin`. Therefore, when upgrading to V2 in the production, OpenZeppelin's upgradeable contract validation logic will complain. To silence it, before upgrading, make the following edits. In `../config/upgrade-cosmic-signature-game-config-arbitrumOne-CosmicSignatureGameV2.json`, set `unsafeSkipStorageCheck` to `true`. In `CosmicSignatureGameStorageV2Base`, near `bidCstRewardAmountMultiplier`, comment out `@custom:oz-renamed-from` and uncomment another that specifies `cstRewardAmountForBidding`.

- The above V1 to V2 instruction is historical. Do not replay it: with the current line order, uncommenting that annotation would place a commented-out annotation directly after an active one, which the NatSpec parser appends to the active tag's value.

- When developing V3, I made some refactorings in V2 that OpenZeppelin upgradeable contract validator would flag as incompatible. The committed sources acknowledge them with `@custom:oz-renamed-from` and `@custom:oz-retyped-from` annotations in `CosmicSignatureGameStorageV2Base` and `CosmicSignatureGameStorage`, which are active and validate both against the deployed V2 and in the tests' V1 to V2 to V3 chain. Do not comment out any of them, including the ones tagged with ToDo-202607169-1: the manifest records them on deployment, and the next upgrade's validation depends on them. The reasoning and the evidence are in `${workspaceFolder}/docs/cosmic-signature-game-upgrade-storage-annotations.md` and Comment-202611032.

#### Afterwards

- If necessary, restore `delayDurationBeforeRoundActivation` and/or change `roundActivationTime`.

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.
