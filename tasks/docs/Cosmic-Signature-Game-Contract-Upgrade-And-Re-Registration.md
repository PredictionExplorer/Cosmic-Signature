### Cosmic Signature Game Contract Upgrade And Re-Registration

#### Introduction

This is a guide on how to upgrade and re-register the Cosmic Signature Game contract.

Review "Cosmic-Signature-Contracts-Deployment-And-Registration.md". Assuming you have completed the steps outlined there. Make sure the report file that was created then still exists.

The same blockchains are supported, except currently involved scripts will not work for Arbitrum One.

#### Validate the deployed and to be deployed contracts

Review, possibly edit, and then execute "${workspaceFolder}/slither/slither-check-upgradeability-1.bash". See a document in the same folder.

#### Create API Keys

See "Cosmic-Signature-Contracts-Deployment-And-Registration.md".

#### Create Blockchain Accounts

Assuming you still have the accounts outlined in "Cosmic-Signature-Contracts-Deployment-And-Registration.md". It's OK if you changed the game contarct owner after the deployment.

#### Edit Configuration Files

- "../config/deploy-cosmic-signature-contracts-config-&lt;network_name&gt;.json"\
Make sure `deployerPrivateKey` matches the current contract owner. But leave it empty for the testnet or mainnet.

- "../config/upgrade-cosmic-signature-game-config-&lt;network_name&gt;.json"\
It's unlikely that you need to edit it.\
In the local blockchain and testnet version of the file, `newCosmicSignatureGameContractName` points at a prototype contract that is not to be used in the producion. In the mainnet version, it points at a currently non-existent contract.

#### Create Hardhat Configuration Variables

See "Cosmic-Signature-Contracts-Deployment-And-Registration.md".
Make sure `deployerPrivateKey_<network_name>` matches the current contract owner (unless you provided it in the config file).

#### One More Thing

- Only if you are dealing with a mainnet or a testnet, move the ".openzeppelin" subfolder back to under "../runners/".

#### Run Scripts

- Execute "../runners/run-upgrade-cosmic-signature-game-&lt;network_name&gt;.bash". It will upgrade the game contract.

- Observe the newly created "../output/upgrade-cosmic-signature-game-report-&lt;network_name&gt;.json" file. It contains the newly deployed implementation contract address. Save it to a more reliable location, but leave the original in-place, so that other scripts could use it.

- Only if you are dealing with a mainnet or a testnet, execute "../runners/run-register-upgraded-cosmic-signature-game-&lt;network_name&gt;.bash". It will verify and register the source code of the previously deployed game contract implementation on ArbiScan.

- Only if you are dealing with a mainnet or a testnet, on ArbiScan, examine the proxy and implementation contract addresses. Make sure the evidence of the re-registration is there.

#### Caveats

See "Cosmic-Signature-Contracts-Deployment-And-Registration.md".

#### Afterwards

See "Cosmic-Signature-Contracts-Deployment-And-Registration.md".
