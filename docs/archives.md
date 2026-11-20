# Contract Archives

Hardhat tests will use archived builds to replay the deployment and upgrade sequence on a local network. This lets the V4 development branch keep the current Solidity sources while archive branches preserve the old contracts and their tests.

## Archive Branches and Deployment Order

The first eight digits of each branch name are the date of its base commit (`YYYYMMDD`). Each archive has a unique date. Tests process the archives in ascending date order.

| Game version | Archive branch | Base commit | Game implementation on Arbitrum One |
| --- | --- | --- | --- |
| V1 | `20260505-v1-archive` | `3f166f4fab71` | `0x7739148013777c485AD9f3d971e1005Eca686661` |
| V2 | `20260625-CosmicSignatureGameV2-archive` | `3f52eaaf2258` | `0x50eB3d05d2C463949DE9238D419385594f7AdB97` |
| V3 | Planned from `20261109_v4` | To be selected | `0xc1b97E1b0baC86248653B18706dbC5c8898c5c06` |

A typical test starts by deploying all production and external contracts from the V1 archive, including `RandomWalkNFT`.

Each subsequent archive branch names the contract or contracts to deploy or upgrade at that step. For example, the V2 archive supplies `CosmicSignatureGameV2` for the upgrade of the existing game proxy. Tests keep using the previously deployed instances of every other contract, even if their source changed on the V2 branch. The planned sequence continues through archived V3 to V4 from the development branch. Some existing tests may still select other contracts from a later build.

## Selecting the Archive Commits

We downloaded the verified game implementation sources from ArbiScan into `temp/verified-source/{v1,v2,v3}/`. The `@arbitrum` and `@openzeppelin` sources were identical across all three downloads and have remained unchanged in the project since before V1 deployment.

For V1 and V2, we compared every downloaded file under `contracts/production/`, including subfolders, with the Git blob at the same path in each commit. All 48 files for each version had to match byte for byte. Several commits matched. For each archive branch we chose the newest match on the first-parent history of `main`, listed above.

Use the base commits above to reproduce the deployed V1 and V2 bytecode. We matched the sources. An on-chain bytecode comparison still requires the deployment compiler and settings. The archive tips also include renames for use in tests.

After selecting the base commits, we moved `RandomWalkNFT` and its interface to `contracts/external/` on both archive branches and the V4 development branch. We compiled each branch before and after the move with production Solc settings. The ABIs matched, and only compiler metadata differed in the creation and runtime bytecode.

Commits `4bf35d59` (V1) and `0e36ace6` (V2) aligned source and test names with the V4 development branch. Examples include `BiddingBase` becoming `BiddingCommon` and the V2 square-root reward constant becoming `DEFAULT_BID_CST_REWARD_AMOUNT_RADICAND_MULTIPLIER`. The CST bid argument is now named `cstPriceMaxLimit_` in the archive ABIs. Its type and position are unchanged.

Commits `6c92149c` (V1) and `88f5b549` (V2) aligned public names to simplify cross-version tests. These renames change selectors and executable bytecode. The V2 game and the OpenBid prototypes use `reinitialize()`. Both archives use `getDurationUntilMainPrize()` for the signed result and `getDurationUntilMainPrizeClamped()` for the old unsigned result. V1's fixed reward is called `bidCstRewardAmount`, with matching setter and event names.

In both archives, `roundStats(roundNum)` returns just the bid count. Read each address with `getBidderAddressAt`. The struct keeps the name `BidderAddresses` used by V3's OpenZeppelin storage annotation. V1 keeps `cstDutchAuctionDurationDivisor` because the stored value is a divisor. V2 stores a duration in seconds in that slot.

Commit `3e926da0` reduced archived V1's trailing `__gap_persistent` from the deployed `2^255` slots to `2^30`. V2 uses one slot for `cstDutchAuctionDurationChangeDivisor` and keeps the rest reserved. OpenZeppelin's default storage checks pass from archived V1 to archived V2 and from archived V2 to current V3.

## Storage Rename Annotations

V3's `roundStats` carries `@custom:oz-renamed-from bidderAddresses` so the deployed V2 layout can upgrade to it. OpenZeppelin Upgrades Core 1.44.2 also compares rename annotations when two layouts already use the same field name. Archived V2 and both archived copies of V1 therefore carry the same annotation on `roundStats`.

V2 renames `cstDutchAuctionDurationDivisor` to `cstDutchAuctionDuration` and `bidCstRewardAmount` to `bidCstRewardAmountMultiplier`. Both changes need annotations on V2. The V1 archive is deployed with `bidCstRewardAmount` already in place, so its former `cstRewardAmountForBidding` annotation was removed.

