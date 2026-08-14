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

- Make sure the report file created during the initial V1 deployment still exists.\
[Comment-202608126] If it doesn't (e.g. you are running from a different machine), provide the game proxy address in the `cosmicSignatureGameProxyAddress` parameter of `../config/upgrade-cosmic-signature-game-config-<network-name>-<cosmic-signature-game-contract-name>.json`. The production Arbitrum One V3 config already contains it.

- Only if you are dealing with a mainnet or a testnet, make sure the `.openzeppelin` subfolder still exists.\
[Comment-202608127] If it doesn't, set the `existingCosmicSignatureGameContractName` parameter in the same config file to the name of the currently deployed contract version (e.g. `CosmicSignatureGameV2`). The upgrade task will then reconstruct the OpenZeppelin network manifest with `forceImport` before upgrading. The production Arbitrum One V3 config already contains it.

- `CosmicSignatureGameV2` requires that `CosmicSignatureGame` was deployed first and at least 1 bidding round has already completed. So, when testing things, before upgrading, you must place a bid and claim the main prize.

- The upgrade transaction will revert unless the current bidding round is inactive (`_authorizeUpgrade` requires `block.timestamp < roundActivationTime`). On the mainnet, that is the case during the `delayDurationBeforeRoundActivation` window (about 1 hour by default) that starts when a round's main prize gets claimed, and lasts until the next round activates. Plan the upgrade for that window; if the window is too short, first extend it by calling `setRoundActivationTime` (allowed while the round is inactive or before the first bid of the round).

#### Rehearse On A Fork (Recommended)

Before upgrading a mainnet, rehearse the exact upgrade on an in-process fork of that mainnet. This needs no private keys and sends no live transactions:

- Execute `../runners/run-fork-rehearse-cosmic-signature-game-v3-upgrade-arbitrumOne.bash` (Comment-202608128).

It validates V2 -> V3 storage layout compatibility with the OpenZeppelin Upgrades plugin, impersonates the owner, performs `upgradeToAndCall` + `reinitialize` against the forked production proxy, verifies that every carried-over storage value is unchanged (and that the values `reinitialize` intentionally overwrites get the expected defaults), checks the retired setters and validations, and smoke-tests bidding and main prize claiming on the upgraded fork. It must end with "SUCCESS. All rehearsal checks passed."

#### Run Scripts

- Execute `../runners/run-upgrade-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will upgrade the game contract.

- Observe the newly created `../output/upgrade-cosmic-signature-game-report-<network-name>-<cosmic-signature-game-contract-name>.json` file. It contains the newly deployed implementation contract address. Save it outside the Git repo, but leave the original in-place, so that other scripts could use it. In fact, the current logic only checks that the file does not exist yet. It's not used near Comment-202606198.

- Only if you are dealing with a mainnet or a testnet, execute `../runners/run-register-upgraded-cosmic-signature-game-<network-name>-<cosmic-signature-game-contract-name>.bash`. It will verify and register the source code of the previously deployed game contract implementation on ArbiScan.

- Only if you are dealing with a mainnet or a testnet, on ArbiScan, examine the proxy and implementation contract addresses. Make sure the evidence of the re-registration is there.

#### Caveats

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.

- You might want to test the initial deployment of all contracts and then upgrading the game contract to `CosmicSignatureGameV2`, `CosmicSignatureGameV3`, ..., and then to `CosmicSignatureGameOpenBid`. This is just for a test. It would be incorrect to do it in the production, even if `CosmicSignatureGameOpenBid` was a real useful contract. See Comment-202606084 and Comment-202606126 for details.\
OpenZeppelin would actually disallow the upgrade from V2+ to `CosmicSignatureGameOpenBid`. Storage check would fail. Therefore, in `upgrade-cosmic-signature-game-config-<network-name>-CosmicSignatureGameOpenBid.json` you must temporarily set `unsafeSkipStorageCheck` to `true`.

- When developing V2, I made 2 changes in V1's `CosmicSignatureGameStorage`.\
(1) I renamed `cstRewardAmountForBidding` to `bidCstRewardAmount` (which I further renamed in V2).\
(2) I reduced `__gap_persistent` length a few orders of magnitude, because OpenZeppelin's upgradeable contract validation logic executed by `upgradeProxy` was crashing due to an overflow. But storage layout remains compatible because the given storage variable is the last. Testing with `CosmicSignatureGameOpenBid` has not run into this case because it added a storage variable after the gap (which is actually a violation of Comment-202412148).\
The problem is that the initially deployed `CosmicSignatureGame` ABI still exists in the tracking info stored in `.openzeppelin`. Therefore, when upgrading to V2 in the production, OpenZeppelin's upgradeable contract validation logic will complain. To silence it, before upgrading, in `../config/upgrade-cosmic-signature-game-config-arbitrumOne-CosmicSignatureGameV2.json`, temporarily set `unsafeAllowRenames` and `unsafeSkipStorageCheck` to `true`.

#### V3 Specifics (2026-08)

- No unsafe OpenZeppelin flags are needed for the V2 -> V3 upgrade (`unsafeAllowRenames` and `unsafeSkipStorageCheck` stay `false`): V3 only appends storage variables.

- `reinitialize` (the `upgradeToAndCall` payload) sets the 6 new V3 parameters and overwrites 7 existing values: `cstDutchAuctionBeginningBidPriceMinLimit` (200 CST -> 1 CST), `bidCstRewardAmountMultiplier` (repurposed for the V3 linear bid CST reward), and the five ETH prize percentages (20% main, 5% charity, 5% bidder raffles, 5% CS NFT stakers, 15% Chrono Warrior). Those prize percentages total 50%, leaving the other 50% in the game as rollover. See `docs/v3-vs-v2-changes.md`.

- After the upgrade, notify the web site / indexer team:
	- `MainPrizeClaimed` has a new signature (its topic0 hash changed).
	- `BidPlaced` keeps its topic0, but the 7th data field is now the reward minted to the PREVIOUS bidder (0 on the first bid of a round), and the 8th is `cstBidPriceDeclineMultiplier` (was `cstDutchAuctionDuration`).
	- `setCstDutchAuctionDuration` and `setCstDutchAuctionDurationChangeDivisor` now always revert with `NotImplemented`.
	- Bids can newly revert with `BidPlacedWithinCurrentSecond` (same-second throttle); frontends should not display a bid CST reward quote before the first bid of a round (the getter returns 0).
	- Update any hardcoded prize copy to the 20%/5%/5%/5%/15% V3 allocation; the existing percentage getters expose the post-upgrade values and the raffle count remains 3.

- Post-upgrade sanity reads (e.g. on ArbiScan): `mainPrizeNumCosmicSignatureNfts()` = 3, `cstBidPriceDeclineMultiplierChangeDivisor()` = 100, `roundLateBidPricePremiumAmountExponent()` = 8, `mainEthPrizeAmountPercentage()` = 20, `charityEthDonationAmountPercentage()` = 5, `raffleTotalEthPrizeAmountForBiddersPercentage()` = 5, `cosmicSignatureNftStakingTotalEthRewardAmountPercentage()` = 5, `chronoWarriorEthPrizeAmountPercentage()` = 15, `numRaffleEthPrizesForBidders()` = 3, and the ERC-1967 implementation slot points at the newly reported implementation address.

#### Afterwards

- Revert any temporary edits you made in files.

- See respective section in `Cosmic-Signature-Contracts-Deployment-And-Registration.md`.
