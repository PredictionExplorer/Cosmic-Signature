### Cosmic Signature Contracts Audit Considerations

#### Files and Docs to Review

We recommend reviewing all files seen in this project, including, but not limited to:\
`./numbered-comments.md`,\
`${workspaceFolder}/README.md`,\
`./cosmic-signature-contracts-class-diagram-and-calls.svg`,\
`./cosmic-signature-contracts-functional-requirements.md`,\
`${workspaceFolder}/tasks/docs/*.md`.

The `.svg` class diagram and its `.dia` source depict the original V1 inheritance and call relationships. Further versions are similar in general, however their inheritance hierarchy is more complex: some later version contracts inherit their earlier version counterparts.

The files under `certora/` are historical work; their reported results do not establish verification of this release.

#### Contracts to Audit

- The production sources are in `${workspaceFolder}/contracts/production`. That directory includes several versions, shared contracts, libraries, and interfaces; it is not a list of contracts to redeploy for every upgrade. `RandomWalkNFT` and its interface represent an external collection integration. Test contracts and the OpenBid prototype are not production deployment targets.

- We have now deployed the contracts and then upgraded the `CosmicSignatureGame` contract a few times. If a new audit is going to be conducted, only the latest `CosmicSignatureGame` contract version is to be audited. It reuses some parts from older versions. An auditor might want to also review other contracts that the Game contract touches; they have already been audited and deployed and some of them cannot be replaced.

#### Hardhat Tests and Solidity Coverage

To run Hardhat tests, `cd` to the project root folder and run `npm run hardhat-test-full`.\
The same in the Solidity coverage mode `npm run hardhat-coverage`.

Hardhat test and Solidity coverage scripts are located in the `${workspaceFolder}/test/runners` folder. For Solidity coverage notes, see Comment-202505289.

We have achieved 100% Solidity coverage, except the `BiddingCommon._onlyRoundIsActive` modifier, as well as its counterpart in later versions, because they are not called. `RandomWalkNFT` is not 100% covered either because it's essentially a third party contract from another project.

`BiddingCommonV2._onlyNonFirstRound` and `CosmicSignatureGameV2Base._onlyIfPrevVersionWasInitialized`, as well as its counterpart in later versions, do nothing when asserts are disabled. Despite of them being called and covered, we have observed that for some reason they are flagged as not fully covered.

Because some tests are driven by random numbers, occasionally you can observe some code locations not covered or a signer running out of gas.

Some tests test the exact timings of actions. They can fail, more likely if the system is under stress.

In case a test fails, send the whole test suite log to us to investigate. In case some code locations not covered or a test fails, run the test suite again.

#### Benevolent Owner

We assume that the contract owner is not malicious. One implication is that we assume that they will not upgrade the Game contract to one doing anything malicious, such as stealing assets held in `PrizesWallet`.

#### Other Important Notes

There may be some comments in the project that are intended to be read by the auditor. To find them, perform a global search for `audit` (not whole word, case insensitive). Actually I have deleted most, if not all of them.
