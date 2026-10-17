### Cosmic Signature Contracts Audit Considerations

#### Files and Docs to Review

We recommend reviewing all files seen in this project, including, but not limited to:\
`./numbered-comments.md`,\
`${workspaceFolder}/README.md`,\
`./cosmic-signature-contracts-class-diagram-and-calls.svg`,\
`./cosmic-signature-contracts-functional-requirements.md`,\
`${workspaceFolder}/tasks/docs/*.md`.

The `.svg` class diagram and its `.dia` source depict the original V1 inheritance and call relationships. They omit the V2/V3 modules and are historical orientation aids, not the current architecture. Use `CosmicSignatureGameV3.sol` and its complete import and inheritance graph for V3. The files under `certora/` are also historical work; their reported results do not establish verification of this release.

#### Contracts to Audit

- The production sources are in `${workspaceFolder}/contracts/production`. That directory includes several versions, shared contracts, libraries, and interfaces; it is not a list of contracts to redeploy for every upgrade. `RandomWalkNFT` and its interface represent an external collection integration. Test contracts and the OpenBid prototype are not production deployment targets.

- For the V2-to-V3 upgrade, review the actual deployed V2 implementation and storage layout against the pinned V3 source, including every inherited module and library. Include the unchanged token, NFT, wallet, governance, and Random Walk integration contracts where V3 relies on their behavior. A `PrizesWallet` replacement is a separate deployment decision; upgrading the Game alone does not replace it.

#### Tests and Solidity Coverage

Test and Solidity coverage scripts are located in the `${workspaceFolder}/test/runners` folder. For Solidity coverage notes, see Comment-202505289.

Some tests test exact timings of actions. They can fail, more likely if the system is under stress.

Earlier work reported 100% coverage with exceptions for unused `_onlyRoundIsActive` modifiers and `RandomWalkNFT`. That is a historical observation, not a measured coverage figure for this revision. Record the exact commit, build flags, test profile, and generated coverage report before quoting a current percentage.

`BiddingCommonV2._onlyNonFirstRound` and `CosmicSignatureGameV2Base._onlyIfPrevVersionWasInitialized`, as well as the same things in further versions, do nothing when asserts are disabled. Despite of them being called and covered, we have observed that for some reason they are flagged as not fully covered.

Because some tests are driven by random numbers, occasionally you can observe some code locations not covered or a signer running out of gas.

Investigate a failure and retain its seed, configuration, and output before rerunning it. A later passing run does not by itself explain a timing or randomized failure.

Run `npm run hardhat-test-quick` from the repository root for the four build variants in `test/runners/test.bash`. `ENABLE_SMTCHECKER=1` in one of those variants preprocesses the SMTChecker alternatives; it does not run a proof. `npm run hardhat-coverage` is a separate instrumented run. The quick coverage wrapper intentionally provides less coverage than longer test profiles.

The V3 suites cover bidding, CST rewards, weighted selection, main-prize allocation, and storage. `CosmicSignatureGameV3-DeployedV2StorageLayout.js` compares the compiled V3 layout with a committed layout captured from the deployed V2 manifest. `CosmicSignatureGameV3-StorageLayout.js` exercises a local upgrade with carried state, and `PrizesWallet-Replacement.js` exercises old-wallet retrieval after replacement. These are not a fork of live Arbitrum state. The repository does not configure a mainnet fork rehearsal; such a rehearsal must separately pin an RPC block and use the actual deployed state and ownership.

#### Benevolent Owner

We assume that the contract owner is not malicious. One implication is that we assume that they will not upgrade the Game contract to one doing anything malicious, such as stealing assets held in `PrizesWallet`.

#### Other Important Notes

There may be some comments in the project that are intended to be read by the auditor. To find them, perform a global search for `audit` (not whole word, case insensitive). Actually I have deleted most, if not all of them.
