### Cosmic Signature Contracts Deployment And Registration

#### Introduction

This is a guide on how to deploy and register the production Cosmic Signature contracts on local and live blockchains.

The following blockchains are supported: Hardhat Network (a local blockchain), Arbitrum Sepolia (a testnet), Arbitrum One (a mainnet).

All scripts assume that they are executed from the folder they are located in. So you must `cd` to the script's folder and execute the script like `./my-script.bash`.

You can start Hardhat Network by executing "${workspaceFolder}/scripts/hardhat-node.bash".

#### Create API Keys

 - If you are dealing with a testnet or mainnet, you need an EtherScan API key. It will work for all blockchains, and on ArbiScan as well.\
 At some point they switched to V2 of their API, so old API keys aren't necessarily going to work. So you might need to get a new one.

#### Create Blockchain Accounts

- If you are dealing with a local blockchain, skip this section. We will use existing accounts.

- Create a deployer account and transfer some ETH to it.

- You can postpone this step. Optionally, create a charity account. On a testnet, you can use your own account. On a mainnet, you might want to find an account belonging to a real charity.

#### Edit Configuration Files

- "../config/deploy-cosmic-signature-contracts-config-&lt;network_name&gt;.json"\
These files are in the Git repo, so don't include sensitive info in them.\
For a local blockchain, it's OK to set `deployerPrivateKey` to a well known account private key. For a testnet or mainnet, leave it empty, so that it was taken from a Hardhat configuration variable.\
Set `randomWalkNftAddress` to where the contract has been deployed. If you leave it empty or zero, it will be deployed, which is typically the right thing to do on a local blockchain.\
Set `charityAddress` to your charity address. Or leave it empty or zero and later set it by making a call to `CharityWallet`.
You probably don't need to change any other arguments.

#### Create Hardhat Configuration Variables

Save some arguments to Hardhat Configuration Variables. If you are dealing with a local blockchain, skip this section.

- `npx hardhat vars set deployerPrivateKey_<network_name> 0x_YOUR_DEPLOYER_PRIVATE_KEY_HERE`

- `npx hardhat vars set etherScanApiKey_<network_name> YOUR_ETHERSCAN_API_KEY_HERE`

#### Run Scripts

- Execute "../runners/run-deploy-cosmic-signature-contracts-&lt;network_name&gt;.bash". It will deploy Cosmic Signature contracts.

- Observe the newly created "../output/deploy-cosmic-signature-contracts-report-&lt;network_name&gt;.json" file. It contains addresses of all deployed contracts. Save it to a more reliable location, but leave the original in-place, so that other scripts could use it.

- Only if you are dealing with a mainnet or a testnet, execute "../runners/run-register-cosmic-signature-contracts-&lt;network_name&gt;.bash". It will verify and register the source code of the previously deployed Cosmic Signature contracts on ArbiScan.

- Only if you are dealing with a mainnet or a testnet, on ArbiScan, examine the deployed contract addresses. Make sure the evidence of the registration is there, especially that of the game contract proxy and implementation.

#### Caveats

- ArbiScan returns an "already verified" error if another contract with the same source code has already been verified/registered. Hardhat Verify ignores the error, but OpenZeppelin Hardhat Upgrades does not when registering a proxy contract. Near Comment-202509125, I have implemented logic that ignores that error.

- If a proxy and/or implementation contract registration failed with the "already verifified" error, sometimes it also fails to link the proxy with the implementation. If you observe such an error, link them manually on ArbiScan.

- After you deploy to a mainnet or a testnet, you will notice the ".openzeppelin" subfolder under the folder in which you ran the deployment scripts. OpenZeppelin Hardhat Upgrades is said to store important info there. I deployed on Arbitrum Sepolia, deleted the folder, and then tried to upgrade. It failed. But when I deployed and upgraded on hardhat_on_localhost, everything worked without creating the folder. It's said to be possible to force an upgrade without the folder, but I haven't tried it.\
So after the deployment, you probably should move the folder to a location outside the project. When you are about to upgrade, move it back, upgrade, and then move it away again.

#### Afterwards

- Consider deleting sensitive info.

	- `npx hardhat vars delete deployerPrivateKey_<network_name>`

	- `npx hardhat vars delete etherScanApiKey_<network_name>`

- Move the ".openzeppelin" subfolder outside the project.
