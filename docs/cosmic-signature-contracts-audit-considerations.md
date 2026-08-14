### Cosmic Signature Contracts Audit Considerations

#### Files and Docs to Review

We recommned reviewing all files seen in this project, including, but not limited to:\
`./numbered-comments.md`,\
`${workspaceFolder}/README.md`,\
`./cosmic-signature-contracts-class-diagram-and-calls.svg`,\
`./cosmic-signature-contracts-functional-requirements.md`,\
`${workspaceFolder}/tasks/docs/*.md`.

#### Contracts to Audit

- Only contracts in the `${workspaceFolder}/contracts/production` folder, except `RandomWalkNFT` and its interface are to be audited. Those are to be deployed. `RandomWalkNFT` was deployed a few years ago, while contracts in other folders are used only for testing. Feel free to take a look at them as well, especially if you are going to review tests.

- Update. We have now deployed all the contracts and then upgraded the `CosmicSignatureGame` contract a few times. If a new audit is going to be conducted, only the latest `CosmicSignatureGame` contract version is to be audited. It reuses some parts from older versions.

#### Tests and Solidity Coverage

Test and Solidity coverage scripts are located in the `${workspaceFolder}/test/runners` folder. For Solidity coverage notes, see Comment-202505289.

Some tests test exact timings of actions. They can fail, more likely if the system is under stress.

We have achieved 100% Solidity coverage, except the `BiddingCommon._onlyRoundIsActive` modifier, as well as the same thing in further versions, because they are not called. `RandomWalkNFT` is not 100% covered either because it's essentially a third party contract from another project.

`BiddingCommonV2._onlyNonFirstRound` and `CosmicSignatureGameV2._onlyIfPrevVersionWasInitialized`, as well as the same things in further versions, do nothing when asserts are disabled. Despite of them being called and covered, we have observed that for some reason they are flagged as not fully covered.

Because some tests are driven by random numbers, occasionally you can observe some code locations not covered or a signer running out of gas.

If you observe a test failure due to one of the above listed reasons or some unexpected parts of the codebase not covered, execute the test/coverage script again.

#### V3 Reinitializer Findings

The 2026-08 V3 security review identified 2 medium-severity upgrade-path risks. We are documenting and testing them,
but leaving the production contracts unchanged pending the developer's decision because Comment-202606128
deliberately omits `onlyOwner` under the assumption that the upgrade and reinitializer call are atomic.

1. `CosmicSignatureGameV2.reinitialize` and `CosmicSignatureGameV3.reinitialize` are permissionless.
   If an owner performed a bare implementation upgrade without bundling `reinitialize` in the same transaction,
   another account could call the one-shot reinitializer first and reset the version's economic parameters.
   The production upgrade task mitigates this by always using `upgradeProxy` with `call: "reinitialize"`.
   Tests cover both sides: after the standard atomic upgrade, owner and non-owner reinitializer calls revert
   `InvalidInitialization`; after a deliberately bare test upgrade, a non-owner can initialize once.

2. `_checkIfPrevVersionWasInitialized` only asserts in assert-enabled builds. In production builds its
   `InvalidInitialization` revert is commented out, so an operationally incorrect V1 -> V3 jump can skip V2's
   reinitializer. `CosmicSignatureGameV3-GuardsAndMisconfig.js` explicitly characterizes the assert and production
   behaviors.

Operational requirement: always execute upgrades through the checked-in upgrade task/runbook, which bundles
`upgradeToAndCall` and `reinitialize`, and never perform a bare UUPS implementation upgrade.

#### Benevolent Owner

We assume that the contract owner is not malicious. One implication is that we assume that they will not upgrade the Game contract to one doing anything malicious, such as stealing assets held in `PrizesWallet`.

#### Other Important Notes

There may be some comments in the project that are intended to be read by the auditor. To find them, perform a global search for `audit` (not whole word, case insensitive). Actually I have deleted most, if not all of them.
