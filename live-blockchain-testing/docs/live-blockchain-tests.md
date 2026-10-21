### Smoke-Testing Cosmic Signature Contracts On A Live Blockchain

#### About This Document

The old version of this document is named `live-blockchain-tests-old.md`. I recommend that you review it. The general idea remains mostly the same.

#### Introduction

This test allows to smoke-test the newly deployed Cosmic Signature contracts and their integration with the `RandomWalkNFT` contract that was deployed in the past. You will have to later abandon the newly deployed contracts and deploy them again to be used in the production.

This test currently tests only V1. It's not aware of V2+.

The following blockchains are supported: Hardhat Network (a local blockchain), Arbitrum Sepolia (a testnet), Arbitrum One (a mainnet).

All scripts assume that they are executed from the folder they are located in. So you must `cd` to the script's folder and execute the script like `./my-script.bash`.

#### Review And Edit The Configuration File

- The file to edit is `../src/live-blockchain-tests-configuration.js`. You don't need to change most settings, but review them and their comments.

- `hardhat.networkName` specifies the blockchain to be used by Hardhat. Start with testing on `hardhat_on_localhost`.

- In `cosmicSignatureContractsDeployment.randomWalkNftAddress`, you have an option to provide an already deployed `RandomWalkNFT` contract address.

- In `cosmicSignatureGamePlaying.randomWalkNftIds`, you have an option to provide Random Walk NFTs already held by the generated test signers.

#### Supply The Account Seed For This Terminal Session

- For accounts that will hold funds, generate a cryptographically random uint256 seed with a secure password manager and keep a secure backup before funding them. Enter the hex value at a hidden prompt; do not paste it into a command, save it with `hardhat vars set`, or write it to a configuration file. The seed derives every test account, so treat it like a private key. See Comment-202508313 for more info.

  ```bash
  /bin/bash
  set +x
  unset DEBUG
  trap 'unset HARDHAT_VAR_accountPrivateKeySeed' EXIT
  read -r -s -p 'Secret account seed (0x followed by 64 hex digits): ' HARDHAT_VAR_accountPrivateKeySeed
  printf '\n'
  export HARDHAT_VAR_accountPrivateKeySeed
  ```

- Run both the initial and later test runs in this same session, or supply the same backed-up seed again. The public default seed remains suitable only for disposable local accounts. Environment variables are not encryption and are readable by the process and its children.

#### First (Failing) Run And Account Funding

- If you are to run the test on Hardhat Network, in another terminal, launch `${workspaceFolder}/scripts/hardhat-node.bash`.

- From `live-blockchain-testing/runners/`, execute `./live-blockchain-tests.bash`.\
  It will quickly fail because the owner account has no ETH, but first it will log the account names and public addresses. It does not log the seed or private keys.

- Internally, the test uses a few accounts. Their private keys are generated from `HARDHAT_VAR_accountPrivateKeySeed`. One of them is nicknamed "owner". That's the one you need to transfer some ETH to.\
  There is a script named `../runners/fund-default-owner-account-with-eth.bash`. It transfers some ETH within the Hardhat Network running on localhost. Destination is the owner account whose private key seed exists in the Git repo (insecure). You can copy and modify the script to transfer ETH to your secure owner. But on a public blockchain you will need to manually transfer ETH to the owner account.

#### Run The Test

- From `live-blockchain-testing/runners/`, execute `./live-blockchain-tests.bash`.\
  It will run for about a minute.

- The test saves deployed contract addresses to the `../output/deploy-cosmic-signature-contracts-report-<network-name>-<cosmic-signature-game-contract-name>.json` file. If something goes wrong you might need to use some of those addresses to get your assets back.

- If the report already exists, the deployment step will be skipped and addresses in it will be reused without checking that their bytecode still matches the source.

#### Get Your Assets Back

- Besides the owner, there are a few more involved accounts. Keep the secure seed backup until every account's assets have been retrieved. The account names and addresses are logged; the same seed recreates their signers for another test run. Do not rely on logs or output JSON files to recover private keys.

- If everything worked as designed, retrieve ETH from each involved account. Donated Random Walk NFTs are retrieved by the main-prize winner (bidder2 in this scenario).

- If not everything worked as designed, you might need to start with withdrawing ETH and donated NFTs from `PrizesWallet` and ETH from the Game contract. The test logs what was deposited to `PrizesWallet` and the Game contract ETH balance. By default, the test is configured to deploy `SelfDestructibleCosmicSignatureGame`. Call `finalizeTesting` on it to get your ETH back.\
  Comment-202509304 relates and/or applies.

#### Caveats

- In `${workspaceFolder}/tasks/docs/Cosmic-Signature-Contracts-Deployment-And-Registration.md` see a note about the `.openzeppelin` subfolder. Make sure your test deployments do not get mixed up with your production ones within the same file under the subfolder.

- Near Comment-202610239, Hardhat Preprocesor together with asserts and SMTChecker are enabled for this test. As a result, if you attempt to run this test on a mainnet, it would fail to start due to an error thrown near Comment-202408261. So, to run this test on a mainnet, temporarily modify the code by either: (1) near Comment-202610239, comment out the setting of the `ENABLE_HARDHAT_PREPROCESSOR` environment variable; or (2) near Comment-202408261, comment out the error throwing.

#### Afterwards

- Revert any temporary edits you have made.

- Move or delete the `.openzeppelin` subfolder.

- Preserve the deployment reports needed for retrieval. New generated deployment configurations contain an empty `deployerPrivateKey`; the actual key is passed directly in memory. Files and logs from older runs may contain private keys and need separate cleanup after confirming secure account recovery.

- Clear the temporary seed and close the dedicated session:

  ```bash
  unset HARDHAT_VAR_accountPrivateKeySeed
  exit
  ```

- If an earlier run saved the seed with `hardhat vars set`, confirm its secure backup and remove that stored entry with `npx hardhat vars delete accountPrivateKeySeed`. This does not erase older logs or backups. Do not print the stored value to inspect it.
