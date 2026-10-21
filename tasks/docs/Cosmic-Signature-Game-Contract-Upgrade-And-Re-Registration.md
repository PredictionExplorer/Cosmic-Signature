### Cosmic Signature Game Contract Upgrade And Re-Registration

#### Introduction

This is a guide on how to upgrade and re-register the Cosmic Signature Game contract.

Review `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. Assuming you have completed the steps outlined there.

The same blockchains are supported.

#### Make Copies of Old Files

- Switch to the Git branch you used when deploying or upgrading to the previous version of the contract and copy `../output/` and `../runners/.openzeppelin/` to a folder outside the Git repo.

- Switch back to the `main` branch (or whatever branch you will use for the upgrade).

#### Before You Make Any Changes in the Project

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

#### Add Old Files

- Move the copies back to `../output/` and `../runners/.openzeppelin/` in the new branch.\
  The upgrade task reads the proxy address from the deployment report, and OpenZeppelin validates the new implementation against the manifest.

#### Validate the Deployed and to be Deployed Contracts

- Review the applicable Slither upgradeability check script and run it from `slither/`. In fact, it's a lousy tool that will likely report errors. See its manual in the same folder.

#### Create API Keys

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

#### Create Blockchain Accounts

- Assuming you still have the accounts discussed in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. It's OK if you changed the game contract owner after the deployment.

#### Edit Configuration Files

- `../config/deploy-cosmic-signature-contracts-config-<network-name>.json`\
  Leave `deployerPrivateKey` empty for the testnet or mainnet. The temporary signing key supplied below must belong to the current contract owner.

- `../config/upgrade-cosmic-signature-game-config-<network-name>-<cosmic-signature-game-contract-name>.json`\
  It's unlikely that you need to edit it (but review the Caveats section).\
  The production config files and scripts contain the words `arbitrumOne` and `CosmicSignatureGameV2` (or V3+ when upgrading to respective versions) in their names.

#### Supply Credentials For This Terminal Session

- Follow the hidden-prompt environment instructions in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`. Make sure `HARDHAT_VAR_deployerPrivateKey_<network-name>` belongs to the current contract owner. Do not persist the key with `hardhat vars set` or place it in the configuration file.

#### When Testing

- `CosmicSignatureGameV2` requires that `CosmicSignatureGame` was deployed first and at least 1 bidding round has already completed. So, when testing things, before upgrading, you must place a bid and claim the main prize.

#### V2-to-V3 Release Checks

- Yuriy's comment. Taras'es AI agent has added this section. I normally try to keep things simple and not too verbose, but I stopped short of editing this one. Parts of it duplicate other instructions elewhere in this doc.

- Pin the V3 source commit and the deployed V2 proxy, implementation, chain ID, and observation block. Local V2 source has been refactored since deployment; comparing only two current source files is insufficient.

- Keep `newInitializerMethodName` set to `reinitialize`. The task passes it as `upgradeProxy`'s `call`, so the upgrade and initialization occur atomically. `reinitialize` is external without `onlyOwner`; omitting that atomic call leaves its one-time invocation available to another caller.

- The committed V3 configurations set both `unsafeAllowRenames` and `unsafeSkipStorageCheck` to `false`. Retain storage validation. The historical V1-to-V2 exception described below is not an instruction to bypass validation for V3.

- Review the assignments in `CosmicSignatureGameV3.reinitialize`: it overwrites the CST beginning-price floor, the reward multiplier, and five ETH allocation percentages as well as initializing the six new V3 storage values. Other existing configuration is carried forward; current source defaults do not describe every live value.

- Run `npm run hardhat-test-quick` from the repository root. In particular, review the `CosmicSignatureGameV3-DeployedV2StorageLayout`, `CosmicSignatureGameV3-StorageLayout`, and `CosmicSignatureGame-All-Versions-Upgrade` suites. The first uses a committed deployed-V2 layout, not a live fork; the second upgrades local fixtures. No mainnet-fork rehearsal is configured by these scripts.

