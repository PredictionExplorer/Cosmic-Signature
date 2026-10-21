### Cosmic Signature Contracts Deployment And Registration

#### Introduction

This is a guide on how to deploy and register the production Cosmic Signature contracts on local and live blockchains.

The following blockchains are supported: Hardhat Network (a local blockchain), Arbitrum Sepolia (a testnet), Arbitrum One (a mainnet).

All scripts assume that they are executed from the folder they are located in. So you must `cd` to the script's folder and execute the script like `./my-script.bash`.

Start with testing on Hardhat Network. You can start it by executing:

```bash
cd scripts
./hardhat-node.bash
```

#### Before You Make Any Changes in the Project

- Create a new Git branch and remember what commit you created it from. You can save the commit hash to a file.

#### Create API Keys

- If you are dealing with a testnet or mainnet, you need an EtherScan API key. It will work for all blockchains, including ArbiScan.\
  At some point, they switched to V2 of their API, so old API keys aren't necessarily going to work. So you might need to get a new one.

#### Create Blockchain Accounts

- If you are dealing with a local blockchain, skip this section. We will use existing accounts.

- Create a deployer account and transfer some ETH to it.

- You can postpone this step. Optionally, create a charity account. On a testnet, you can use your own account. On a mainnet, you might want to use an account belonging to a real charity.

#### Edit Configuration Files

- `../config/deploy-cosmic-signature-contracts-config-<network-name>.json`\
  These files are in the Git repo, so don't include any secrets in them.\
  For a local blockchain, it's OK to set `deployerPrivateKey` to a well known account private key. For a testnet or mainnet, leave it empty and supply the key through the temporary environment described below.\
  Set `randomWalkNftAddress` to where the contract has been deployed. If you leave it empty or zero, it will be deployed, which is typically the right thing to do on a local blockchain.\
  Set `charityAddress` to your charity address. Or leave it empty or zero and later set it by making a call to `CharityWallet`.\
  You probably don't need to change any other arguments.

#### Supply Credentials For This Terminal Session

Skip this section for a local blockchain. Do not save real private keys or API keys with `hardhat vars set`: Hardhat stores them in plaintext in a global file. Do not put credentials in JSON files, command arguments, shell startup files, or `.env` files.

Keep a secure backup of the account before funding it. Open a dedicated Bash session and enter credentials at hidden prompts. This Arbitrum One example keeps the literal values out of command history; use the `arbitrumSepolia` suffix instead for that network. The `HARDHAT_VAR_` names override Hardhat's stored variables when each process starts.

```bash
/bin/bash
set +x
unset DEBUG
trap 'unset HARDHAT_VAR_deployerPrivateKey_arbitrumOne HARDHAT_VAR_etherScanApiKey_arbitrumOne' EXIT
read -r -s -p 'Deployer private key: ' HARDHAT_VAR_deployerPrivateKey_arbitrumOne
printf '\n'
export HARDHAT_VAR_deployerPrivateKey_arbitrumOne
read -r -s -p 'Etherscan API key: ' HARDHAT_VAR_etherScanApiKey_arbitrumOne
printf '\n'
export HARDHAT_VAR_etherScanApiKey_arbitrumOne
```

Run the intended scripts in this same session, then `exit`. Never print these variables, use `hardhat vars get`, or enable shell tracing while credentials are loaded. Environment variables avoid a persistent credential file, but the running process and its children can read them; they are not an encrypted keystore. The current tasks use a software-wallet key. A hardware wallet or multisig requires a separate signer integration; never export a hardware wallet's recovery phrase for these scripts.

#### Run Scripts

- Execute `../runners/run-deploy-cosmic-signature-contracts-<network-name>.bash`. It will deploy all Cosmic Signature contracts.

- Observe the newly created `../output/deploy-cosmic-signature-contracts-report-<network-name>.json` file. It contains addresses of all deployed contracts. Other scripts are going to use it.

- After you deploy to a mainnet or a testnet, you will notice the `.openzeppelin` subfolder under the folder in which you ran the deployment scripts. OpenZeppelin Hardhat Upgrades stores important tracking info in there. I deployed on Arbitrum Sepolia, deleted the folder, and then tried to upgrade. It failed. But when I deployed and upgraded on `hardhat_on_localhost`, everything worked without creating the folder. It's said to be possible to force an upgrade without the folder, but I haven't tried it.

- Only if you are dealing with a mainnet or a testnet, execute `../runners/run-register-cosmic-signature-contracts-<network-name>.bash`. It will verify and register the source code of the deployed Cosmic Signature contracts on ArbiScan.

- Only if you are dealing with a mainnet or a testnet, on ArbiScan, examine the deployed contract addresses. Make sure the evidence of the registration is there, especially that of the game contract proxy and implementation.

#### Notes

- Near Comment-202610237, the deployment task logs only the public deployer address. Resolved credentials are never serialized with the configuration or included in the deployment report.

#### Caveats

- ArbiScan returns an "already verified" error if another contract with the same source code has already been verified/registered. Hardhat Verify ignores the error, but OpenZeppelin Hardhat Upgrades does not when registering a proxy contract. Near Comment-202509125, I have implemented logic that ignores that error.

- If a proxy and/or implementation contract registration failed with the "already verifified" error, sometimes it also fails to link the proxy with the implementation. If you observe such an error, link them manually on ArbiScan.

#### Afterwards

- Make sure Git branch changes contain no secrets.

- Commit and push the exact deployment sources and configuration, the `../output/` reports, and the `../runners/.openzeppelin/` manifest. Keep deployment-specific changes on this branch so the deployed build can be reproduced.

- Consider copying some of your changes back to the `main` branch.

- Switch back to the `main` branch.

- Clear the temporary credentials and close the dedicated session.

  ```bash
  unset HARDHAT_VAR_deployerPrivateKey_arbitrumOne HARDHAT_VAR_etherScanApiKey_arbitrumOne
  exit
  ```

- If an earlier workflow saved credentials with `hardhat vars set`, first confirm their secure backup, then use `npx hardhat vars delete deployerPrivateKey_<network-name>` and `npx hardhat vars delete etherScanApiKey_<network-name>`. Deleting a stored entry does not revoke a key or erase copies from older logs or backups. Never inspect the values with `vars get` when checking cleanup.
