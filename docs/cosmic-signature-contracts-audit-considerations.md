### Cosmic Signature Contracts Audit Considerations

#### Files and Docs to Review

We recommned reviewing all files seen in this project, including, but not limited to:\
`./numbered-comments.md`,\
`${workspaceFolder}/README.md`,\
`./cosmic-signature-contracts-class-diagram-and-calls.svg`,\
`./cosmic-signature-contracts-functional-requirements.md`,\
`${workspaceFolder}/tasks/docs/*.md`.

#### Contracts to Audit

Only contracts in the `${workspaceFolder}/contracts/production` folder, except `RandomWalkNFT` and its interface are to be audited. Those are to be deployed. `RandomWalkNFT` has already been deployed, while contracts in other folders are used only for testing. Feel free to take a look at them as well, especially if you are going to review tests.

#### Tests and Solidity Coverage

Test and Solidity coverage scripts are located in the `${workspaceFolder}/test/runners` folder. For Solidity coverage notes, see Comment-202505289.

Some tests test exact timings of actions. They can fail if the system is under stress.

We have achieved 100% Solidity coverage, except the `BiddingBase._onlyRoundIsActive` modifier, because it's never called. `RandomWalkNFT` is not 100% covered either because it's essentially a third party contract from another project.

Because some tests are driven by random numbers, occasionally you can observe some code locations not covered or a signer running out of gas.

If you observe a test failure or some parts of the codebase not covered, execute the test/coverage script again.

#### Benevolent Owner

We assume that the contract owner is not malicious. One implication is that we assume that they will not upgrade the Game contract to one doing anything malicious, such as stealing assets held in `PrizesWallet`. ToDo-202507148-1 relates.

#### Other Important Notes

There may be some comments in the project that are intended to be read by the auditor. To find them, perform a global search for `audit` (not whole word, case insensitive). Actually I have deleted most, if not all of them.