- Before submitting the real upgrade, separately rehearse the intended transaction against a pinned Arbitrum fork with the actual proxy state and owner. The ordinary localhost runner starts an empty local chain and does not perform this rehearsal automatically.

#### Run Scripts

- Execute `../runners/run-upgrade-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will upgrade the game contract.

- Observe the newly created `../output/upgrade-cosmic-signature-game-report-<network-name>-<cosmic-signature-game-contract-name>.json` file. It contains the newly deployed implementation contract address. The upgrade task checks that its to-be-created report file does not exist yet. It does not access the previous version of the file near Comment-202606198. The file will be read by the registration task.

- Only if you are dealing with a mainnet or a testnet, execute `../runners/run-register-upgraded-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will verify and register the source code of the deployed game contract implementation on ArbiScan.

- Only if you are dealing with a mainnet or a testnet, on ArbiScan, examine the proxy and implementation contract addresses. Make sure the evidence of the re-registration is there. Review what variables the new contract's `reinitialize` method modified and confirm on ArbiScan that the variables have the expected values.

#### Caveats

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

- The upgrade is restricted to only the owner and requires the current bidding round to be inactive (`block.timestamp < roundActivationTime`). To increase the inactivity duration, while the current bidding round is active, increase `delayDurationBeforeRoundActivation`, and while no bid has been placed in the current bidding round yet, increase `roundActivationTime` by calling respective setters. Confirm on ArbiScan that in the proxy contarct the variable value has changed.

- The contract upgrade configuration supports the `unsafeAllowRenames` and `unsafeSkipStorageCheck` params. But avoid setting any of them to `true`.

- You might want to test the initial deployment of all contracts and then upgrading the game contract to `CosmicSignatureGameV2`, `CosmicSignatureGameV3`, ..., and then to `CosmicSignatureGameOpenBid`. This is just for a test. It would be incorrect to upgrade to `CosmicSignatureGameOpenBid` after an arbitrary version in the production, even if it was a real useful contract. See Comment-202606084 and Comment-202606126 for details.\
  OpenZeppelin would actually disallow the upgrade from V2+ to `CosmicSignatureGameOpenBid`. Storage check would fail. Therefore, in `upgrade-cosmic-signature-game-config-<network-name>-CosmicSignatureGameOpenBid.json` you must set `unsafeSkipStorageCheck` to `true`.

- This instruction is historical. It's not necessarily appropriate in the current codebase.\
  When developing V2, I made 2 refactorings in V1's `CosmicSignatureGameStorage`.\
  (1) I renamed `cstRewardAmountForBidding` to `bidCstRewardAmount` (which I further renamed in V2).\
  (2) I reduced `__gap_persistent` length a few orders of magnitude, because OpenZeppelin's upgradeable contract validation logic executed by `HardhatRuntimeEnvironment.upgrades.upgradeProxy` was crashing due to an overflow. But storage layout remains compatible because the given storage variable is the last. Testing with `CosmicSignatureGameOpenBid` has not run into this case because it added a storage variable after the gap (which is actually a violation of Comment-202412148).\
  The problem is that the initially deployed `CosmicSignatureGame` storage layout still exists in the tracking info stored in `../runners/.openzeppelin`. Therefore, when upgrading to V2 in the production, OpenZeppelin's upgradeable contract validation logic will complain. To silence it, before upgrading, make the following edits. In `../config/upgrade-cosmic-signature-game-config-arbitrumOne-CosmicSignatureGameV2.json`, set `unsafeSkipStorageCheck` to `true`. In `CosmicSignatureGameStorageV2Base`, near `bidCstRewardAmountMultiplier`, comment out `@custom:oz-renamed-from` and uncomment another that specifies `cstRewardAmountForBidding`.

#### Afterwards

- If necessary, restore `delayDurationBeforeRoundActivation` and/or change `roundActivationTime`.

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.