## Archive Maintenance

Commits `91d3d01a` (V1), `cd61244c` (V2), and `d9a0f10e` (development) exposed `npm run hardhat-clean` for all four build configurations. Both archives also provide `npm run hardhat-test-quick` and `npm run hardhat-test-full`. Quick mode sets `SKIP_LONG_TESTS=true` in V1 and `LONG_TEST_MODE_CODE=1` in V2. The npm commands run in batch mode (`-b`), stopping on the first failure and returning a nonzero exit code without a prompt.

Both archives mark their npm package private and exclude the root `cache/` and `artifacts/` folders from VS Code searches. The V1 storage comment explains why the archive uses a smaller gap than the deployed game. On the development branch, the README and V3 comparison clarify that the same team had already deployed `RandomWalkNFT`. The functional requirements also received heading capitalization edits.

## Building the Archives

Each snapshot lives in `archives/<archive-branch>/` on the development branch. It contains the complete `artifacts/<configuration>/` trees, including compiler build info, and only `cache/<configuration>/validations.json` from each cache. The four configurations are `production`, `debug-false-false`, `debug-true-false`, and `debug-true-true`.

1. Run `npm run hardhat-clean` on the development branch. Switch to the archive branch and run `npm ci` followed by `npm run hardhat-test-quick` from the project root.
2. Once all four builds pass, switch back to development. Git leaves the ignored root outputs in place. Copy the artifacts and validation files into the snapshot before cleaning.
3. Switch to the archive branch and run `npm run hardhat-clean`. Return to development, run `npm ci`, and commit the snapshot.

| Archive snapshot | Source commit | Quick tests passed per build |
| --- | --- | ---: |
| [V1](../archives/20260505-v1-archive/) | `5450e528` | 86 |
| [V2](../archives/20260625-CosmicSignatureGameV2-archive/) | `b6730805` | 109 |

For each configuration, the copied debug files resolve to the archived build info. OpenZeppelin validated both game implementations and the V1-to-V2 storage upgrade using the archived bytecode and validation files with its default safety checks.

## Archived Artifact Prototype

Commit `551489cd` on `prototype-archived-artifacts-upgrades` demonstrates the approach in `test/tests-src/CosmicSignatureGame-All-Versions-ArchivedArtifacts.js`. For this experiment, the same snapshot of `main` supplied both V1 and V2. V3 came from the active development branch.

We compiled all four configurations and copied their outputs into `archives/v2/`. For each of `production`, `debug-false-false`, `debug-true-false`, and `debug-true-true`, we kept the following files.

- `artifacts/<configuration>/` in full, including contract artifacts, debug files, and compiler build info.
- `cache/<configuration>/validations.json`, which contains OpenZeppelin's upgrade validation data for that build.

See [Compiling Cosmic Signature Contracts](../contracts-compiling/docs/contracts-compiling.md) for the build flags and folder naming (Comment-202503272).

The prototype test exercised one proxy through three versions.

1. Its fixture installed the archived `FakeArbSys` and `FakeArbGasInfo` bytecode at the local Arbitrum precompile addresses, deployed the V1 suite with `deployContractsAdvanced`, and froze the fixture result. It checked that `getTotalNumBids(0)` returned zero, then completed round zero with one bid.
2. It upgraded the proxy to archived V2 with `initializeV2`. The proxy address stayed the same, the implementation changed, and `getTotalNumBids` reported one bid in round zero and zero in round one.
3. It upgraded the same proxy to current-build V3 with `reinitialize`. It verified the new implementation, round number, historical bid count, and bidder address. It checked that V3's ABI omitted `getTotalNumBids`, then called the getter through the V2 ABI and observed the on-chain revert.

The test helper selected the archive configuration matching the active Hardhat artifacts path. It temporarily switched the Hardhat runtime environment's artifact manager and its artifact and cache paths, awaited the entire deployment or upgrade, and restored them in `finally`. Calls sharing that environment must run sequentially.

On first use, the helper created one Hardhat `Artifacts` instance and copied the selected `validations.json` to a private temporary cache. OpenZeppelin could lock or update that copy. The suite reused both resources and removed the temporary cache in its `after` hook. The regular UUPS `deployProxy` and `upgradeProxy` calls performed validation throughout. For the final upgrade, OpenZeppelin compared the archived V2 storage layout recorded in its network manifest with the current V3 layout.
